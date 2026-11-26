import { describe, expect, it } from "vitest";
import { generateExamsIcs } from "./ics";

describe("generateExamsIcs", () => {
  it("generates valid RFC 5545 events for timed and all-day exams and skips TBD dates", () => {
    const { icsContent, exportedCount, skippedCount } = generateExamsIcs(
      [
        {
          courseCode: "CS 301",
          courseTitle: "Data Structures, Algorithms",
          instructorName: "Dr. Maya Chen",
          exam: {
            id: "exam_1",
            title: "Midterm Exam 1",
            date: "2026-10-14",
            time: "10:00 AM - 11:30 AM",
            location: "Room MC 204",
            weight: "20%",
            notes: "Closed book; Chapters 1-5",
          },
        },
        {
          courseCode: "CS 301",
          courseTitle: "Data Structures, Algorithms",
          exam: {
            id: "exam_2",
            title: "Final Exam",
            date: "2026-12-15",
            time: "",
            location: "Exam Hall A",
            weight: "35%",
            notes: "",
          },
        },
        {
          courseCode: "CS 301",
          courseTitle: "Data Structures, Algorithms",
          exam: {
            id: "exam_3",
            title: "Makeup Quiz",
            date: "TBD",
            time: "",
            location: "",
            weight: "5%",
            notes: "",
          },
        },
      ],
      "CS 301 Exams",
      new Date("2026-09-01T12:00:00Z")
    );

    expect(exportedCount).toBe(2);
    expect(skippedCount).toBe(1);
    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain("END:VCALENDAR");
    expect(icsContent).toContain("DTSTART:20261014T100000");
    expect(icsContent).toContain("DTEND:20261014T113000");
    expect(icsContent).toContain("DTSTART;VALUE=DATE:20261215");
    expect(icsContent).toContain("DTEND;VALUE=DATE:20261216");
    expect(icsContent).toContain("TRIGGER:-P7D");
    expect(icsContent).toContain("TRIGGER:-P1D");
    expect(icsContent).toContain("SUMMARY:CS 301: Midterm Exam 1");
    // Escaped comma & semicolon
    expect(icsContent).toContain("Data Structures\\, Algorithms");
    expect(icsContent).toContain("Closed book\\; Chapters 1-5");
  });
});
