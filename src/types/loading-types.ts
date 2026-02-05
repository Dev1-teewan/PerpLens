/**
 * Loading state machine types for timeframe data fetching
 */

export type Timeframe = "24H" | "7D" | "30D" | "3M" | "6M" | "1Y";

export const ALL_TIMEFRAMES: Timeframe[] = ["24H", "7D", "30D", "3M", "6M", "1Y"];

export const EXTENDED_TIMEFRAMES: Timeframe[] = ["3M", "6M", "1Y"];

/**
 * Loading phases for the state machine
 */
export type LoadingPhase =
  | "idle"           // No wallet selected
  | "loading_7d"     // Fetching initial 7 days (spinner on 24H, 7D)
  | "7d_loaded"      // 7 days loaded, fetching 30 days (spinner on 30D)
  | "loading_30d"    // Explicitly loading 30 days
  | "30d_loaded"     // 30 days loaded, starting extended fetch
  | "loading_extended" // Loading 3M/6M/1Y sequentially
  | "complete";      // All data loaded

/**
 * Main loading state interface
 */
export interface LoadingState {
  phase: LoadingPhase;
  daysLoaded: number;
  currentlyFetching: Timeframe | null;
  extendedQueue: Timeframe[];  // [3M, 6M, 1Y] - remaining extended timeframes to fetch
  hasCacheHit: boolean;
  has14DayMilestone: boolean;  // Silent milestone for 7D comparison
  error: Error | null;
}

/**
 * Initial loading state
 */
export const initialLoadingState: LoadingState = {
  phase: "idle",
  daysLoaded: 0,
  currentlyFetching: null,
  extendedQueue: ["3M", "6M", "1Y"],
  hasCacheHit: false,
  has14DayMilestone: false,
  error: null,
};

/**
 * Button state for a single timeframe button
 */
export interface TimeframeButtonState {
  timeframe: Timeframe;
  isDisabled: boolean;
  isLoading: boolean;  // Show spinner
  isClickable: boolean;
  isSelected: boolean;
}

/**
 * Get timeframe duration in days
 */
export function getTimeframeDays(timeframe: Timeframe): number {
  switch (timeframe) {
    case "24H": return 1;
    case "7D": return 7;
    case "30D": return 30;
    case "3M": return 90;
    case "6M": return 180;
    case "1Y": return 365;
  }
}

/**
 * Check if timeframe requires extended data loading (>30 days)
 */
export function isExtendedTimeframe(timeframe: Timeframe): boolean {
  return EXTENDED_TIMEFRAMES.includes(timeframe);
}

/**
 * Cache state for a wallet
 */
export interface CacheState {
  hasCache: boolean;
  oldestCachedDate: number;  // Unix timestamp
  newestCachedDate: number;  // Unix timestamp
  daysCovered: number;
}

/**
 * Loading progress for UI display
 */
export interface LoadingProgress {
  loadedMonths: number;
  totalMonths: number;
  phase: "cache" | "fetch" | "complete";
}
