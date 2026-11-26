"use client";

import { useState } from "react";
import { CheckCircle2, Cpu, KeyRound, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AiSettings, ExtractionProvider, ServerConfigInfo } from "@/lib/types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AiSettings;
  serverConfig: ServerConfigInfo;
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
    desc: "Uses Gemini if configured, then OpenAI, otherwise the layout-aware offline parser.",
  },
  {
    id: "gemini",
    label: "Google Gemini AI (Strict JSON Schema + Scanned PDFs)",
    desc: "Highest accuracy — reads tables, columns, and scanned PDFs visually (free tier at Google AI Studio).",
  },
  {
    id: "ollama",
    label: "Ollama Local LLM (Free & 100% Offline)",
    desc: "Runs a local open-source model on your machine via Ollama with structured JSON output.",
  },
  {
    id: "openai",
    label: "OpenAI",
    desc: "Structured JSON extraction from layout-reconstructed syllabus text using GPT models.",
  },
  {
    id: "local",
    label: "Offline Layout Parser Only",
    desc: "Deterministic typography & table-aware extraction with zero AI calls.",
  },
];

export function SettingsModal({
  open,
  onClose,
  settings,
  serverConfig,
  onSave,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<AiSettings>(settings);

  if (!open) return null;

  const { serverKeys, ollama } = serverConfig;

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
                Choose between Gemini, local Ollama LLM, OpenAI, or deterministic layout parsing
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
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">{item.label}</span>
                    {item.id === "ollama" && ollama.available && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Running ({ollama.models.length} models)
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 text-xs text-slate-500">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          {/* Gemini */}
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
                  : "AIza... (free key at aistudio.google.com/apikey)"
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Model (uses strict JSON responseSchema):</span>
              <select
                value={draft.geminiModel}
                onChange={(e) => setDraft({ ...draft, geminiModel: e.target.value })}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (Fast &amp; accurate)</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (Complex layouts)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>
            </div>
          </div>

          {/* Ollama */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <Cpu className="h-4 w-4 text-slate-400" />
                Ollama Local LLM
              </label>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  ollama.available
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {ollama.available ? "Detected locally" : "Not running on localhost"}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">Base URL</label>
                <input
                  type="text"
                  value={draft.ollamaBaseUrl}
                  onChange={(e) => setDraft({ ...draft, ollamaBaseUrl: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Model</label>
                {ollama.models.length > 0 ? (
                  <select
                    value={draft.ollamaModel}
                    onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  >
                    {!ollama.models.includes(draft.ollamaModel) && (
                      <option value={draft.ollamaModel}>{draft.ollamaModel}</option>
                    )}
                    {ollama.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={draft.ollamaModel}
                    onChange={(e) => setDraft({ ...draft, ollamaModel: e.target.value })}
                    placeholder="qwen2.5:7b or llama3.1:8b"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                )}
              </div>
            </div>
          </div>

          {/* OpenAI */}
          <div className="border-t border-slate-100 pt-4">
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
                <option value="gpt-4o-mini">gpt-4o-mini (Fast &amp; low cost)</option>
                <option value="gpt-4o">gpt-4o</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Keys entered here are stored only in your browser&apos;s localStorage and forwarded solely during PDF extraction. You can also set{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">GEMINI_API_KEY</code>,{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">OPENAI_API_KEY</code>, or{" "}
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono">OLLAMA_MODEL</code> in{" "}
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
