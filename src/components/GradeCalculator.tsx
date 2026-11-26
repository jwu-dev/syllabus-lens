"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { calculateGradeSummary, getLetterGrade } from "@/lib/grades";
import { createId } from "@/lib/schema";
import type { GradingItem } from "@/lib/types";

const BAR_COLORS = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const TARGET_PRESETS = [
  { label: "A+ (90%)", value: 90 },
  { label: "A (85%)", value: 85 },
  { label: "A- (80%)", value: 80 },
  { label: "B+ (77%)", value: 77 },
  { label: "B (73%)", value: 73 },
  { label: "Pass (50%)", value: 50 },
];

interface GradeCalculatorProps {
  items: GradingItem[];
  onChange: (next: GradingItem[]) => void;
}

export function GradeCalculator({ items, onChange }: GradeCalculatorProps) {
  const [targetGrade, setTargetGrade] = useState<number>(85);

  const summary = useMemo(
    () => calculateGradeSummary(items, targetGrade),
    [items, targetGrade]
  );

  const weightDiff = Math.round((summary.totalWeight - 100) * 10) / 10;
  const isWeightValid = items.length === 0 || Math.abs(weightDiff) <= 0.5;

  const updateItem = (id: string, patch: Partial<GradingItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    const remaining = Math.max(0, Math.round((100 - summary.totalWeight) * 10) / 10);
    onChange([
      ...items,
      {
        id: createId("grade"),
        name: "New Assessment",
        weight: remaining > 0 ? remaining : 10,
        notes: "",
        score: null,
      },
    ]);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const clearScores = () => {
    onChange(items.map((item) => ({ ...item, score: null })));
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Current Weighted Grade</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900">
              {summary.currentAverage !== null ? `${summary.currentAverage.toFixed(1)}%` : "—"}
            </span>
            {summary.currentAverage !== null && (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {summary.currentLetter}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {summary.completedWeight > 0
              ? `Based on ${summary.completedWeight}% graded weight`
              : "Enter scores below to calculate"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">Projected Final Range</div>
          <div className="mt-1.5 font-mono text-xl font-bold text-slate-900">
            {summary.projectedMinimum.toFixed(1)}% – {summary.projectedMaximum.toFixed(1)}%
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {summary.earnedWeightedPoints.toFixed(1)} pts earned • {summary.remainingWeight}% left
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Weight Total</span>
            {isWeightValid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold ${
              isWeightValid ? "text-emerald-700" : "text-amber-600"
            }`}
          >
            {summary.totalWeight}%
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isWeightValid
              ? "Scheme sums to 100%"
              : `${weightDiff > 0 ? `+${weightDiff}% over` : `${Math.abs(weightDiff)}% under`} 100%`}
          </p>
        </div>
      </div>

      {/* Stacked Weight Bar */}
      {items.length > 0 && summary.totalWeight > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Grading Scheme Distribution</span>
            <span className="font-mono text-slate-400">{items.length} components</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {items.map((item, idx) => {
              const pct = (item.weight / Math.max(summary.totalWeight, 100)) * 100;
              return (
                <div
                  key={item.id}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                  }}
                  title={`${item.name}: ${item.weight}%`}
                  className="transition-all duration-300"
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                />
                <span className="max-w-[160px] truncate">{item.name}</span>
                <span className="font-mono font-medium text-slate-800">{item.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Target Grade Planner */}
      {items.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-900">
                Target Final Grade Planner
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {TARGET_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTargetGrade(preset.value)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    targetGrade === preset.value
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-slate-600 hover:bg-indigo-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <div className="flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={targetGrade}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setTargetGrade(Math.max(0, Math.min(100, n)));
                  }}
                  className="w-10 text-right font-mono text-xs font-semibold text-slate-900 focus:outline-none"
                  aria-label="Custom target grade percentage"
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
            </div>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            {summary.targetStatus === "achieved" && summary.remainingWeight > 0 && (
              <p className="font-medium text-emerald-700">
                You have already secured at least {targetGrade}% ({getLetterGrade(targetGrade)}) regardless of remaining scores!
              </p>
            )}
            {summary.targetStatus === "achieved" && summary.remainingWeight <= 0 && (
              <p className="font-medium text-emerald-700">
                Final grade is {summary.currentAverage?.toFixed(1)}% ({summary.currentLetter}) — target of {targetGrade}% achieved!
              </p>
            )}
            {summary.targetStatus === "complete" && (
              <p className="text-slate-700">
                All components are graded. Your final grade is{" "}
                <strong className="font-mono">{summary.currentAverage?.toFixed(1)}%</strong> ({summary.currentLetter}), which is{" "}
                {Math.max(0, targetGrade - (summary.currentAverage ?? 0)).toFixed(1)}% below your {targetGrade}% target.
              </p>
            )}
            {summary.targetStatus === "achievable" && summary.neededOnRemaining !== null && (
              <p>
                To finish with{" "}
                <strong className="font-mono text-indigo-700">
                  {targetGrade}% ({getLetterGrade(targetGrade)})
                </strong>
                , you need an average of{" "}
                <strong className="rounded bg-white px-1.5 py-0.5 font-mono text-indigo-700 shadow-sm">
                  {summary.neededOnRemaining.toFixed(1)}%
                </strong>{" "}
                across the remaining <span className="font-mono">{summary.remainingWeight}%</span> of the course.
              </p>
            )}
            {summary.targetStatus === "impossible" && summary.neededOnRemaining !== null && (
              <p className="font-medium text-amber-800">
                Reaching {targetGrade}% would require{" "}
                <span className="font-mono">{summary.neededOnRemaining.toFixed(1)}%</span> on the remaining{" "}
                {summary.remainingWeight}%. Maximum achievable grade is{" "}
                <span className="font-mono">{summary.projectedMaximum.toFixed(1)}%</span> (
                {getLetterGrade(summary.projectedMaximum)}).
              </p>
            )}
          </div>
        </div>
      )}

      {/* Editable Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Calculator className="h-4 w-4 text-indigo-600" />
            <span>Grading Components &amp; Score Inputs</span>
          </div>
          <div className="flex items-center gap-2">
            {summary.completedWeight > 0 && (
              <button
                type="button"
                onClick={clearScores}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Scores
              </button>
            )}
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Component
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No grading components extracted yet. Click <strong>Add Component</strong> to build your grading scheme.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm hover:bg-slate-50/70"
              >
                <div className="col-span-12 flex items-center gap-2 sm:col-span-5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: BAR_COLORS[idx % BAR_COLORS.length] }}
                  />
                  <div className="w-full space-y-1">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      placeholder="Assessment name"
                      className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-slate-900 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    />
                    <input
                      type="text"
                      value={item.notes}
                      onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                      placeholder="Policy note (e.g. best 4 of 5)"
                      className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-500 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="col-span-5 sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-400 sm:hidden">
                    Weight (%)
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={item.weight}
                      onChange={(e) => {
                        const val = Number.parseFloat(e.target.value);
                        updateItem(item.id, {
                          weight: Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0,
                        });
                      }}
                      className="w-full font-mono text-xs font-medium text-slate-800 focus:outline-none"
                      aria-label={`${item.name} weight percentage`}
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                </div>

                <div className="col-span-5 sm:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-400 sm:hidden">
                    Your Score (%)
                  </label>
                  <div className="flex items-center rounded-lg border border-indigo-200 bg-indigo-50/30 px-2 py-1 focus-within:border-indigo-500 focus-within:bg-white">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={item.score ?? ""}
                      placeholder="Score"
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                          updateItem(item.id, { score: null });
                        } else {
                          const val = Number.parseFloat(raw);
                          if (Number.isFinite(val)) {
                            updateItem(item.id, {
                              score: Math.max(0, Math.min(100, val)),
                            });
                          }
                        }
                      }}
                      className="w-full bg-transparent font-mono text-xs font-semibold text-indigo-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
                      aria-label={`${item.name} earned score`}
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                </div>

                <div className="col-span-2 flex justify-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
