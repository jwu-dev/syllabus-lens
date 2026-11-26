import { describe, expect, it } from "vitest";
import { calculateGradeSummary, getLetterGrade } from "./grades";
import type { GradingItem } from "./types";

const BASE_SCHEME: GradingItem[] = [
  { id: "1", name: "Assignments", weight: 20, notes: "", score: 90 },
  { id: "2", name: "Midterm 1", weight: 25, notes: "", score: 80 },
  { id: "3", name: "Midterm 2", weight: 20, notes: "", score: null },
  { id: "4", name: "Final Exam", weight: 35, notes: "", score: null },
];

describe("calculateGradeSummary", () => {
  it("computes weighted average, projected range, and needed remaining score", () => {
    // Earned: 0.9*20 + 0.8*25 = 18 + 20 = 38 out of 45 graded weight => 84.44%
    // Remaining weight: 55%. To hit 85%, need (85 - 38) / 55 * 100 = 85.45%
    const summary = calculateGradeSummary(BASE_SCHEME, 85);

    expect(summary.totalWeight).toBe(100);
    expect(summary.completedWeight).toBe(45);
    expect(summary.remainingWeight).toBe(55);
    expect(summary.earnedWeightedPoints).toBe(38);
    expect(summary.currentAverage).toBe(84.44);
    expect(summary.projectedMinimum).toBe(38);
    expect(summary.projectedMaximum).toBe(93);
    expect(summary.neededOnRemaining).toBe(85.45);
    expect(summary.targetStatus).toBe("achievable");
    expect(summary.currentLetter).toBe("A-");
  });

  it("flags target as impossible when needed score exceeds 100%", () => {
    const summary = calculateGradeSummary(BASE_SCHEME, 95);
    expect(summary.targetStatus).toBe("impossible");
    expect(summary.neededOnRemaining).toBeGreaterThan(100);
  });

  it("flags target as achieved when earned points already exceed target", () => {
    const summary = calculateGradeSummary(
      [
        { id: "1", name: "Coursework", weight: 70, notes: "", score: 95 },
        { id: "2", name: "Final", weight: 30, notes: "", score: null },
      ],
      60
    );
    expect(summary.targetStatus).toBe("achieved");
    expect(summary.neededOnRemaining).toBe(0);
  });

  it("maps letter grades accurately", () => {
    expect(getLetterGrade(92)).toBe("A+");
    expect(getLetterGrade(85)).toBe("A");
    expect(getLetterGrade(74)).toBe("B");
    expect(getLetterGrade(48)).toBe("F");
    expect(getLetterGrade(null)).toBe("—");
  });
});
