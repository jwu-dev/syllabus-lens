export type ExtractionProvider = "auto" | "gemini" | "openai" | "local";
export type ExtractionMethod = "gemini" | "openai" | "local" | "manual";

export interface InstructorInfo {
  name: string;
  email: string;
  officeLocation: string;
  officeHours: string;
  teachingAssistants: string[];
}

export interface ExamItem {
  id: string;
  title: string;
  /** ISO date YYYY-MM-DD when parseable, or free-form date text */
  date: string;
  time: string;
  location: string;
  weight: string;
  notes: string;
}

export interface TextbookItem {
  id: string;
  title: string;
  authors: string;
  edition: string;
  isbn: string;
  requirement: "required" | "suggested";
  notes: string;
}

export interface ExerciseItem {
  id: string;
  topic: string;
  problems: string;
  textbook: string;
  weekOrDue: string;
  completed: boolean;
}

export interface GradingItem {
  id: string;
  name: string;
  /** Weight as a percentage (0 - 100) */
  weight: number;
  notes: string;
  /** User-entered percentage score (0 - 100) for the grade calculator */
  score: number | null;
}

export interface ExtractedSyllabus {
  courseCode: string;
  courseTitle: string;
  term: string;
  department: string;
  instructor: InstructorInfo;
  exams: ExamItem[];
  textbooks: TextbookItem[];
  exercises: ExerciseItem[];
  gradingScheme: GradingItem[];
  extractionMethod: ExtractionMethod;
  extractionWarnings: string[];
  pageCount?: number;
  rawTextPreview?: string;
}

export interface CourseOutline extends ExtractedSyllabus {
  id: string;
  fileName: string;
  hasPdfBlob: boolean;
  samplePdfUrl?: string;
  accentColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettings {
  provider: ExtractionProvider;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
}

export const COURSE_ACCENT_COLORS = [
  "#4f46e5", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
] as const;

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "auto",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
};
