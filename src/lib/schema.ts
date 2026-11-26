import { z } from "zod";
import type { ExtractedSyllabus, ExtractionMethod } from "./types";

const safeString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => (val === null || val === undefined ? "" : String(val).trim()));

const safeNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/[^0-9.-]/g, "");
      const parsed = Number.parseFloat(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  });

export const aiSyllabusResponseSchema = z.object({
  courseCode: safeString.default(""),
  courseTitle: safeString.default(""),
  term: safeString.default(""),
  department: safeString.default(""),
  instructor: z
    .object({
      name: safeString.default(""),
      email: safeString.default(""),
      officeLocation: safeString.default(""),
      officeHours: safeString.default(""),
      teachingAssistants: z
        .array(safeString)
        .default([])
        .transform((arr) => arr.filter(Boolean)),
    })
    .default({
      name: "",
      email: "",
      officeLocation: "",
      officeHours: "",
      teachingAssistants: [],
    }),
  exams: z
    .array(
      z.object({
        title: safeString.default("Exam"),
        date: safeString.default(""),
        time: safeString.default(""),
        location: safeString.default(""),
        weight: safeString.default(""),
        notes: safeString.default(""),
      })
    )
    .default([]),
  textbooks: z
    .array(
      z.object({
        title: safeString.default(""),
        authors: safeString.default(""),
        edition: safeString.default(""),
        isbn: safeString.default(""),
        requirement: z
          .string()
          .optional()
          .transform((val): "required" | "suggested" => {
            const lower = (val ?? "").toLowerCase();
            if (
              lower.includes("suggest") ||
              lower.includes("recommend") ||
              lower.includes("optional") ||
              lower.includes("supplement")
            ) {
              return "suggested";
            }
            return "required";
          }),
        notes: safeString.default(""),
      })
    )
    .default([]),
  exercises: z
    .array(
      z.object({
        topic: safeString.default(""),
        problems: safeString.default(""),
        textbook: safeString.default(""),
        weekOrDue: safeString.default(""),
      })
    )
    .default([]),
  gradingScheme: z
    .array(
      z.object({
        name: safeString.default(""),
        weight: safeNumber.default(0),
        notes: safeString.default(""),
      })
    )
    .default([]),
});

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function normalizeExtractedSyllabus(
  raw: unknown,
  method: ExtractionMethod,
  warnings: string[] = [],
  meta?: { pageCount?: number; rawTextPreview?: string }
): ExtractedSyllabus {
  const parsed = aiSyllabusResponseSchema.parse(raw);

  const gradingScheme = parsed.gradingScheme
    .filter((item) => item.name.length > 0 || item.weight > 0)
    .map((item) => ({
      id: createId("grade"),
      name: item.name || "Component",
      weight: Math.max(0, Math.min(100, Math.round(item.weight * 100) / 100)),
      notes: item.notes,
      score: null,
    }));

  const finalWarnings = [...warnings];
  const totalWeight = gradingScheme.reduce((sum, g) => sum + g.weight, 0);
  if (gradingScheme.length > 0 && Math.abs(totalWeight - 100) > 0.5) {
    finalWarnings.push(
      `Grading scheme weights currently sum to ${Math.round(totalWeight * 10) / 10}% (expected 100%). Review in the Grading tab.`
    );
  }

  return {
    courseCode: parsed.courseCode || "COURSE",
    courseTitle: parsed.courseTitle || "Untitled Course Outline",
    term: parsed.term,
    department: parsed.department,
    instructor: parsed.instructor,
    exams: parsed.exams
      .filter((e) => e.title.length > 0 || e.date.length > 0)
      .map((e) => ({
        id: createId("exam"),
        ...e,
      })),
    textbooks: parsed.textbooks
      .filter((t) => t.title.length > 0)
      .map((t) => ({
        id: createId("book"),
        ...t,
      })),
    exercises: parsed.exercises
      .filter((ex) => ex.topic.length > 0 || ex.problems.length > 0)
      .map((ex) => ({
        id: createId("ex"),
        ...ex,
        completed: false,
      })),
    gradingScheme,
    extractionMethod: method,
    extractionWarnings: finalWarnings,
    pageCount: meta?.pageCount,
    rawTextPreview: meta?.rawTextPreview,
  };
}
