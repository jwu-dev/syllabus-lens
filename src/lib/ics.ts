import type { CourseOutline, ExamItem } from "./types";

export interface CalendarExamEntry {
  courseCode: string;
  courseTitle: string;
  instructorName?: string;
  exam: ExamItem;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string): string {
  const maxLen = 75;
  if (line.length <= maxLen) return line;
  const parts: string[] = [];
  let remaining = line;
  while (remaining.length > maxLen) {
    parts.push(remaining.slice(0, maxLen));
    remaining = " " + remaining.slice(maxLen);
  }
  parts.push(remaining);
  return parts.join("\r\n");
}

function parseIsoDate(dateStr: string): { year: number; month: number; day: number } | null {
  const isoMatch = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
  }
  const parsed = Date.parse(dateStr);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    };
  }
  return null;
}

interface ParsedTimeRange {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

function parseSingleTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseTimeRange(timeStr: string): ParsedTimeRange | null {
  if (!timeStr.trim()) return null;
  const rangeMatch = timeStr.match(
    /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
  );
  if (rangeMatch) {
    const start = parseSingleTime(rangeMatch[1]);
    const end = parseSingleTime(rangeMatch[2]);
    if (start && end) {
      return {
        startHour: start.hour,
        startMinute: start.minute,
        endHour: end.hour,
        endMinute: end.minute,
      };
    }
  }
  const singleMatch = timeStr.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (singleMatch) {
    const start = parseSingleTime(singleMatch[1]);
    if (start) {
      const endHour = Math.min(23, start.hour + 2);
      return {
        startHour: start.hour,
        startMinute: start.minute,
        endHour,
        endMinute: start.minute,
      };
    }
  }
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateYmd(year: number, month: number, day: number): string {
  return `${year}${pad2(month)}${pad2(day)}`;
}

function addOneDay(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day + 1));
  return formatDateYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function formatUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

export function generateExamsIcs(
  entries: CalendarExamEntry[],
  calendarName = "SyllabusLens Exam Schedule",
  now: Date = new Date()
): { icsContent: string; exportedCount: number; skippedCount: number } {
  const dtstamp = formatUtcStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SyllabusLens//Course Outline Exam Exporter//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  let exportedCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    const parsedDate = parseIsoDate(entry.exam.date);
    if (!parsedDate) {
      skippedCount += 1;
      continue;
    }

    exportedCount += 1;
    const timeRange = parseTimeRange(entry.exam.time);
    const uid = `${entry.exam.id}@syllabuslens.local`;
    const summary = `${entry.courseCode}: ${entry.exam.title}`;

    const descriptionParts: string[] = [
      `Course: ${entry.courseCode}${entry.courseTitle ? ` — ${entry.courseTitle}` : ""}`,
    ];
    if (entry.exam.weight) descriptionParts.push(`Weight: ${entry.exam.weight}`);
    if (entry.instructorName) descriptionParts.push(`Instructor: ${entry.instructorName}`);
    if (entry.exam.notes) descriptionParts.push(`Notes: ${entry.exam.notes}`);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);

    const ymd = formatDateYmd(parsedDate.year, parsedDate.month, parsedDate.day);
    if (timeRange) {
      const startStamp = `${ymd}T${pad2(timeRange.startHour)}${pad2(timeRange.startMinute)}00`;
      const endStamp = `${ymd}T${pad2(timeRange.endHour)}${pad2(timeRange.endMinute)}00`;
      lines.push(`DTSTART:${startStamp}`);
      lines.push(`DTEND:${endStamp}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd}`);
      lines.push(`DTEND;VALUE=DATE:${addOneDay(parsedDate.year, parsedDate.month, parsedDate.day)}`);
    }

    lines.push(foldLine(`SUMMARY:${escapeIcsText(summary)}`));
    if (entry.exam.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(entry.exam.location)}`));
    }
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`));

    // 7-day reminder
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("TRIGGER:-P7D");
    lines.push(foldLine(`DESCRIPTION:Upcoming in 1 week: ${escapeIcsText(summary)}`));
    lines.push("END:VALARM");

    // 1-day reminder
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push("TRIGGER:-P1D");
    lines.push(foldLine(`DESCRIPTION:Tomorrow: ${escapeIcsText(summary)}`));
    lines.push("END:VALARM");

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return {
    icsContent: lines.join("\r\n") + "\r\n",
    exportedCount,
    skippedCount,
  };
}

export function courseToCalendarEntries(course: CourseOutline): CalendarExamEntry[] {
  return course.exams.map((exam) => ({
    courseCode: course.courseCode,
    courseTitle: course.courseTitle,
    instructorName: course.instructor.name,
    exam,
  }));
}
