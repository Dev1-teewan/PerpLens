/**
 * Pure UI state computation for timeframe buttons
 * Maps loading state to button visual states
 */

import { useMemo } from "react";
import type { LoadingState, Timeframe, TimeframeButtonState } from "@/types/loading-types";
import { ALL_TIMEFRAMES, EXTENDED_TIMEFRAMES } from "@/types/loading-types";

/**
 * Button state matrix based on loading phase
 *
 * | Phase           | 24H     | 7D      | 30D     | 3M      | 6M      | 1Y      |
 * |-----------------|---------|---------|---------|---------|---------|---------|
 * | idle            | disabled| disabled| disabled| disabled| disabled| disabled|
 * | loading_7d      | spinner | spinner | disabled| disabled| disabled| disabled|
 * | 7d_loaded       | click   | click   | spinner | disabled| disabled| disabled|
 * | loading_30d     | click   | click   | spinner | disabled| disabled| disabled|
 * | 30d_loaded      | click   | click   | click   | spinner | disabled| disabled|
 * | loading_ext 3M  | click   | click   | click   | spinner | disabled| disabled|
 * | loading_ext 6M  | click   | click   | click   | click   | spinner | disabled|
 * | loading_ext 1Y  | click   | click   | click   | click   | click   | spinner |
 * | complete        | click   | click   | click   | click   | click   | click   |
 */

function getButtonState(
  tf: Timeframe,
  loadingState: LoadingState,
  selectedTimeframe: Timeframe
): TimeframeButtonState {
  const { phase, currentlyFetching } = loadingState;
  const isSelected = tf === selectedTimeframe;

  // Idle state - all disabled
  if (phase === "idle") {
    return {
      timeframe: tf,
      isDisabled: true,
      isLoading: false,
      isClickable: false,
      isSelected,
    };
  }

  // Loading 7D - spinner on 24H/7D, disabled on rest
  if (phase === "loading_7d") {
    const isShortTimeframe = tf === "24H" || tf === "7D";
    return {
      timeframe: tf,
      isDisabled: !isShortTimeframe,
      isLoading: isShortTimeframe,
      isClickable: false,
      isSelected,
    };
  }

  // 7D loaded or loading 30D - click 24H/7D, spinner on 30D, disabled on extended
  if (phase === "7d_loaded" || phase === "loading_30d") {
    const isShortTimeframe = tf === "24H" || tf === "7D";
    const is30D = tf === "30D";
    return {
      timeframe: tf,
      isDisabled: EXTENDED_TIMEFRAMES.includes(tf),
      isLoading: is30D,
      isClickable: isShortTimeframe,
      isSelected,
    };
  }

  // 30D loaded - all short timeframes clickable, spinner on first extended
  if (phase === "30d_loaded") {
    const isExtended = EXTENDED_TIMEFRAMES.includes(tf);
    const isFirstExtended = tf === "3M";

    // Extended timeframes after 3M are disabled
    const isDisabled = isExtended && tf !== "3M";

    return {
      timeframe: tf,
      isDisabled,
      isLoading: isFirstExtended,
      isClickable: !isExtended || tf === "3M",
      isSelected,
    };
  }

  // Loading extended - show spinner on current, clickable on loaded
  if (phase === "loading_extended") {
    const isCurrentlyLoading = currentlyFetching === tf;

    // Determine which extended timeframes are loaded
    const loadedExtended = EXTENDED_TIMEFRAMES.filter(
      (extTf) => !loadingState.extendedQueue.includes(extTf) && extTf !== currentlyFetching
    );

    // Check if this timeframe is in the queue (not yet loaded)
    const isInQueue = loadingState.extendedQueue.includes(tf);

    // Non-extended timeframes are always clickable
    const isNonExtended = !EXTENDED_TIMEFRAMES.includes(tf);

    return {
      timeframe: tf,
      isDisabled: isInQueue && !isCurrentlyLoading,
      isLoading: isCurrentlyLoading,
      isClickable: isNonExtended || loadedExtended.includes(tf) || isCurrentlyLoading,
      isSelected,
    };
  }

  // Complete - all clickable
  return {
    timeframe: tf,
    isDisabled: false,
    isLoading: false,
    isClickable: true,
    isSelected,
  };
}

/**
 * Hook that computes button states for all timeframes
 */
export function useTimeframeButtons(
  loadingState: LoadingState,
  selectedTimeframe: Timeframe
): TimeframeButtonState[] {
  return useMemo(
    () =>
      ALL_TIMEFRAMES.map((tf) =>
        getButtonState(tf, loadingState, selectedTimeframe)
      ),
    [loadingState, selectedTimeframe]
  );
}

/**
 * Get the set of timeframes currently showing a loading spinner
 */
export function getLoadingTimeframes(loadingState: LoadingState): Set<Timeframe> {
  const loading = new Set<Timeframe>();
  const { phase, currentlyFetching } = loadingState;

  if (phase === "loading_7d") {
    loading.add("24H");
    loading.add("7D");
  } else if (currentlyFetching) {
    loading.add(currentlyFetching);
  }

  return loading;
}

/**
 * Get the primary loading timeframe (for status display)
 */
export function getCurrentlyLoadingTimeframe(loadingState: LoadingState): Timeframe | null {
  const { phase, currentlyFetching } = loadingState;

  if (phase === "loading_7d") {
    return "7D";
  }

  return currentlyFetching;
}
