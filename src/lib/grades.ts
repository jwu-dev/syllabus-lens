import type { GradingItem } from "./types";

export interface GradeSummary {
  totalWeight: number;
  completedWeight: number;
  remainingWeight: number;
  earnedWeightedPoints: number;
  /** Weighted average across completed items only (0 - 100), or null if none scored */
  currentAverage: number | null;
  /** Minimum possible final percentage if remaining items score 0% */
  projectedMinimum: number;
  /** Maximum possible final percentage if remaining items score 100% */
  projectedMaximum: number;
  /** Average percentage required on remaining weight to hit targetGrade */
  neededOnRemaining: number | null;
  targetStatus: "achieved" | "achievable" | "impossible" | "complete";
  currentLetter: string;
}

export function getLetterGrade(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "—";
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 77) return "B+";
  if (score >= 73) return "B";
  if (score >= 70) return "B-";
  if (score >= 67) return "C+";
  if (score >= 63) return "C";
  if (score >= 60) return "C-";
  if (score >= 55) return "D+";
  if (score >= 50) return "D";
  return "F";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateGradeSummary(
  items: GradingItem[],
  targetGrade = 85
): GradeSummary {
  let totalWeight = 0;
  let completedWeight = 0;
  let earnedWeightedPoints = 0;

  for (const item of items) {
    const weight = Math.max(0, Number.isFinite(item.weight) ? item.weight : 0);
    totalWeight += weight;
    if (item.score !== null && Number.isFinite(item.score)) {
      const clampedScore = Math.max(0, Math.min(100, item.score));
      completedWeight += weight;
      earnedWeightedPoints += (clampedScore / 100) * weight;
    }
  }

  const remainingWeight = Math.max(0, totalWeight - completedWeight);
  const currentAverage =
    completedWeight > 0 ? round2((earnedWeightedPoints / completedWeight) * 100) : null;

  const scale = totalWeight > 0 ? 100 / totalWeight : 1;
  const projectedMinimum = round2(earnedWeightedPoints * scale);
  const projectedMaximum = round2((earnedWeightedPoints + remainingWeight) * scale);

  let neededOnRemaining: number | null = null;
  let targetStatus: GradeSummary["targetStatus"] = "achievable";

  if (remainingWeight <= 0.0001) {
    targetStatus =
      currentAverage !== null && currentAverage >= targetGrade ? "achieved" : "complete";
  } else {
    const targetPoints = (targetGrade / 100) * totalWeight;
    const neededPoints = targetPoints - earnedWeightedPoints;
    const neededPercent = (neededPoints / remainingWeight) * 100;
    neededOnRemaining = round2(neededPercent);

    if (neededPercent <= 0) {
      targetStatus = "achieved";
      neededOnRemaining = 0;
    } else if (neededPercent > 100) {
      targetStatus = "impossible";
    } else {
      targetStatus = "achievable";
    }
  }

  return {
    totalWeight: round2(totalWeight),
    completedWeight: round2(completedWeight),
    remainingWeight: round2(remainingWeight),
    earnedWeightedPoints: round2(earnedWeightedPoints),
    currentAverage,
    projectedMinimum,
    projectedMaximum,
    neededOnRemaining,
    targetStatus,
    currentLetter: getLetterGrade(currentAverage),
  };
}
