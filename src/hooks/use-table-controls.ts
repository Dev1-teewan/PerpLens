import { useState, useMemo, useCallback } from "react";

export interface SortConfig<K extends string> {
  key: K;
  direction: "asc" | "desc";
}

interface UseTableControlsOptions<T, K extends string> {
  items: T[];
  defaultSortKey: K;
  defaultDirection?: "asc" | "desc";
  /** Map of sort key → function that extracts a comparable value (number or string). */
  valueExtractors: Record<K, (item: T) => number | string>;
  /** Optional function that returns a searchable string from an item. */
  searchExtractor?: (item: T) => string;
}

/**
 * Generic hook for table sorting and text search filtering.
 * Clicking the same column toggles direction; a new column defaults to desc.
 */
export function useTableControls<T, K extends string>({
  items,
  defaultSortKey,
  defaultDirection = "desc",
  valueExtractors,
  searchExtractor,
}: UseTableControlsOptions<T, K>) {
  const [sortConfig, setSortConfig] = useState<SortConfig<K>>({
    key: defaultSortKey,
    direction: defaultDirection,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSort = useCallback((key: K) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
  }, []);

  const processedItems = useMemo(() => {
    let filtered = items;

    if (searchQuery && searchExtractor) {
      const q = searchQuery.toLowerCase();
      filtered = items.filter((item) =>
        searchExtractor(item).toLowerCase().includes(q)
      );
    }

    const extractor = valueExtractors[sortConfig.key];
    if (!extractor) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = extractor(a);
      const bVal = extractor(b);
      const asc = sortConfig.direction === "asc";
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return asc ? cmp : -cmp;
      }
      const numA = Number(aVal);
      const numB = Number(bVal);
      return asc ? numA - numB : numB - numA;
    });
  }, [items, searchQuery, searchExtractor, sortConfig, valueExtractors]);

  return {
    sortConfig,
    toggleSort,
    searchQuery,
    setSearchQuery,
    processedItems,
  };
}
