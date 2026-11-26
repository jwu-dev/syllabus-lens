import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSyllabusHeuristically } from "./heuristic-parser";
import { extractPdfText } from "./pdf";

const SAMPLE_SYLLABUS_TEXT = `
CS 301: Data Structures and Algorithms
Department of Computer Science — Fall 2026 Course Outline

1. Instructor Information
Instructor: Dr. Maya Chen
Email: maya.chen@university.edu
Office: Engineering Building, Room 412B
Office Hours: Tuesdays & Thursdays, 2:00 PM - 3:30 PM
Teaching Assistants: Jordan Patel (j.patel@university.edu); Sofia Alvarez (s.alvarez@university.edu)

2. Exam Dates
- Midterm Exam 1: October 14, 2026 | 10:00 AM - 11:30 AM | Room MC 204 | 20% | Closed book, covers Chapters 1-5
- Midterm Exam 2: November 18, 2026 | 10:00 AM - 11:30 AM | Room MC 204 | 20% | One double-sided cheat sheet allowed
- Final Exam: December 15, 2026 | 2:00 PM - 5:00 PM | Exam Hall A | 35% | Cumulative

3. Textbooks
Required Textbooks:
- Introduction to Algorithms by Thomas H. Cormen, Charles E. Leiserson, 4th Edition, ISBN: 978-0262046305
Suggested Textbooks:
- Algorithms by Robert Sedgewick and Kevin Wayne, 4th Edition, ISBN: 978-0321573513 (Suggested)

4. Suggested Exercises
- Week 1-2 Asymptotic Analysis (Ch. 3): Exercises 3.1-1, 3.1-4, Problems 3-2
- Week 7-9 Dynamic Programming (Ch. 14): Exercises 14.1-3, 14.2-1, Problems 14-2

5. Grading Scheme
- Weekly Programming Assignments (best 5 of 6): 20%
- Lab Participation & Quizzes: 5%
- Midterm Exam 1: 20%
- Midterm Exam 2: 20%
- Final Exam: 35%
`;

describe("parseSyllabusHeuristically", () => {
  it("extracts course header, instructor, exams, textbooks, exercises, and grading scheme", () => {
    const result = parseSyllabusHeuristically(SAMPLE_SYLLABUS_TEXT, { pageCount: 2 });

    expect(result.courseCode).toBe("CS 301");
    expect(result.courseTitle).toBe("Data Structures and Algorithms");
    expect(result.term).toBe("Fall 2026");
    expect(result.department).toContain("Computer Science");

    expect(result.instructor.name).toBe("Dr. Maya Chen");
    expect(result.instructor.email).toBe("maya.chen@university.edu");
    expect(result.instructor.officeLocation).toContain("Room 412B");
    expect(result.instructor.officeHours).toContain("2:00 PM - 3:30 PM");
    expect(result.instructor.teachingAssistants).toHaveLength(2);

    expect(result.exams).toHaveLength(3);
    expect(result.exams[0]).toMatchObject({
      title: "Midterm Exam 1",
      date: "2026-10-14",
      time: "10:00 AM - 11:30 AM",
      weight: "20%",
    });
    expect(result.exams[2]).toMatchObject({
      title: "Final Exam",
      date: "2026-12-15",
      weight: "35%",
    });

    expect(result.textbooks).toHaveLength(2);
    expect(result.textbooks[0]).toMatchObject({
      title: "Introduction to Algorithms",
      requirement: "required",
      isbn: "978-0262046305",
    });
    expect(result.textbooks[1]).toMatchObject({
      title: "Algorithms",
      requirement: "suggested",
      isbn: "978-0321573513",
    });

    expect(result.exercises).toHaveLength(2);
    expect(result.exercises[0].problems).toContain("3.1-1");
    expect(result.exercises[0].weekOrDue).toBe("Week 1-2");

    expect(result.gradingScheme).toHaveLength(5);
    const totalWeight = result.gradingScheme.reduce((sum, item) => sum + item.weight, 0);
    expect(totalWeight).toBe(100);
    expect(result.extractionMethod).toBe("local");
  });

  it("adds a helpful scanned-PDF warning when almost no text is present", () => {
    const result = parseSyllabusHeuristically("   ");
    expect(result.extractionWarnings.some((w) => w.toLowerCase().includes("scanned"))).toBe(true);
  });

  it("extracts structured syllabus fields end-to-end from the generated sample PDF", async () => {
    const pdfPath = path.join(process.cwd(), "public", "sample-syllabus.pdf");
    const pdfBytes = new Uint8Array(await readFile(pdfPath));
    const { text, pageCount } = await extractPdfText(pdfBytes);

    expect(pageCount).toBeGreaterThanOrEqual(1);
    const result = parseSyllabusHeuristically(text, { pageCount });

    expect(result.courseCode).toBe("CS 301");
    expect(result.instructor.name).toBe("Dr. Maya Chen");
    expect(result.exams.length).toBeGreaterThanOrEqual(3);
    expect(result.textbooks.length).toBeGreaterThanOrEqual(2);
    expect(result.exercises.length).toBeGreaterThanOrEqual(3);
    expect(result.gradingScheme.reduce((sum, g) => sum + g.weight, 0)).toBe(100);
  });

  it("handles wrapped citations, book URLs, inline prose grading, and letter-grade scales cleanly", () => {
    const realWorldSyllabus = `
ELEC 260: Continuous-Time Signals and Systems
Fall 2026

Instructor: Dr. Alex Rivera

Textbooks:
Signals and Systems, Michael D. Adams, Ed. 6.0
Free version of the book:
https://www.ece.uvic.ca/~frodo/sigsysbook/downloads/signals_and_systems-6.0.pdf
Suggested Textbooks:
Signals and Systems: Analysis Using Transform Methods and Matlab, Michael J
Roberts, , McGraw-Hill, 2011

Course Content
This course covers continuous-time signals, LTI systems, Fourier series, and Laplace transforms.
Students are expected to attend all lectures and tutorials regularly.

Grading Scheme
The final grade will be calculated as follows: Tutorials (20%), Midterm (30%),
and Final exam (50%).
A-, A, A+: Overall mark of 80% or higher
B-, B, B+: Overall mark of 68% - 79%
C-, C, C+: Overall mark of 56% - 67%
D-, D, D+: Overall mark of 50% - 55%
F: Overall mark below 50%
`;

    const result = parseSyllabusHeuristically(realWorldSyllabus);

    // Textbooks: exactly 2 clean entries (URL attached as note, wrapped citation merged, Course Content excluded)
    expect(result.textbooks).toHaveLength(2);
    expect(result.textbooks[0]).toMatchObject({
      title: "Signals and Systems",
      authors: "Michael D. Adams",
      edition: "Ed. 6.0",
      requirement: "required",
    });
    expect(result.textbooks[0].notes).toContain("signals_and_systems-6.0.pdf");

    expect(result.textbooks[1]).toMatchObject({
      title: "Signals and Systems: Analysis Using Transform Methods and Matlab",
      authors: "Michael J Roberts",
      requirement: "suggested",
    });

    // Grading scheme: exactly 3 components totaling 100%, no letter-grade scale rows!
    expect(result.gradingScheme).toHaveLength(3);
    expect(result.gradingScheme.map((g) => ({ name: g.name, weight: g.weight }))).toEqual([
      { name: "Tutorials", weight: 20 },
      { name: "Midterm", weight: 30 },
      { name: "Final exam", weight: 50 },
    ]);
    expect(result.gradingScheme.reduce((s, g) => s + g.weight, 0)).toBe(100);
  });
});
