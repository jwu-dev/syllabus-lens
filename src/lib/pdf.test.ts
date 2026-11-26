import { describe, expect, it } from "vitest";
import { parseSyllabusFromLayout } from "./heuristic-parser";
import { buildLayoutDocumentFromPages, type PdfSpan } from "./pdf";

describe("buildLayoutDocumentFromPages (layout-aware PDF reconstruction)", () => {
  it("clusters visual table rows by y-coordinate, detects headings by font size, and stops section bleed without keyword lists", () => {
    const page1: PdfSpan[] = [
      // Title (large font)
      { text: "MECH 310: Thermodynamics", x: 50, y: 740, width: 220, fontSize: 16, fontName: "F2-Bold", isBold: true },
      { text: "Winter 2027", x: 50, y: 720, width: 80, fontSize: 10.5, fontName: "F1", isBold: false },

      // Visual 2-column table (no colons!) for Instructor info
      { text: "Instructor", x: 50, y: 690, width: 55, fontSize: 10.5, fontName: "F2-Bold", isBold: true },
      { text: "Dr. Samira Al-Mansoor", x: 180, y: 690, width: 130, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "Email", x: 50, y: 674, width: 35, fontSize: 10.5, fontName: "F2-Bold", isBold: true },
      { text: "samira@uni.edu", x: 180, y: 674, width: 100, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "Office", x: 50, y: 658, width: 38, fontSize: 10.5, fontName: "F2-Bold", isBold: true },
      { text: "EV 4.210", x: 180, y: 658, width: 55, fontSize: 10.5, fontName: "F1", isBold: false },

      // Larger-font Textbooks heading
      { text: "Textbooks", x: 50, y: 620, width: 80, fontSize: 13, fontName: "F2-Bold", isBold: true },
      { text: "Fundamentals of Engineering Thermodynamics, Michael J. Moran, 9th Edition, Wiley, 2018", x: 50, y: 602, width: 420, fontSize: 10.5, fontName: "F1", isBold: false },

      // Arbitrary custom visual heading (NOT in any predefined list!) that must end the textbooks section
      { text: "Wind Tunnel Safety Briefing", x: 50, y: 560, width: 190, fontSize: 13, fontName: "F2-Bold", isBold: true },
      { text: "Safety goggles must be worn inside the laboratory at all times during experiments.", x: 50, y: 542, width: 410, fontSize: 10.5, fontName: "F1", isBold: false },

      // Larger-font Grading heading with a stray policy % alongside 100%-summing items
      { text: "Grading Scheme", x: 50, y: 500, width: 120, fontSize: 13, fontName: "F2-Bold", isBold: true },
      { text: "Labs", x: 50, y: 482, width: 30, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "25%", x: 220, y: 482, width: 25, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "Midterm Exam", x: 50, y: 466, width: 80, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "30%", x: 220, y: 466, width: 25, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "Final Exam", x: 50, y: 450, width: 65, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "45%", x: 220, y: 450, width: 25, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "Bonus survey credit", x: 50, y: 434, width: 100, fontSize: 10.5, fontName: "F1", isBold: false },
      { text: "2%", x: 220, y: 434, width: 18, fontSize: 10.5, fontName: "F1", isBold: false },
    ];

    const layout = buildLayoutDocumentFromPages([page1], 1);

    // Heading detection should tag "Wind Tunnel Safety Briefing" visually
    const safetyHeading = layout.blocks.find((b) => b.text === "Wind Tunnel Safety Briefing");
    expect(safetyHeading?.kind).toBe("heading");

    // Table row reconstruction should split columns cleanly
    const instructorRow = layout.blocks.find((b) => b.cells[0] === "Instructor");
    expect(instructorRow?.kind).toBe("table_row");
    expect(instructorRow?.cells).toEqual(["Instructor", "Dr. Samira Al-Mansoor"]);

    const parsed = parseSyllabusFromLayout(layout);

    expect(parsed.courseCode).toBe("MECH 310");
    expect(parsed.term).toBe("Winter 2027");
    expect(parsed.instructor.name).toBe("Dr. Samira Al-Mansoor");
    expect(parsed.instructor.email).toBe("samira@uni.edu");
    expect(parsed.instructor.officeLocation).toBe("EV 4.210");

    // Textbooks stops at visual heading "Wind Tunnel Safety Briefing"
    expect(parsed.textbooks).toHaveLength(1);
    expect(parsed.textbooks[0]).toMatchObject({
      title: "Fundamentals of Engineering Thermodynamics",
      authors: "Michael J. Moran",
      edition: "9th Edition",
    });

    // Subset-sum validation selects the contiguous 25% + 30% + 45% = 100% group (excluding stray 2% bonus)
    expect(parsed.gradingScheme.map((g) => ({ name: g.name, weight: g.weight }))).toEqual([
      { name: "Labs", weight: 25 },
      { name: "Midterm Exam", weight: 30 },
      { name: "Final Exam", weight: 45 },
    ]);
  });
});
