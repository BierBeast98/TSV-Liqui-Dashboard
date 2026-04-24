export type DetectedFrequency = "monthly" | "quarterly" | "yearly" | null;

export interface FrequencyResult {
  frequency: DetectedFrequency;
  confidence: number;
}

const MONTHLY_MIN_DAYS = 26;
const MONTHLY_MAX_DAYS = 35;
const QUARTERLY_MIN_DAYS = 80;
const QUARTERLY_MAX_DAYS = 110;
const YEARLY_MIN_DAYS = 330;
const YEARLY_MAX_DAYS = 400;

const MONTHLY_MIN_INTERVALS = 3;
const QUARTERLY_MIN_INTERVALS = 2;
const YEARLY_MIN_INTERVALS = 1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function inferFrequencyFromIntervals(intervalDays: number[]): FrequencyResult {
  if (intervalDays.length === 0) return { frequency: null, confidence: 0 };

  const medianDays = median(intervalDays);
  const n = intervalDays.length;

  if (medianDays >= MONTHLY_MIN_DAYS && medianDays <= MONTHLY_MAX_DAYS && n >= MONTHLY_MIN_INTERVALS) {
    return { frequency: "monthly", confidence: Math.min(0.9, 0.5 + (n + 1) * 0.05) };
  }
  if (medianDays >= QUARTERLY_MIN_DAYS && medianDays <= QUARTERLY_MAX_DAYS && n >= QUARTERLY_MIN_INTERVALS) {
    return { frequency: "quarterly", confidence: Math.min(0.85, 0.4 + (n + 1) * 0.1) };
  }
  if (medianDays >= YEARLY_MIN_DAYS && medianDays <= YEARLY_MAX_DAYS && n >= YEARLY_MIN_INTERVALS) {
    return { frequency: "yearly", confidence: Math.min(0.8, 0.3 + (n + 1) * 0.15) };
  }

  return { frequency: null, confidence: 0 };
}

export function inferFrequencyFromDates(dates: Date[]): FrequencyResult {
  if (dates.length < 2) return { frequency: null, confidence: 0 };

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
    intervals.push(days);
  }
  return inferFrequencyFromIntervals(intervals);
}
