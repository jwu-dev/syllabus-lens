"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  BookOpenCheck,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Download,
  GraduationCap,
  ListChecks,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  User,
} from "lucide-react";
import { CourseDetailView } from "./CourseDetailView";
import { SettingsModal } from "./SettingsModal";
import { UploadModal } from "./UploadModal";
import { calculateGradeSummary } from "@/lib/grades";
import { courseToCalendarEntries, generateExamsIcs } from "@/lib/ics";
import { createId } from "@/lib/schema";
import {
  deletePdfBlob,
  loadAiSettings,
  loadCourses,
  loadPdfBlob,
  saveAiSettings,
  saveCourses,
  savePdfBlob,
} from "@/lib/storage";
import {
  COURSE_ACCENT_COLORS,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
  type CourseOutline,
  type ExtractedSyllabus,
} from "@/lib/types";

function getDaysUntil(dateStr: string): number | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SyllabusDashboard() {
  const [courses, setCourses] = useState<CourseOutline[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [termFilter, setTermFilter] = useState("all");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [serverKeys, setServerKeys] = useState({ gemini: false, openai: false });
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCourses(loadCourses());
    setAiSettings(loadAiSettings());
    setHydrated(true);

    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { serverKeys?: { gemini: boolean; openai: boolean } } | null) => {
        if (data?.serverKeys) setServerKeys(data.serverKeys);
      })
      .catch(() => {
        // Ignore offline/config check failure
      });
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveCourses(courses);
    }
  }, [courses, hydrated]);

  const showNotice = (msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => setBannerNotice(null), 4000);
  };

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? null,
    [courses, selectedId]
  );

  const terms = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) {
      if (c.term.trim()) set.add(c.term.trim());
    }
    return Array.from(set);
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return courses.filter((c) => {
      if (termFilter !== "all" && c.term.trim() !== termFilter) return false;
      if (!q) return true;
      return (
        c.courseCode.toLowerCase().includes(q) ||
        c.courseTitle.toLowerCase().includes(q) ||
        c.instructor.name.toLowerCase().includes(q) ||
        c.textbooks.some((t) => t.title.toLowerCase().includes(q))
      );
    });
  }, [courses, searchQuery, termFilter]);

  const allUpcomingExams = useMemo(() => {
    const list: Array<{
      courseId: string;
      courseCode: string;
      accentColor: string;
      examId: string;
      title: string;
      date: string;
      time: string;
      location: string;
      weight: string;
      daysUntil: number | null;
    }> = [];

    for (const c of courses) {
      for (const e of c.exams) {
        const days = getDaysUntil(e.date);
        list.push({
          courseId: c.id,
          courseCode: c.courseCode,
          accentColor: c.accentColor,
          examId: e.id,
          title: e.title,
          date: e.date,
          time: e.time,
          location: e.location,
          weight: e.weight,
          daysUntil: days,
        });
      }
    }

    return list.sort((a, b) => {
      if (a.daysUntil === null && b.daysUntil === null) return 0;
      if (a.daysUntil === null) return 1;
      if (b.daysUntil === null) return -1;
      // Put upcoming (>= 0) before past (< 0)
      if (a.daysUntil >= 0 && b.daysUntil < 0) return -1;
      if (a.daysUntil < 0 && b.daysUntil >= 0) return 1;
      return a.daysUntil - b.daysUntil;
    });
  }, [courses]);

  const stats = useMemo(() => {
    const totalBooks = courses.reduce((s, c) => s + c.textbooks.length, 0);
    const requiredBooks = courses.reduce(
      (s, c) => s + c.textbooks.filter((t) => t.requirement === "required").length,
      0
    );
    const totalExercises = courses.reduce((s, c) => s + c.exercises.length, 0);
    const doneExercises = courses.reduce(
      (s, c) => s + c.exercises.filter((e) => e.completed).length,
      0
    );
    const upcomingCount = allUpcomingExams.filter(
      (e) => e.daysUntil === null || e.daysUntil >= 0
    ).length;

    return {
      totalBooks,
      requiredBooks,
      totalExercises,
      doneExercises,
      upcomingCount,
      nextExam: allUpcomingExams.find((e) => e.daysUntil !== null && e.daysUntil >= 0) ?? null,
    };
  }, [courses, allUpcomingExams]);

  const handleExtractedCourse = async (payload: {
    fileName: string;
    pdfBlob: Blob;
    syllabus: ExtractedSyllabus;
    samplePdfUrl?: string;
  }) => {
    const id = createId("course");
    const now = new Date().toISOString();
    const accentColor =
      COURSE_ACCENT_COLORS[courses.length % COURSE_ACCENT_COLORS.length];

    let hasPdfBlob = false;
    try {
      await savePdfBlob(id, payload.pdfBlob);
      hasPdfBlob = true;
    } catch {
      hasPdfBlob = false;
    }

    const newCourse: CourseOutline = {
      ...payload.syllabus,
      id,
      fileName: payload.fileName,
      hasPdfBlob,
      samplePdfUrl: payload.samplePdfUrl,
      accentColor,
      createdAt: now,
      updatedAt: now,
    };

    setCourses((prev) => [newCourse, ...prev]);
    setSelectedId(id);
    showNotice(`Extracted ${newCourse.courseCode}: ${newCourse.courseTitle}`);
  };

  const handleQuickSample = async () => {
    setLoadingSample(true);
    try {
      const res = await fetch("/sample-syllabus.pdf");
      if (!res.ok) throw new Error("Sample PDF not found");
      const blob = await res.blob();
      const file = new File([blob], "CS301-Fall2026-Course-Outline.pdf", {
        type: "application/pdf",
      });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", aiSettings.provider);
      if (aiSettings.geminiApiKey && (aiSettings.provider === "auto" || aiSettings.provider === "gemini")) {
        formData.append("apiKey", aiSettings.geminiApiKey);
        formData.append("model", aiSettings.geminiModel);
      } else if (aiSettings.openaiApiKey && (aiSettings.provider === "auto" || aiSettings.provider === "openai")) {
        formData.append("apiKey", aiSettings.openaiApiKey);
        formData.append("model", aiSettings.openaiModel);
      }

      const extractRes = await fetch("/api/extract", { method: "POST", body: formData });
      const json = (await extractRes.json()) as {
        fileName?: string;
        syllabus?: ExtractedSyllabus;
        error?: string;
      };
      if (!extractRes.ok || !json.syllabus) {
        throw new Error(json.error || "Sample extraction failed");
      }
      await handleExtractedCourse({
        fileName: json.fileName || file.name,
        pdfBlob: file,
        syllabus: json.syllabus,
        samplePdfUrl: "/sample-syllabus.pdf",
      });
    } catch (err) {
      showNotice(err instanceof Error ? err.message : "Could not load sample syllabus.");
    } finally {
      setLoadingSample(false);
    }
  };

  const handleExportAllIcs = () => {
    const entries = courses.flatMap((c) => courseToCalendarEntries(c));
    const { icsContent, exportedCount, skippedCount } = generateExamsIcs(
      entries,
      "SyllabusLens All Course Exams"
    );
    if (exportedCount === 0) {
      showNotice("No parseable exam dates across your courses yet.");
      return;
    }
    downloadFile("all-course-exams.ics", icsContent, "text/calendar;charset=utf-8");
    showNotice(
      `Exported ${exportedCount} exam${exportedCount > 1 ? "s" : ""} across ${courses.length} course${
        courses.length > 1 ? "s" : ""
      }${skippedCount > 0 ? ` (${skippedCount} TBD skipped)` : ""}.`
    );
  };

  const handleExportBackup = () => {
    downloadFile(
      `syllabus-lens-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), courses }, null, 2),
      "application/json"
    );
    showNotice("Workspace backup JSON downloaded.");
  };

  const handleImportBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { courses?: CourseOutline[] } | CourseOutline[];
      const imported = Array.isArray(parsed) ? parsed : parsed.courses;
      if (!Array.isArray(imported)) {
        throw new Error("Invalid backup format.");
      }
      const existingIds = new Set(courses.map((c) => c.id));
      const merged = [
        ...imported.filter((c) => c && typeof c.id === "string" && !existingIds.has(c.id)),
        ...courses,
      ];
      setCourses(merged);
      showNotice(`Imported ${merged.length - courses.length} new course(s).`);
    } catch {
      showNotice("Could not import JSON backup — please check the file format.");
    }
  };

  const handleDeleteCourse = (courseId: string) => {
    void deletePdfBlob(courseId);
    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    if (selectedId === courseId) setSelectedId(null);
    showNotice("Course deleted.");
  };

  const handleUpdateCourse = (updated: CourseOutline) => {
    setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleReextractCourse = async (course: CourseOutline) => {
    let blob = await loadPdfBlob(course.id);
    if (!blob && course.samplePdfUrl) {
      const res = await fetch(course.samplePdfUrl);
      if (res.ok) blob = await res.blob();
    }
    if (!blob) {
      throw new Error("Original PDF not found locally. Attach the PDF first.");
    }

    const file = new File([blob], course.fileName || "course-outline.pdf", {
      type: "application/pdf",
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("provider", aiSettings.provider);
    if (
      aiSettings.geminiApiKey &&
      (aiSettings.provider === "auto" || aiSettings.provider === "gemini")
    ) {
      formData.append("apiKey", aiSettings.geminiApiKey);
      formData.append("model", aiSettings.geminiModel);
    } else if (
      aiSettings.openaiApiKey &&
      (aiSettings.provider === "auto" || aiSettings.provider === "openai")
    ) {
      formData.append("apiKey", aiSettings.openaiApiKey);
      formData.append("model", aiSettings.openaiModel);
    }

    const extractRes = await fetch("/api/extract", { method: "POST", body: formData });
    const json = (await extractRes.json()) as {
      syllabus?: ExtractedSyllabus;
      error?: string;
    };
    if (!extractRes.ok || !json.syllabus) {
      throw new Error(json.error || "Re-extraction failed.");
    }

    handleUpdateCourse({
      ...course,
      ...json.syllabus,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">
                SyllabusLens
              </div>
              <div className="text-[11px] text-slate-500">
                Course Outline PDF Extractor
              </div>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {courses.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportAllIcs}
                  className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 sm:inline-flex"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  All Exams (.ics)
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 md:inline-flex"
                  title="Download JSON backup of all courses"
                >
                  <Download className="h-3.5 w-3.5" />
                  Backup
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 md:inline-flex"
              title="Import courses from JSON backup"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportBackup(file);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Upload PDF
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {bannerNotice && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-medium text-indigo-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
            <span>{bannerNotice}</span>
          </div>
        )}

        {selectedCourse ? (
          <CourseDetailView
            course={selectedCourse}
            onBack={() => setSelectedId(null)}
            onUpdate={handleUpdateCourse}
            onDelete={handleDeleteCourse}
            onReextract={handleReextractCourse}
          />
        ) : courses.length === 0 ? (
          /* Empty State */
          <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <GraduationCap className="h-9 w-9" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Turn messy course outlines into an organized semester hub
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
              Drop any syllabus PDF to automatically extract instructor contacts, exam dates,
              required &amp; suggested textbooks, practice exercises, and grading schemes — then
              verify side-by-side, calculate grades, and export exams to your calendar.
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:w-auto"
              >
                <Upload className="h-4 w-4" />
                Upload Syllabus PDF
              </button>
              <button
                type="button"
                disabled={loadingSample}
                onClick={() => void handleQuickSample()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 sm:w-auto"
              >
                <BookOpenCheck className="h-4 w-4" />
                {loadingSample ? "Extracting Sample…" : "Try Sample CS 301 Syllabus"}
              </button>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h3 className="mt-2.5 text-sm font-semibold text-slate-900">
                  Hybrid AI + Local Engine
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Works immediately with zero API keys, or connect Gemini / OpenAI for scanned PDFs and complex layouts.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <Calendar className="h-5 w-5 text-indigo-600" />
                <h3 className="mt-2.5 text-sm font-semibold text-slate-900">
                  One-Click .ics Calendar
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Export all midterms and final exams with 7-day and 1-day reminders directly into Google, Apple, or Outlook Calendar.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <ListChecks className="h-5 w-5 text-indigo-600" />
                <h3 className="mt-2.5 text-sm font-semibold text-slate-900">
                  Grade Calc &amp; Study Tracker
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Check off suggested exercises, enter earned scores, and see exactly what you need on remaining exams.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Multi-Course Dashboard */
          <div className="space-y-6">
            {/* KPI Stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Saved Courses</span>
                  <GraduationCap className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {courses.length}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {terms.length > 0 ? terms.slice(0, 2).join(", ") : "All terms"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Upcoming Exams</span>
                  <Calendar className="h-4 w-4 text-rose-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {stats.upcomingCount}
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {stats.nextExam
                    ? `Next: ${stats.nextExam.courseCode} in ${stats.nextExam.daysUntil}d`
                    : "No upcoming dated exams"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Textbooks</span>
                  <BookOpen className="h-4 w-4 text-sky-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {stats.totalBooks}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {stats.requiredBooks} required • {stats.totalBooks - stats.requiredBooks} suggested
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>Exercises Done</span>
                  <ListChecks className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {stats.totalExercises > 0
                    ? `${Math.round((stats.doneExercises / stats.totalExercises) * 100)}%`
                    : "—"}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {stats.doneExercises} / {stats.totalExercises} practice sets
                </div>
              </div>
            </div>

            {/* Upcoming Exams Strip */}
            {allUpcomingExams.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Calendar className="h-4 w-4 text-indigo-600" />
                    Exam Timeline Across All Courses
                  </h2>
                  <button
                    type="button"
                    onClick={handleExportAllIcs}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Export all (.ics)
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {allUpcomingExams.slice(0, 8).map((item) => (
                    <button
                      key={item.examId}
                      type="button"
                      onClick={() => setSelectedId(item.courseId)}
                      className="min-w-[220px] shrink-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
                          style={{ backgroundColor: item.accentColor }}
                        >
                          {item.courseCode}
                        </span>
                        {item.daysUntil !== null && (
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              item.daysUntil < 0
                                ? "text-slate-400"
                                : item.daysUntil <= 7
                                ? "text-red-600"
                                : "text-indigo-600"
                            }`}
                          >
                            {item.daysUntil === 0
                              ? "Today"
                              : item.daysUntil > 0
                              ? `in ${item.daysUntil}d`
                              : `${Math.abs(item.daysUntil)}d ago`}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 truncate text-xs font-semibold text-slate-900">
                        {item.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                        {item.date || "TBD"} {item.weight ? `• ${item.weight}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses, instructors, or textbooks…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {terms.length > 0 && (
                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="all">All Terms</option>
                    {terms.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Course Cards Grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => {
                const gradeSummary = calculateGradeSummary(course.gradingScheme);
                const nextExam = course.exams
                  .map((e) => ({ ...e, days: getDaysUntil(e.date) }))
                  .filter((e) => e.days === null || e.days >= 0)
                  .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))[0];

                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedId(course.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedId(course.id);
                    }}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                  >
                    <div
                      className="h-1.5 w-full"
                      style={{ backgroundColor: course.accentColor }}
                    />

                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800">
                          {course.courseCode}
                        </span>
                        {course.term && (
                          <span className="text-xs font-medium text-slate-400">
                            {course.term}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2.5 line-clamp-2 text-base font-bold text-slate-900 group-hover:text-indigo-700">
                        {course.courseTitle}
                      </h3>

                      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <User className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">
                          {course.instructor.name || "Instructor not listed"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center">
                        <div>
                          <div className="font-mono text-sm font-bold text-slate-900">
                            {course.exams.length}
                          </div>
                          <div className="text-[11px] text-slate-500">Exams</div>
                        </div>
                        <div>
                          <div className="font-mono text-sm font-bold text-slate-900">
                            {course.textbooks.length}
                          </div>
                          <div className="text-[11px] text-slate-500">Books</div>
                        </div>
                        <div>
                          <div className="font-mono text-sm font-bold text-slate-900">
                            {course.exercises.length}
                          </div>
                          <div className="text-[11px] text-slate-500">Exercises</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                        <div className="truncate text-slate-500">
                          {nextExam ? (
                            <>
                              <span className="font-medium text-slate-700">{nextExam.title}:</span>{" "}
                              <span className="font-mono">{nextExam.date || "TBD"}</span>
                            </>
                          ) : (
                            <span>No upcoming exams</span>
                          )}
                        </div>
                        {gradeSummary.currentAverage !== null ? (
                          <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700">
                            {gradeSummary.currentAverage.toFixed(0)}% ({gradeSummary.currentLetter})
                          </span>
                        ) : (
                          <span className="shrink-0 font-mono text-[11px] text-slate-400">
                            {gradeSummary.totalWeight}% wt
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        aiSettings={aiSettings}
        serverKeys={serverKeys}
        onExtracted={(payload) => void handleExtractedCourse(payload)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={aiSettings}
        serverKeys={serverKeys}
        onSave={(next) => {
          setAiSettings(next);
          saveAiSettings(next);
          showNotice("Extraction settings saved.");
        }}
      />
    </div>
  );
}
