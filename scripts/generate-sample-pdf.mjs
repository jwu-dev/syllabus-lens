import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function generateSampleSyllabusPdf() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 52;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed = 24) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawTitle = (text) => {
    ensureSpace(32);
    page.drawText(text, {
      x: margin,
      y,
      size: 18,
      font: bold,
      color: rgb(0.11, 0.16, 0.35),
    });
    y -= 24;
  };

  const drawSubtitle = (text) => {
    ensureSpace(20);
    page.drawText(text, {
      x: margin,
      y,
      size: 11,
      font,
      color: rgb(0.32, 0.37, 0.45),
    });
    y -= 18;
  };

  const drawHeading = (text) => {
    y -= 10;
    ensureSpace(28);
    page.drawText(text, {
      x: margin,
      y,
      size: 13,
      font: bold,
      color: rgb(0.15, 0.24, 0.56),
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.75,
      color: rgb(0.82, 0.85, 0.92),
    });
    y -= 16;
  };

  const drawLine = (text, indent = 0) => {
    ensureSpace(18);
    page.drawText(text, {
      x: margin + indent,
      y,
      size: 10.5,
      font,
      color: rgb(0.12, 0.15, 0.2),
    });
    y -= 15;
  };

  drawTitle("CS 301: Data Structures and Algorithms");
  drawSubtitle("Department of Computer Science — Fall 2026 Course Outline");
  drawSubtitle("Lectures: Mondays & Wednesdays, 10:00 AM - 11:30 AM, Hall MC 204");

  drawHeading("1. Instructor Information");
  drawLine("Instructor: Dr. Maya Chen");
  drawLine("Email: maya.chen@university.edu");
  drawLine("Office: Engineering Building, Room 412B");
  drawLine("Office Hours: Tuesdays & Thursdays, 2:00 PM - 3:30 PM (or by appointment)");
  drawLine("Teaching Assistants: Jordan Patel (j.patel@university.edu); Sofia Alvarez (s.alvarez@university.edu)");

  drawHeading("2. Course Description");
  drawLine("This course introduces core algorithmic paradigms and data structures including");
  drawLine("asymptotic analysis, balanced search trees, heaps, graph algorithms, greedy");
  drawLine("strategies, divide-and-conquer, and dynamic programming.");

  drawHeading("3. Exam Dates");
  drawLine("- Midterm Exam 1: October 14, 2026 | 10:00 AM - 11:30 AM | Room MC 204 | 20% | Closed book, covers Chapters 1-5");
  drawLine("- Midterm Exam 2: November 18, 2026 | 10:00 AM - 11:30 AM | Room MC 204 | 20% | One double-sided cheat sheet allowed, covers Chapters 6-9");
  drawLine("- Final Exam: December 15, 2026 | 2:00 PM - 5:00 PM | Exam Hall A | 35% | Cumulative, closed book");

  drawHeading("4. Textbooks");
  drawLine("Required Textbooks:");
  drawLine("- Introduction to Algorithms by Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, 4th Edition, ISBN: 978-0262046305");
  drawLine("- Algorithm Design by Jon Kleinberg and Eva Tardos, 1st Edition, ISBN: 978-0321295354");
  drawLine("Suggested Textbooks:");
  drawLine("- Algorithms by Robert Sedgewick and Kevin Wayne, 4th Edition, ISBN: 978-0321573513 (Suggested)");
  drawLine("- The Algorithm Design Manual by Steven S. Skiena, 3rd Edition, ISBN: 978-3030542559 (Recommended)");

  drawHeading("5. Suggested Exercises");
  drawLine("- Week 1-2 Asymptotic Analysis (Ch. 3): Exercises 3.1-1, 3.1-4, 3.2-2, Problems 3-2, 3-4");
  drawLine("- Week 3-4 Divide and Conquer (Ch. 4): Exercises 4.1-2, 4.3-1, 4.5-1, Problems 4-1, 4-5");
  drawLine("- Week 5-6 Heaps & Balanced Trees (Ch. 6 & 13): Exercises 6.2-1, 6.4-3, 13.2-1, 13.3-2");
  drawLine("- Week 7-9 Dynamic Programming (Ch. 14): Exercises 14.1-3, 14.2-1, 14.4-2, Problems 14-2, 14-4");
  drawLine("- Week 10-12 Graph Algorithms & Shortest Paths (Ch. 20 & 22): Exercises 20.2-4, 20.4-1, 22.3-2, 22.3-6");

  drawHeading("6. Grading Scheme");
  drawLine("- Weekly Programming Assignments (best 5 of 6): 20%");
  drawLine("- Lab Participation & Quizzes: 5%");
  drawLine("- Midterm Exam 1: 20%");
  drawLine("- Midterm Exam 2: 20%");
  drawLine("- Final Exam (must earn at least 40% to pass): 35%");

  const bytes = await pdfDoc.save();
  const outDir = path.join(process.cwd(), "public");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "sample-syllabus.pdf");
  await writeFile(outPath, bytes);
  console.log(`Generated sample syllabus PDF at ${outPath} (${bytes.length} bytes)`);
}

generateSampleSyllabusPdf().catch((err) => {
  console.error(err);
  process.exit(1);
});
