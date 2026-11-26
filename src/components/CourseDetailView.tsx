"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookMarked,
  Calculator,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  GraduationCap,
  ListChecks,
  Loader2,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
} from "lucide-react";
import { GradeCalculator } from "./GradeCalculator";
import { courseToCalendarEntries, generateExamsIcs } from "@/lib/ics";
import { createId } from "@/lib/schema";
import { loadPdfBlob, savePdfBlob } from "@/lib/storage";
import {
  COURSE_ACCENT_COLORS,
  type CourseOutline,
  type ExamItem,
  type ExerciseItem,
  type TextbookItem,
} from "@/lib/types";

type DetailTab = "overview" | "exams" | "textbooks" | "exercises" | "grading";

interface CourseDetailViewProps {
  course: CourseOutline;
  onBack: () => void;
  onUpdate: (updated: CourseOutline) => void;
  onDelete: (courseId: string) => void;
  onReextract?: (course: CourseOutline) => Promise<void>;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getDaysUntil(dateStr: string): number | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function CourseDetailView({
  course,
  onBack,
  onUpdate,
  onDelete,
  onReextract,
}: CourseDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [showPdf, setShowPdf] = useState<boolean>(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [reextracting, setReextracting] = useState(false);
  const [bookFilter, setBookFilter] = useState<"all" | "required" | "suggested">("all");
  const [newTa, setNewTa] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pdfAttachRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    let createdObjectUrl: string | null = null;

    async function loadPdf() {
      const blob = await loadPdfBlob(course.id);
      if (!active) return;
      if (blob) {
        createdObjectUrl = URL.createObjectURL(blob);
        setPdfUrl(createdObjectUrl);
      } else if (course.samplePdfUrl) {
        setPdfUrl(course.samplePdfUrl);
      } else {
        setPdfUrl(null);
      }
    }

    void loadPdf();

    return () => {
      active = false;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [course.id, course.hasPdfBlob, course.samplePdfUrl]);

  const showNotice = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const patchCourse = (patch: Partial<CourseOutline>) => {
    onUpdate({
      ...course,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAttachPdf = async (file: File) => {
    await savePdfBlob(course.id, file);
    patchCourse({ hasPdfBlob: true, fileName: file.name });
    showNotice("PDF attached for side-by-side verification.");
  };

  const handleExportCourseIcs = (singleExam?: ExamItem) => {
    const entries = singleExam
      ? [
          {
            courseCode: course.courseCode,
            courseTitle: course.courseTitle,
            instructorName: course.instructor.name,
            exam: singleExam,
          },
        ]
      : courseToCalendarEntries(course);

    const { icsContent, exportedCount, skippedCount } = generateExamsIcs(
      entries,
      `${course.courseCode} Exams`
    );

    if (exportedCount === 0) {
      showNotice(
        "No exams with a parseable date found. Set a YYYY-MM-DD date first to export to calendar."
      );
      return;
    }

    const safeSlug = (singleExam ? `${course.courseCode}-${singleExam.title}` : `${course.courseCode}-exams`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    downloadTextFile(`${safeSlug || "course-exams"}.ics`, icsContent, "text/calendar;charset=utf-8");
    showNotice(
      `Exported ${exportedCount} exam${exportedCount > 1 ? "s" : ""} to .ics${
        skippedCount > 0 ? ` (${skippedCount} TBD skipped)` : ""
      }.`
    );
  };

  const handleExportJson = () => {
    const safeSlug = course.courseCode.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "course";
    downloadTextFile(
      `${safeSlug}-outline.json`,
      JSON.stringify(course, null, 2),
      "application/json"
    );
    showNotice("Course outline JSON downloaded.");
  };

  const completedExercises = useMemo(
    () => course.exercises.filter((e) => e.completed).length,
    [course.exercises]
  );

  const filteredBooks = useMemo(() => {
    if (bookFilter === "all") return course.textbooks;
    return course.textbooks.filter((b) => b.requirement === bookFilter);
  }, [course.textbooks, bookFilter]);

  const methodBadge = {
    gemini: { label: "Gemini AI", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    openai: { label: "OpenAI", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    ollama: { label: "Ollama Local", cls: "bg-violet-50 text-violet-700 border-violet-200" },
    local: { label: "Layout Parser", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    manual: { label: "Manual", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  }[course.extractionMethod];

  const tabs: Array<{ id: DetailTab; label: string; count?: number; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview & Instructor", icon: <User className="h-4 w-4" /> },
    {
      id: "exams",
      label: "Exams",
      count: course.exams.length,
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      id: "textbooks",
      label: "Textbooks",
      count: course.textbooks.length,
      icon: <BookMarked className="h-4 w-4" />,
    },
    {
      id: "exercises",
      label: "Exercises",
      count: course.exercises.length,
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      id: "grading",
      label: "Grading & Calc",
      count: course.gradingScheme.length,
      icon: <Calculator className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Courses
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: course.accentColor }}
              />
              <input
                type="text"
                value={course.courseCode}
                onChange={(e) => patchCourse({ courseCode: e.target.value })}
                className="w-28 rounded border border-transparent bg-slate-100/80 px-2 py-0.5 font-mono text-sm font-bold text-slate-900 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none"
                aria-label="Course code"
              />
              <input
                type="text"
                value={course.term}
                onChange={(e) => patchCourse({ term: e.target.value })}
                placeholder="Term (e.g. Fall 2026)"
                className="w-32 rounded border border-transparent bg-transparent px-2 py-0.5 text-xs font-medium text-slate-500 hover:border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none"
                aria-label="Term"
              />
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${methodBadge.cls}`}
              >
                <Sparkles className="h-3 w-3" />
                {methodBadge.label}
              </span>
            </div>
            <input
              type="text"
              value={course.courseTitle}
              onChange={(e) => patchCourse({ courseTitle: e.target.value })}
              className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-lg font-bold text-slate-900 hover:border-slate-200 focus:border-indigo-500 focus:bg-white focus:outline-none"
              aria-label="Course title"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onReextract && pdfUrl && (
            <button
              type="button"
              disabled={reextracting}
              onClick={async () => {
                setReextracting(true);
                try {
                  await onReextract(course);
                  setDismissedWarnings(false);
                  showNotice("Re-extracted syllabus from stored PDF.");
                } catch (err) {
                  showNotice(
                    err instanceof Error ? err.message : "Could not re-extract PDF."
                  );
                } finally {
                  setReextracting(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
              title="Re-run extraction on this stored PDF"
            >
              {reextracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {reextracting ? "Re-extracting…" : "Re-extract"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPdf((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              showPdf
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {showPdf ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPdf ? "Hide PDF" : "View PDF"}
          </button>

          <button
            type="button"
            onClick={() => handleExportCourseIcs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Export .ics
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <FileJson className="h-3.5 w-3.5" />
            JSON
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete "${course.courseCode}: ${course.courseTitle}"?`)) {
                onDelete(course.id);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50"
            aria-label="Delete course"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {toast && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-medium text-indigo-800">
          <span>{toast}</span>
        </div>
      )}

      {!dismissedWarnings && course.extractionWarnings.length > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <ul className="space-y-1">
              {course.extractionWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setDismissedWarnings(true)}
            className="shrink-0 font-medium text-amber-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Split Workspace */}
      <div className={`grid gap-4 ${showPdf ? "lg:grid-cols-12" : "grid-cols-1"}`}>
        {/* Left Pane: Original PDF Viewer */}
        {showPdf && (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5 lg:h-[calc(100vh-13rem)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-700">
                <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                <span className="truncate">{course.fileName}</span>
                {course.pageCount ? (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                    {course.pageCount}p
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => pdfAttachRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  title="Replace or attach PDF"
                >
                  <Upload className="h-3.5 w-3.5" />
                </button>
                <input
                  ref={pdfAttachRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAttachPdf(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                title={`PDF preview for ${course.courseCode}`}
                className="h-[460px] w-full flex-1 bg-slate-100 lg:h-full"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <FileText className="h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Original PDF not stored locally
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-500">
                  Attach the course outline PDF to verify and edit extracted fields side-by-side.
                </p>
                <button
                  type="button"
                  onClick={() => pdfAttachRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Attach PDF
                </button>
              </div>
            )}
          </div>
        )}

        {/* Right Pane: Structured Data Editor */}
        <div
          className={`flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm ${
            showPdf ? "lg:col-span-7 lg:h-[calc(100vh-13rem)]" : ""
          }`}
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                    isActive
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                        isActive
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* 1. OVERVIEW & INSTRUCTOR */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <GraduationCap className="h-4 w-4 text-indigo-600" />
                      Instructor &amp; Contact Details
                    </h3>
                    <div className="flex items-center gap-1">
                      {COURSE_ACCENT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => patchCourse({ accentColor: color })}
                          className={`h-4 w-4 rounded-full transition ${
                            course.accentColor === color
                              ? "ring-2 ring-slate-900 ring-offset-1"
                              : "opacity-60 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Set course color ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-500">
                        Instructor Name
                      </label>
                      <input
                        type="text"
                        value={course.instructor.name}
                        onChange={(e) =>
                          patchCourse({
                            instructor: { ...course.instructor, name: e.target.value },
                          })
                        }
                        placeholder="e.g. Dr. Maya Chen"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-500">Email</label>
                        {course.instructor.email && (
                          <a
                            href={`mailto:${course.instructor.email}`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            Compose
                          </a>
                        )}
                      </div>
                      <input
                        type="email"
                        value={course.instructor.email}
                        onChange={(e) =>
                          patchCourse({
                            instructor: { ...course.instructor, email: e.target.value },
                          })
                        }
                        placeholder="professor@university.edu"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-500">
                        <MapPin className="h-3.5 w-3.5" />
                        Office Location
                      </label>
                      <input
                        type="text"
                        value={course.instructor.officeLocation}
                        onChange={(e) =>
                          patchCourse({
                            instructor: {
                              ...course.instructor,
                              officeLocation: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Engineering Bldg, Room 412B"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        Office Hours
                      </label>
                      <input
                        type="text"
                        value={course.instructor.officeHours}
                        onChange={(e) =>
                          patchCourse({
                            instructor: {
                              ...course.instructor,
                              officeHours: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Tue/Thu 2:00 PM - 3:30 PM"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-slate-500">
                        Department / Faculty
                      </label>
                      <input
                        type="text"
                        value={course.department}
                        onChange={(e) => patchCourse({ department: e.target.value })}
                        placeholder="e.g. Department of Computer Science"
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>
                </section>

                {/* Teaching Assistants */}
                <section className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Users className="h-4 w-4 text-indigo-600" />
                    Teaching Assistants
                  </h4>

                  {course.instructor.teachingAssistants.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {course.instructor.teachingAssistants.map((ta, idx) => (
                        <span
                          key={`${ta}-${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                        >
                          {ta}
                          <button
                            type="button"
                            onClick={() =>
                              patchCourse({
                                instructor: {
                                  ...course.instructor,
                                  teachingAssistants:
                                    course.instructor.teachingAssistants.filter(
                                      (_, i) => i !== idx
                                    ),
                                },
                              })
                            }
                            className="text-slate-400 hover:text-red-600"
                            aria-label={`Remove TA ${ta}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTa}
                      onChange={(e) => setNewTa(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTa.trim()) {
                          e.preventDefault();
                          patchCourse({
                            instructor: {
                              ...course.instructor,
                              teachingAssistants: [
                                ...course.instructor.teachingAssistants,
                                newTa.trim(),
                              ],
                            },
                          });
                          setNewTa("");
                        }
                      }}
                      placeholder="Add TA name & email (press Enter)"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newTa.trim()) return;
                        patchCourse({
                          instructor: {
                            ...course.instructor,
                            teachingAssistants: [
                              ...course.instructor.teachingAssistants,
                              newTa.trim(),
                            ],
                          },
                        });
                        setNewTa("");
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Add
                    </button>
                  </div>
                </section>

                {/* Raw extracted text preview */}
                {course.rawTextPreview && (
                  <section className="border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowRawText((v) => !v)}
                      className="text-xs font-medium text-slate-500 hover:text-indigo-600"
                    >
                      {showRawText ? "Hide raw PDF text preview" : "Inspect raw extracted PDF text"}
                    </button>
                    {showRawText && (
                      <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                        {course.rawTextPreview}
                      </pre>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* 2. EXAM DATES */}
            {activeTab === "exams" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Exam Dates &amp; Key Assessments
                    </h3>
                    <p className="text-xs text-slate-500">
                      Use <code className="font-mono">YYYY-MM-DD</code> dates for automatic countdowns and .ics export.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportCourseIcs()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export All (.ics)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patchCourse({
                          exams: [
                            ...course.exams,
                            {
                              id: createId("exam"),
                              title: "Midterm Exam",
                              date: "",
                              time: "",
                              location: "",
                              weight: "",
                              notes: "",
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Exam
                    </button>
                  </div>
                </div>

                {course.exams.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    No exam dates extracted yet. Click <strong>Add Exam</strong> to add midterms or finals.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {course.exams.map((exam) => {
                      const days = getDaysUntil(exam.date);
                      const updateExam = (patch: Partial<ExamItem>) =>
                        patchCourse({
                          exams: course.exams.map((e) =>
                            e.id === exam.id ? { ...e, ...patch } : e
                          ),
                        });

                      return (
                        <div
                          key={exam.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={exam.title}
                                onChange={(e) => updateExam({ title: e.target.value })}
                                className="rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none"
                              />
                              {days !== null && (
                                <span
                                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
                                    days < 0
                                      ? "bg-slate-200 text-slate-600"
                                      : days <= 7
                                      ? "bg-red-100 text-red-700"
                                      : days <= 21
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-indigo-100 text-indigo-700"
                                  }`}
                                >
                                  {days === 0
                                    ? "Today"
                                    : days > 0
                                    ? `In ${days}d`
                                    : `${Math.abs(days)}d ago`}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleExportCourseIcs(exam)}
                                title="Export this exam to .ics calendar"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                              >
                                <CalendarPlus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  patchCourse({
                                    exams: course.exams.filter((e) => e.id !== exam.id),
                                  })
                                }
                                title="Delete exam"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Date
                              </label>
                              <input
                                type="text"
                                value={exam.date}
                                onChange={(e) => updateExam({ date: e.target.value })}
                                placeholder="YYYY-MM-DD or TBD"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Time
                              </label>
                              <input
                                type="text"
                                value={exam.time}
                                onChange={(e) => updateExam({ time: e.target.value })}
                                placeholder="10:00 AM - 12:00 PM"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Location
                              </label>
                              <input
                                type="text"
                                value={exam.location}
                                onChange={(e) => updateExam({ location: e.target.value })}
                                placeholder="Room / Hall"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Weight
                              </label>
                              <input
                                type="text"
                                value={exam.weight}
                                onChange={(e) => updateExam({ weight: e.target.value })}
                                placeholder="e.g. 25%"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="mt-2.5">
                            <input
                              type="text"
                              value={exam.notes}
                              onChange={(e) => updateExam({ notes: e.target.value })}
                              placeholder="Notes (coverage, closed/open book, formula sheet rules…)"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. TEXTBOOKS */}
            {activeTab === "textbooks" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(["all", "required", "suggested"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setBookFilter(filter)}
                        className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                          bookFilter === filter
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchCourse({
                        textbooks: [
                          ...course.textbooks,
                          {
                            id: createId("book"),
                            title: "",
                            authors: "",
                            edition: "",
                            isbn: "",
                            requirement: bookFilter === "suggested" ? "suggested" : "required",
                            notes: "",
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Textbook
                  </button>
                </div>

                {filteredBooks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    No {bookFilter === "all" ? "" : bookFilter} textbooks listed yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredBooks.map((book) => {
                      const updateBook = (patch: Partial<TextbookItem>) =>
                        patchCourse({
                          textbooks: course.textbooks.map((b) =>
                            b.id === book.id ? { ...b, ...patch } : b
                          ),
                        });

                      return (
                        <div
                          key={book.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <input
                              type="text"
                              value={book.title}
                              onChange={(e) => updateBook({ title: e.target.value })}
                              placeholder="Textbook Title"
                              className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateBook({
                                    requirement:
                                      book.requirement === "required"
                                        ? "suggested"
                                        : "required",
                                  })
                                }
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                                  book.requirement === "required"
                                    ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
                                    : "bg-sky-100 text-sky-700 hover:bg-sky-200"
                                }`}
                                title="Click to toggle Required / Suggested"
                              >
                                {book.requirement === "required" ? "Required" : "Suggested"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  patchCourse({
                                    textbooks: course.textbooks.filter((b) => b.id !== book.id),
                                  })
                                }
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete textbook"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Author(s)
                              </label>
                              <input
                                type="text"
                                value={book.authors}
                                onChange={(e) => updateBook({ authors: e.target.value })}
                                placeholder="Author names"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                Edition
                              </label>
                              <input
                                type="text"
                                value={book.edition}
                                onChange={(e) => updateBook({ edition: e.target.value })}
                                placeholder="e.g. 4th Edition"
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-medium text-slate-500">
                                ISBN
                              </label>
                              <input
                                type="text"
                                value={book.isbn}
                                onChange={(e) => updateBook({ isbn: e.target.value })}
                                placeholder="978-..."
                                className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <input
                            type="text"
                            value={book.notes}
                            onChange={(e) => updateBook({ notes: e.target.value })}
                            placeholder="Notes (library reserve, free online copy, etc.)"
                            className="mt-2.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 4. SUGGESTED EXERCISES */}
            {activeTab === "exercises" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Suggested Exercises &amp; Practice Problems
                    </h3>
                    {course.exercises.length > 0 && (
                      <p className="text-xs text-slate-500">
                        {completedExercises} of {course.exercises.length} sets completed (
                        {Math.round((completedExercises / course.exercises.length) * 100)}%)
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patchCourse({
                        exercises: [
                          ...course.exercises,
                          {
                            id: createId("ex"),
                            topic: "",
                            problems: "",
                            textbook: "",
                            weekOrDue: "",
                            completed: false,
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Exercise Set
                  </button>
                </div>

                {course.exercises.length > 0 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{
                        width: `${(completedExercises / course.exercises.length) * 100}%`,
                      }}
                    />
                  </div>
                )}

                {course.exercises.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                    No suggested exercises extracted yet. Add practice problem sets to track your study progress.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {course.exercises.map((ex) => {
                      const updateEx = (patch: Partial<ExerciseItem>) =>
                        patchCourse({
                          exercises: course.exercises.map((item) =>
                            item.id === ex.id ? { ...item, ...patch } : item
                          ),
                        });

                      return (
                        <div
                          key={ex.id}
                          className={`rounded-xl border p-3.5 transition ${
                            ex.completed
                              ? "border-emerald-200 bg-emerald-50/40"
                              : "border-slate-200 bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => updateEx({ completed: !ex.completed })}
                              className="mt-1 shrink-0 text-emerald-600 transition hover:scale-105"
                              aria-label={ex.completed ? "Mark incomplete" : "Mark complete"}
                            >
                              {ex.completed ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : (
                                <Circle className="h-5 w-5 text-slate-300" />
                              )}
                            </button>

                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={ex.topic}
                                  onChange={(e) => updateEx({ topic: e.target.value })}
                                  placeholder="Chapter / Topic"
                                  className={`flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-semibold hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:outline-none ${
                                    ex.completed
                                      ? "text-slate-500 line-through"
                                      : "text-slate-900"
                                  }`}
                                />
                                <input
                                  type="text"
                                  value={ex.weekOrDue}
                                  onChange={(e) => updateEx({ weekOrDue: e.target.value })}
                                  placeholder="Week / Due"
                                  className="w-28 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <input
                                  type="text"
                                  value={ex.problems}
                                  onChange={(e) => updateEx({ problems: e.target.value })}
                                  placeholder="Problem numbers (e.g. Ch. 3: #1, 4, 7-12)"
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none sm:col-span-2"
                                />
                                <input
                                  type="text"
                                  value={ex.textbook}
                                  onChange={(e) => updateEx({ textbook: e.target.value })}
                                  placeholder="Textbook ref (optional)"
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                patchCourse({
                                  exercises: course.exercises.filter((i) => i.id !== ex.id),
                                })
                              }
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete exercise set"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 5. GRADING & CALCULATOR */}
            {activeTab === "grading" && (
              <GradeCalculator
                items={course.gradingScheme}
                onChange={(gradingScheme) => patchCourse({ gradingScheme })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
