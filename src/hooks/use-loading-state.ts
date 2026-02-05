/**
 * Reducer-based state machine for loading phases
 * Manages transitions between loading states with predictable behavior
 */

import { useReducer, useCallback, useMemo } from "react";
import type {
  LoadingState,
  LoadingPhase,
  Timeframe,
} from "@/types/loading-types";
import { initialLoadingState, EXTENDED_TIMEFRAMES } from "@/types/loading-types";

/**
 * Action types for state machine
 */
export type LoadingAction =
  | { type: "RESET" }
  | { type: "START_FRESH" }
  | { type: "START_FROM_CACHE"; daysLoaded: number; cachedExtendedTimeframes?: ("3M" | "6M" | "1Y")[] }
  | { type: "7D_LOADED"; daysLoaded: number }
  | { type: "14D_MILESTONE" }
  | { type: "30D_LOADED" }
  | { type: "EXTENDED_LOADED"; timeframe: Timeframe }
  | { type: "COMPLETE" }
  | { type: "SET_FETCHING"; timeframe: Timeframe | null }
  | { type: "SET_ERROR"; error: Error }
  | { type: "UPDATE_DAYS_LOADED"; daysLoaded: number };

/**
 * Reducer for loading state machine
 */
function loadingReducer(state: LoadingState, action: LoadingAction): LoadingState {
  switch (action.type) {
    case "RESET":
      return initialLoadingState;

    case "START_FRESH":
      return {
        ...initialLoadingState,
        phase: "loading_7d",
        currentlyFetching: "7D",
      };

    case "START_FROM_CACHE": {
      // Determine phase based on days loaded in cache
      let phase: LoadingPhase = "loading_7d";
      if (action.daysLoaded >= 30) {
        phase = "30d_loaded";
      } else if (action.daysLoaded >= 7) {
        phase = "7d_loaded";
      }

      // Filter out already cached extended timeframes from the queue
      const cachedExtended = action.cachedExtendedTimeframes || [];
      const baseQueue: ("3M" | "6M" | "1Y")[] = ["3M", "6M", "1Y"];
      const filteredQueue = baseQueue.filter(tf => !cachedExtended.includes(tf));
      console.log("[LoadingState] START_FROM_CACHE", {
        cachedExtendedTimeframes: cachedExtended,
        filteredQueue,
      });

      // Determine currentlyFetching based on phase and remaining queue
      let currentlyFetching: Timeframe | null = null;
      if (phase === "loading_7d") {
        currentlyFetching = "7D";
      } else if (phase === "7d_loaded") {
        currentlyFetching = "30D";
      } else if (phase === "30d_loaded") {
        // Only set currentlyFetching if there are items to fetch
        currentlyFetching = filteredQueue[0] || null;
      }

      // If all extended timeframes are cached, mark as complete
      const finalPhase = phase === "30d_loaded" && filteredQueue.length === 0 ? "complete" : phase;

      return {
        ...state,
        phase: finalPhase,
        daysLoaded: action.daysLoaded,
        hasCacheHit: true,
        has14DayMilestone: action.daysLoaded >= 14,
        currentlyFetching,
        extendedQueue: phase === "30d_loaded" ? filteredQueue : [],
      };
    }

    case "7D_LOADED":
      return {
        ...state,
        phase: "7d_loaded",
        daysLoaded: Math.max(state.daysLoaded, action.daysLoaded),
        currentlyFetching: "30D",
      };

    case "14D_MILESTONE":
      return {
        ...state,
        has14DayMilestone: true,
      };

    case "30D_LOADED":
      // Safety net: do not overwrite state if we are already at or past 30d_loaded.
      // This prevents stray on30DLoaded calls (e.g., from cache hit triggering milestone)
      // from resetting the extendedQueue that was already filtered by startFromCache.
      if (state.phase === "30d_loaded" || state.phase === "loading_extended" || state.phase === "complete") {
        return state;
      }
      console.log("[LoadingState] 30D_LOADED - transitioning to 30d_loaded phase");
      return {
        ...state,
        phase: "30d_loaded",
        daysLoaded: Math.max(state.daysLoaded, 30),
        currentlyFetching: "3M",
        extendedQueue: ["3M", "6M", "1Y"],
      };

    case "EXTENDED_LOADED": {
      const newQueue = state.extendedQueue.filter((tf) => tf !== action.timeframe);
      const nextTimeframe = newQueue[0] || null;
      return {
        ...state,
        phase: newQueue.length > 0 ? "loading_extended" : "complete",
        currentlyFetching: nextTimeframe,
        extendedQueue: newQueue,
      };
    }

    case "COMPLETE":
      return {
        ...state,
        phase: "complete",
        currentlyFetching: null,
        extendedQueue: [],
      };

    case "SET_FETCHING":
      return {
        ...state,
        currentlyFetching: action.timeframe,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        currentlyFetching: null,
      };

    case "UPDATE_DAYS_LOADED":
      return {
        ...state,
        daysLoaded: action.daysLoaded,
        has14DayMilestone: state.has14DayMilestone || action.daysLoaded >= 14,
      };

    default:
      return state;
  }
}

/**
 * Hook for managing loading state machine
 */
export function useLoadingState() {
  const [state, dispatch] = useReducer(loadingReducer, initialLoadingState);

  // Action dispatchers
  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const startFresh = useCallback(() => dispatch({ type: "START_FRESH" }), []);
  const startFromCache = useCallback(
    (daysLoaded: number, cachedExtendedTimeframes?: ("3M" | "6M" | "1Y")[]) =>
      dispatch({ type: "START_FROM_CACHE", daysLoaded, cachedExtendedTimeframes }),
    []
  );
  const on7DLoaded = useCallback(
    (daysLoaded: number) => dispatch({ type: "7D_LOADED", daysLoaded }),
    []
  );
  const on14DMilestone = useCallback(() => dispatch({ type: "14D_MILESTONE" }), []);
  const on30DLoaded = useCallback(() => dispatch({ type: "30D_LOADED" }), []);
  const onExtendedLoaded = useCallback(
    (timeframe: Timeframe) => dispatch({ type: "EXTENDED_LOADED", timeframe }),
    []
  );
  const onComplete = useCallback(() => dispatch({ type: "COMPLETE" }), []);
  const setFetching = useCallback(
    (timeframe: Timeframe | null) => dispatch({ type: "SET_FETCHING", timeframe }),
    []
  );
  const setError = useCallback(
    (error: Error) => dispatch({ type: "SET_ERROR", error }),
    []
  );
  const updateDaysLoaded = useCallback(
    (daysLoaded: number) => dispatch({ type: "UPDATE_DAYS_LOADED", daysLoaded }),
    []
  );

  // Computed helpers
  const shouldShowSpinner = useCallback(
    (tf: Timeframe): boolean => {
      const { phase, currentlyFetching } = state;

      // During initial 7D load, show spinner on both 24H and 7D
      if (phase === "loading_7d" && (tf === "24H" || tf === "7D")) {
        return true;
      }

      // Show spinner on the timeframe currently being fetched
      return currentlyFetching === tf;
    },
    [state]
  );

  const isTimeframeDisabled = useCallback(
    (tf: Timeframe): boolean => {
      const { phase } = state;

      // Nothing disabled once complete
      if (phase === "complete") return false;

      // In idle, everything is disabled
      if (phase === "idle") return true;

      // During loading_7d, 30D and extended are disabled
      if (phase === "loading_7d") {
        return tf === "30D" || EXTENDED_TIMEFRAMES.includes(tf);
      }

      // During 7d_loaded, extended are disabled
      if (phase === "7d_loaded") {
        return EXTENDED_TIMEFRAMES.includes(tf);
      }

      // Once 30D is loaded, nothing is disabled
      return false;
    },
    [state]
  );

  const isTimeframeClickable = useCallback(
    (tf: Timeframe): boolean => {
      return !isTimeframeDisabled(tf);
    },
    [isTimeframeDisabled]
  );

  // Check if comparison data is available
  const hasComparisonData = useMemo(
    () => ({
      "24H": state.daysLoaded >= 2,
      "7D": state.has14DayMilestone,
    }),
    [state.daysLoaded, state.has14DayMilestone]
  );

  // Check if initial load has completed (at least 30D)
  const hasCompletedInitialLoad = useMemo(
    () => state.phase !== "idle" && state.phase !== "loading_7d",
    [state.phase]
  );

  return {
    state,
    // Actions
    reset,
    startFresh,
    startFromCache,
    on7DLoaded,
    on14DMilestone,
    on30DLoaded,
    onExtendedLoaded,
    onComplete,
    onProbeComplete: onComplete,
    setFetching,
    setError,
    updateDaysLoaded,
    // Computed
    shouldShowSpinner,
    isTimeframeDisabled,
    isTimeframeClickable,
    hasComparisonData,
    hasCompletedInitialLoad,
  };
}

export type LoadingStateHook = ReturnType<typeof useLoadingState>;
