import { useState, useEffect, useCallback } from "react";
import { fetchUserState } from "@/services/drift-api";
import type { DriftUserResponse } from "@/services/drift-types";

interface UseUserStateResult {
  userState: DriftUserResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Hook to fetch and maintain user account state from Drift API
 * Includes health, leverage, collateral, positions, and balances
 */
export function useUserState(accountId: string): UseUserStateResult {
  const [userState, setUserState] = useState<DriftUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchState = useCallback(async () => {
    if (!accountId || accountId === "main-account") {
      setUserState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchUserState(accountId);
      setUserState(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch user state"));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  // Fetch on mount and when accountId changes
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Set up refresh interval
  useEffect(() => {
    if (!accountId || accountId === "main-account") return;

    const interval = setInterval(() => {
      fetchUserState(accountId).then(data => {
        if (data) {
          setUserState(data);
        }
      }).catch(err => {
        console.warn("Error refreshing user state:", err);
      });
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [accountId]);

  return {
    userState,
    isLoading,
    error,
    refetch: fetchState,
  };
}
