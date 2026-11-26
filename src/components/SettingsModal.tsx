"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AiSettings, ExtractionProvider } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  serverKeys: { gemini: boolean; openai: boolean };
  onSave: (next: AiSettings) => void;
}

const PROVIDERS: Array<{
  id: ExtractionProvider;
  label: string;
  desc: string;
}> = [
  {
    id: "auto",
    label: "Auto (Recommended)",
    desc: "Uses Gemini if configured, then OpenAI, otherwise the built-in local heuristic parser.",
  },
  {
    id: "gemini",
    label: "Google Gemini AI",
    desc: "Best accuracy on complex or scanned PDFs (free tier available via Google AI Studio).",
  },
  {
    id: "openai",
    label: "OpenAI",
    desc: "Structured JSON extraction from syllabus PDF text using GPT models.",
  },
  {
    id: "local",
    label: "Local Heuristic Only",
    desc: "100% offline rule-based extraction with zero external API calls.",
  },
];

export function SettingsModal({
  open,
  onClose,
  settings,
  serverKeys,
  onSave,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AiSettings>(settings);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Extraction Engine Settings
              </h2>
              <p className="text-xs text-slate-500">
                Configure hybrid AI + local syllabus parsing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-2.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Extraction Mode
          </label>
          <div className="grid gap-2">
            {PROVIDERS.map((item) => {
              const selected = draft.provider === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, provider: item.id })}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-medium text-slate-900">{item.label}</span>
                  <span className="mt-0.5 text-xs text-slate-500">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <KeyRound className="h-4 w-4 text-slate-400" />
                Gemini API Key (Optional)
              </label>
              {serverKeys.gemini && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Server env key active
                </span>
              )}
            </div>
            <input
              type="password"
              value={draft.geminiApiKey}
              onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
              placeholder={
                serverKeys.gemini
                  ? "Using server GEMINI_API_KEY (leave blank or override)"
                  : "AIza..."
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Model:</span>
              <select
                value={draft.geminiModel}
                onChange={(e) => setDraft({ ...draft, geminiModel: e.target.value })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Fast & accurate)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (Complex layouts)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <KeyRound className="h-4 w-4 text-slate-400" />
                OpenAI API Key (Optional)
              </label>
              {serverKeys.openai && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Server env key active
                </span>
              )}
            </div>
            <input
              type="password"
              value={draft.openaiApiKey}
              onChange={(e) => setDraft({ ...draft, openaiApiKey: e.target.value })}
              placeholder={
                serverKeys.openai
                  ? "Using server OPENAI_API_KEY (leave blank or override)"
                  : "sk-..."
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Model:</span>
              <select
                value={draft.openaiModel}
                onChange={(e) => setDraft({ ...draft, openaiModel: e.target.value })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value="gpt-4o-mini">gpt-4o-mini (Fast & low cost)</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Keys entered here are stored only in your browser&apos;s localStorage and forwarded solely during PDF extraction. You can also set{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">GEMINI_API_KEY</code> or{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">OPENAI_API_KEY</code> in{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">.env.local</code>.
          </span>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
