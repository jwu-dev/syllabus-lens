"use client";

import { useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Sparkles,
  Upload,
  X,
  AlertCircle,
  BookOpenCheck,
} from "lucide-react";
import type { AiSettings, ExtractedSyllabus } from "@/lib/types";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  aiSettings: AiSettings;
  serverKeys: { gemini: boolean; openai: boolean };
  onExtracted: (result: {
    fileName: string;
    pdfBlob: Blob;
    syllabus: ExtractedSyllabus;
    samplePdfUrl?: string;
  }) => void;
}

export function UploadModal({
  open,
  onClose,
  aiSettings,
  serverKeys,
  onExtracted,
}: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const activeEngineLabel = (() => {
    if (aiSettings.provider === "local") return "Offline Layout Parser";
    if (aiSettings.provider === "ollama") {
      return `Ollama Local LLM (${aiSettings.ollamaModel})`;
    }
    if (aiSettings.provider === "gemini") {
      return aiSettings.geminiApiKey || serverKeys.gemini
        ? `Gemini AI (${aiSettings.geminiModel})`
        : "Gemini (no key set — will use Offline Fallback)";
    }
    if (aiSettings.provider === "openai") {
      return aiSettings.openaiApiKey || serverKeys.openai
        ? `OpenAI (${aiSettings.openaiModel})`
        : "OpenAI (no key set — will use Offline Fallback)";
    }
    if (aiSettings.geminiApiKey || serverKeys.gemini) {
      return `Auto → Gemini AI (${aiSettings.geminiModel})`;
    }
    if (aiSettings.openaiApiKey || serverKeys.openai) {
      return `Auto → OpenAI (${aiSettings.openaiModel})`;
    }
    return "Auto → Offline Layout Parser (connect Gemini or Ollama in AI Settings)";
  })();

  const processFile = async (file: File, samplePdfUrl?: string) => {
    setError(null);
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Please select a valid PDF file (.pdf).");
      return;
    }

    setLoading(true);
    setStatusMessage(`Extracting course outline from ${file.name}…`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", aiSettings.provider);

      if (aiSettings.provider === "gemini") {
        if (aiSettings.geminiApiKey) formData.append("apiKey", aiSettings.geminiApiKey);
        if (aiSettings.geminiModel) formData.append("model", aiSettings.geminiModel);
      } else if (aiSettings.provider === "openai") {
        if (aiSettings.openaiApiKey) formData.append("apiKey", aiSettings.openaiApiKey);
        if (aiSettings.openaiModel) formData.append("model", aiSettings.openaiModel);
      } else if (aiSettings.provider === "ollama") {
        if (aiSettings.ollamaBaseUrl) {
          formData.append("ollamaBaseUrl", aiSettings.ollamaBaseUrl);
        }
        if (aiSettings.ollamaModel) formData.append("model", aiSettings.ollamaModel);
      } else if (aiSettings.provider === "auto") {
        if (aiSettings.geminiApiKey) {
          formData.append("apiKey", aiSettings.geminiApiKey);
          formData.append("model", aiSettings.geminiModel);
        } else if (aiSettings.openaiApiKey) {
          formData.append("apiKey", aiSettings.openaiApiKey);
          formData.append("model", aiSettings.openaiModel);
        }
      }

      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as {
        fileName?: string;
        syllabus?: ExtractedSyllabus;
        error?: string;
      };

      if (!res.ok || !payload.syllabus) {
        throw new Error(payload.error || "Failed to extract syllabus PDF.");
      }

      onExtracted({
        fileName: payload.fileName || file.name,
        pdfBlob: file,
        syllabus: payload.syllabus,
        samplePdfUrl,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong while parsing the PDF."
      );
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  const handleLoadSample = async () => {
    setError(null);
    setLoading(true);
    setStatusMessage("Loading sample CS 301 syllabus PDF…");
    try {
      const res = await fetch("/sample-syllabus.pdf");
      if (!res.ok) {
        throw new Error("Sample syllabus PDF is not available.");
      }
      const blob = await res.blob();
      const file = new File([blob], "CS301-Fall2026-Course-Outline.pdf", {
        type: "application/pdf",
      });
      await processFile(file, "/sample-syllabus.pdf");
    } catch (err) {
      setLoading(false);
      setStatusMessage("");
      setError(
        err instanceof Error ? err.message : "Could not load sample syllabus PDF."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Upload Course Outline PDF
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Extract instructor details, exam dates, textbooks, suggested exercises, and grading scheme.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Engine: {activeEngineLabel}</span>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!loading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (loading) return;
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) void processFile(dropped);
          }}
          onClick={() => !loading && inputRef.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-indigo-500 bg-indigo-50/70"
              : "border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/30"
          } ${loading ? "pointer-events-none opacity-75" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void processFile(selected);
              e.target.value = "";
            }}
          />

          {loading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="mt-3 text-sm font-medium text-slate-800">{statusMessage}</p>
              <p className="mt-1 text-xs text-slate-500">
                Parsing PDF sections and structuring course data…
              </p>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">
                Drop your syllabus PDF here, or{" "}
                <span className="text-indigo-600 underline">browse files</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports text PDFs locally & scanned PDFs with Gemini AI (up to 20 MB)
              </p>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileText className="h-4 w-4 text-slate-400" />
            <span>PDFs stay stored privately in your browser</span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleLoadSample()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
          >
            <BookOpenCheck className="h-4 w-4" />
            Try Sample CS 301 Syllabus
          </button>
        </div>
      </div>
    </div>
  );
}
