import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "@/components/SortableHeader";
import { useTableControls } from "@/hooks/use-table-controls";
import { getDriftIconUrl } from "@/lib/drift-icons";
import { TrendingUp, BarChart3, Activity, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { motion } from "framer-motion";
import { fetchDeltaNeutralAPYs, fetchFundingRates } from "@/services/yield-api";
import type { DeltaNeutralRow, FundingRateRow } from "../../shared/yield-types";

// ---------------------------------------------------------------------------
// Sort key types
// ---------------------------------------------------------------------------

type AllPerpsSortKey = "asset" | "fundingHour" | "fundingYear";
type DeltaNeutralSortKey = "asset" | "fundingYear" | "spotApy" | "netApy";

const allPerpsExtractors: Record<AllPerpsSortKey, (r: FundingRateRow) => number | string> = {
  asset: (r) => r.symbol,
  fundingHour: (r) => r.fundingRateHourPct,
  fundingYear: (r) => r.fundingRateYearPct,
};

const fundingArbExtractors: Record<DeltaNeutralSortKey, (r: DeltaNeutralRow) => number | string> = {
  asset: (r) => r.perpSymbol,
  fundingYear: (r) => r.fundingRateYearPct,
  spotApy: (r) => r.lendingApyPct,
  netApy: (r) => r.deltaNeutralApyPct,
};

const reverseArbExtractors: Record<DeltaNeutralSortKey, (r: DeltaNeutralRow) => number | string> = {
  asset: (r) => r.perpSymbol,
  fundingYear: (r) => r.fundingRateYearPct,
  spotApy: (r) => r.borrowingRatePct ?? 0,
  netApy: (r) => -r.fundingRateYearPct - (r.borrowingRatePct ?? 0),
};

function perpSymbolToBase(perpSymbol: string): string {
  return perpSymbol.replace(/-PERP$/, "");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AllPerpsTable({
  rows,
  sortConfig,
  toggleSort,
}: {
  rows: FundingRateRow[];
  sortConfig: { key: AllPerpsSortKey; direction: "asc" | "desc" };
  toggleSort: (key: AllPerpsSortKey) => void;
}) {
  const bestIdx = useMemo(() => {
    if (rows.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].fundingRateYearPct > rows[best].fundingRateYearPct) best = i;
    }
    return best;
  }, [rows]);

  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow className="hover:bg-transparent border-border">
          <SortableHeader<AllPerpsSortKey>
            label="Asset"
            sortKey="asset"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            align="left"
          />
          <SortableHeader<AllPerpsSortKey>
            label="Funding Rate (1h)"
            sortKey="fundingHour"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            className="text-right"
            align="right"
          />
          <SortableHeader<AllPerpsSortKey>
            label="Funding Rate (APR)"
            sortKey="fundingYear"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            className="text-right"
            align="right"
          />
          <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Volatility</TableHead>
          <TableHead className="text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => (
          <TableRow key={row.symbol} className="border-border/50 hover:bg-muted/30 transition-colors">
            <TableCell className="font-medium font-mono">
              <div className="flex items-center gap-2">
                <AssetIcon symbol={row.symbol} />
                <div>
                  <span className="font-semibold">{row.symbol.replace(/-PERP$/, "")}</span>
                  <span className="text-xs text-muted-foreground ml-1">-PERP</span>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-end">
              <span className={row.fundingRateHourPct >= 0 ? "text-primary" : "text-destructive"}>
                {row.fundingRateHourPct >= 0 ? "+" : ""}{row.fundingRateHourPct.toFixed(4)}%
              </span>
            </TableCell>
            <TableCell className="text-right font-mono text-end">
              <span className={`font-bold ${
                idx === bestIdx ? "text-primary text-glow" : row.fundingRateYearPct >= 0 ? "text-primary" : "text-destructive"
              }`}>
                {row.fundingRateYearPct >= 0 ? "+" : ""}{row.fundingRateYearPct.toFixed(2)}%
              </span>
            </TableCell>
            <TableCell className="text-right text-muted-foreground text-xs">
              —
            </TableCell>
            <TableCell className="text-center">
              <TradeButton symbol={row.symbol} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeltaNeutralTable({
  rows,
  mode,
  sortConfig,
  toggleSort,
}: {
  rows: DeltaNeutralRow[];
  mode: "funding-arb" | "reverse-arb";
  sortConfig: { key: DeltaNeutralSortKey; direction: "asc" | "desc" };
  toggleSort: (key: DeltaNeutralSortKey) => void;
}) {
  const getNetApy = (row: DeltaNeutralRow) =>
    mode === "funding-arb"
      ? row.deltaNeutralApyPct
      : -row.fundingRateYearPct - (row.borrowingRatePct ?? 0);

  const bestIdx = useMemo(() => {
    if (rows.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < rows.length; i++) {
      if (getNetApy(rows[i]) > getNetApy(rows[best])) best = i;
    }
    return best;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode]);

  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow className="hover:bg-transparent border-border">
          <SortableHeader<DeltaNeutralSortKey>
            label="Asset"
            sortKey="asset"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            align="left"
          />
          <SortableHeader<DeltaNeutralSortKey>
            label="Perp Funding Rate"
            sortKey="fundingYear"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            className="text-right"
            align="right"
          />
          <SortableHeader<DeltaNeutralSortKey>
            label={mode === "funding-arb" ? "Lending APY" : "Borrow APY"}
            sortKey="spotApy"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            className="text-right"
            align="right"
          />
          <SortableHeader<DeltaNeutralSortKey>
            label="Net Strategy APY"
            sortKey="netApy"
            activeSortKey={sortConfig.key}
            activeDirection={sortConfig.direction}
            onSort={toggleSort}
            className="text-right"
            align="right"
          />
          <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Volatility</TableHead>
          <TableHead className="text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => {
          const netApy = getNetApy(row);
          const spotApy = mode === "funding-arb" ? row.lendingApyPct : (row.borrowingRatePct ?? 0);
          const funding1h = row.fundingRateYearPct / (24 * 365);

          return (
            <TableRow key={row.perpSymbol} className="border-border/50 hover:bg-muted/30 transition-colors">
              <TableCell className="font-medium font-mono">
                <div className="flex items-center gap-2">
                  <AssetIcon symbol={row.perpSymbol} />
                  <div>
                    <span className="font-semibold">{perpSymbolToBase(row.perpSymbol)}</span>
                    <span className="text-xs text-muted-foreground ml-1">-PERP</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-end">
                <div className="space-y-0.5 inline-block text-end">
                  <div className={funding1h >= 0 ? "text-primary" : "text-destructive"}>
                    {funding1h >= 0 ? "+" : ""}{funding1h.toFixed(4)}%
                    <span className="text-muted-foreground text-xs ml-1">1h</span>
                  </div>
                  <div className={`text-xs ${row.fundingRateYearPct >= 0 ? "text-primary/70" : "text-destructive/70"}`}>
                    {row.fundingRateYearPct >= 0 ? "+" : ""}{row.fundingRateYearPct.toFixed(2)}%
                    <span className="text-muted-foreground ml-1">APR</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className={`text-right font-mono text-end ${mode === "reverse-arb" ? "text-destructive" : "text-foreground"}`}>
                {spotApy.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right font-mono text-end">
                <span className={`font-bold ${
                  idx === bestIdx ? "text-primary text-glow" : netApy >= 0 ? "text-primary" : "text-destructive"
                }`}>
                  {netApy >= 0 ? "+" : ""}{netApy.toFixed(1)}%
                </span>
              </TableCell>
              <TableCell className="text-right text-muted-foreground text-xs">
                —
              </TableCell>
              <TableCell className="text-center">
                <TradeButton symbol={row.perpSymbol} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AssetIcon({ symbol }: { symbol: string }) {
  return (
    <div className="relative w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
      <img
        src={getDriftIconUrl(symbol)}
        alt=""
        className="w-full h-full object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

function TradeButton({ symbol }: { symbol: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs h-7 px-3 border-primary/30 text-primary hover:bg-primary/10"
      onClick={() => window.open(`https://app.drift.trade/trade/${symbol}`, "_blank")}
    >
      Trade <ExternalLink className="w-3 h-3 ml-1" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function YieldScanner() {
  // Data fetching — both always active
  const fundingRatesQuery = useQuery({
    queryKey: ["yield", "funding-rates"],
    queryFn: fetchFundingRates,
    staleTime: 60_000,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("503") || msg.includes("unavailable") || msg.includes("not running")) return false;
      return count < 2;
    },
  });

  const deltaNeutralQuery = useQuery({
    queryKey: ["yield", "delta-neutral"],
    queryFn: fetchDeltaNeutralAPYs,
    staleTime: 60_000,
    retry: (count, err) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("503") || msg.includes("unavailable") || msg.includes("not running")) return false;
      return count < 2;
    },
  });

  const fundingRates = fundingRatesQuery.data ?? [];
  const deltaNeutralRows = deltaNeutralQuery.data ?? [];

  // Per-tab sort + search controls
  const allPerpsControls = useTableControls<FundingRateRow, AllPerpsSortKey>({
    items: fundingRates,
    defaultSortKey: "fundingYear",
    valueExtractors: allPerpsExtractors,
    searchExtractor: (r) => r.symbol,
  });

  const fundingArbControls = useTableControls<DeltaNeutralRow, DeltaNeutralSortKey>({
    items: deltaNeutralRows,
    defaultSortKey: "netApy",
    valueExtractors: fundingArbExtractors,
    searchExtractor: (r) => `${r.perpSymbol} ${r.spotSymbol}`,
  });

  const reverseArbControls = useTableControls<DeltaNeutralRow, DeltaNeutralSortKey>({
    items: deltaNeutralRows,
    defaultSortKey: "netApy",
    valueExtractors: reverseArbExtractors,
    searchExtractor: (r) => `${r.perpSymbol} ${r.spotSymbol}`,
  });

  // Summary metrics per tab
  const allPerpsMetrics = useMemo(() => {
    const rows = allPerpsControls.processedItems;
    if (rows.length === 0) return { highest: 0, avg: 0, count: 0, bestLabel: "—" };
    let highest = rows[0].fundingRateYearPct;
    let bestLabel = rows[0].symbol;
    let sum = 0;
    for (const r of rows) {
      sum += r.fundingRateYearPct;
      if (r.fundingRateYearPct > highest) { highest = r.fundingRateYearPct; bestLabel = r.symbol; }
    }
    return { highest, avg: sum / rows.length, count: rows.length, bestLabel };
  }, [allPerpsControls.processedItems]);

  const fundingArbMetrics = useMemo(() => {
    const rows = fundingArbControls.processedItems;
    if (rows.length === 0) return { highest: 0, avg: 0, profitable: 0, bestLabel: "—" };
    let highest = rows[0].deltaNeutralApyPct;
    let bestLabel = rows[0].perpSymbol;
    let sum = 0;
    let profitable = 0;
    for (const r of rows) {
      sum += r.fundingRateYearPct;
      if (r.deltaNeutralApyPct > highest) { highest = r.deltaNeutralApyPct; bestLabel = r.perpSymbol; }
      if (r.deltaNeutralApyPct > 0) profitable++;
    }
    return { highest, avg: sum / rows.length, profitable, bestLabel };
  }, [fundingArbControls.processedItems]);

  const reverseArbMetrics = useMemo(() => {
    const rows = reverseArbControls.processedItems;
    if (rows.length === 0) return { highest: 0, avg: 0, profitable: 0, bestLabel: "—" };
    const getNet = (r: DeltaNeutralRow) => -r.fundingRateYearPct - (r.borrowingRatePct ?? 0);
    let highest = getNet(rows[0]);
    let bestLabel = rows[0].perpSymbol;
    let sum = 0;
    let profitable = 0;
    for (const r of rows) {
      const net = getNet(r);
      sum += r.fundingRateYearPct;
      if (net > highest) { highest = net; bestLabel = r.perpSymbol; }
      if (net > 0) profitable++;
    }
    return { highest, avg: sum / rows.length, profitable, bestLabel };
  }, [reverseArbControls.processedItems]);

  const isLive = (fundingRatesQuery.data && fundingRatesQuery.data.length > 0) ||
    (deltaNeutralQuery.data && deltaNeutralQuery.data.length > 0);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">Yield Scanner</h1>
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary animate-pulse" />
              Live
            </span>
          )}
        </div>

        <Tabs defaultValue="all-perps">
          <TabsList>
            <TabsTrigger value="all-perps">All Perps</TabsTrigger>
            <TabsTrigger value="funding-arb">Funding Arb</TabsTrigger>
            <TabsTrigger value="reverse-arb">Reverse Arb</TabsTrigger>
          </TabsList>

          {/* ---- All Perps Tab ---- */}
          <TabsContent value="all-perps" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <MetricCard
                label="Highest Funding Rate"
                value={`${allPerpsMetrics.highest >= 0 ? "+" : ""}${allPerpsMetrics.highest.toFixed(1)}%`}
                subValue={allPerpsMetrics.bestLabel}
                trend={allPerpsMetrics.highest >= 0 ? "up" : "down"}
                icon={<TrendingUp className="w-4 h-4" />}
                delay={0}
                highlight
              />
              <MetricCard
                label="Avg Funding Rate (APR)"
                value={`${allPerpsMetrics.avg >= 0 ? "+" : ""}${allPerpsMetrics.avg.toFixed(2)}%`}
                trend={allPerpsMetrics.avg >= 0 ? "up" : "down"}
                icon={<BarChart3 className="w-4 h-4" />}
                delay={1}
              />
              <MetricCard
                label="Active Perp Markets"
                value={allPerpsMetrics.count.toString()}
                subValue="Total active markets"
                trend="neutral"
                icon={<Activity className="w-4 h-4" />}
                delay={2}
              />
            </div>

            <TableWrapper
              isLoading={fundingRatesQuery.isLoading}
              isError={fundingRatesQuery.isError}
              error={fundingRatesQuery.error}
              refetch={fundingRatesQuery.refetch}
              count={allPerpsControls.processedItems.length}
              searchQuery={allPerpsControls.searchQuery}
              setSearchQuery={allPerpsControls.setSearchQuery}
            >
              <AllPerpsTable
                rows={allPerpsControls.processedItems}
                sortConfig={allPerpsControls.sortConfig}
                toggleSort={allPerpsControls.toggleSort}
              />
            </TableWrapper>
          </TabsContent>

          {/* ---- Funding Arb Tab ---- */}
          <TabsContent value="funding-arb" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <MetricCard
                label="Highest Net Yield"
                value={`${fundingArbMetrics.highest >= 0 ? "+" : ""}${fundingArbMetrics.highest.toFixed(1)}%`}
                subValue={fundingArbMetrics.bestLabel}
                trend={fundingArbMetrics.highest >= 0 ? "up" : "down"}
                icon={<TrendingUp className="w-4 h-4" />}
                delay={0}
                highlight
              />
              <MetricCard
                label="Avg Funding Rate (APR)"
                value={`${fundingArbMetrics.avg >= 0 ? "+" : ""}${fundingArbMetrics.avg.toFixed(2)}%`}
                trend={fundingArbMetrics.avg >= 0 ? "up" : "down"}
                icon={<BarChart3 className="w-4 h-4" />}
                delay={1}
              />
              <MetricCard
                label="Profitable Pairs"
                value={fundingArbMetrics.profitable.toString()}
                trend="neutral"
                icon={<Activity className="w-4 h-4" />}
                delay={2}
              />
            </div>

            <TableWrapper
              isLoading={deltaNeutralQuery.isLoading}
              isError={deltaNeutralQuery.isError}
              error={deltaNeutralQuery.error}
              refetch={deltaNeutralQuery.refetch}
              count={fundingArbControls.processedItems.length}
              searchQuery={fundingArbControls.searchQuery}
              setSearchQuery={fundingArbControls.setSearchQuery}
            >
              <DeltaNeutralTable
                rows={fundingArbControls.processedItems}
                mode="funding-arb"
                sortConfig={fundingArbControls.sortConfig}
                toggleSort={fundingArbControls.toggleSort}
              />
            </TableWrapper>
          </TabsContent>

          {/* ---- Reverse Arb Tab ---- */}
          <TabsContent value="reverse-arb" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <MetricCard
                label="Highest Net Yield"
                value={`${reverseArbMetrics.highest >= 0 ? "+" : ""}${reverseArbMetrics.highest.toFixed(1)}%`}
                subValue={reverseArbMetrics.bestLabel}
                trend={reverseArbMetrics.highest >= 0 ? "up" : "down"}
                icon={<TrendingUp className="w-4 h-4" />}
                delay={0}
                highlight
              />
              <MetricCard
                label="Avg Funding Rate (APR)"
                value={`${reverseArbMetrics.avg >= 0 ? "+" : ""}${reverseArbMetrics.avg.toFixed(2)}%`}
                trend={reverseArbMetrics.avg >= 0 ? "up" : "down"}
                icon={<BarChart3 className="w-4 h-4" />}
                delay={1}
              />
              <MetricCard
                label="Profitable Pairs"
                value={reverseArbMetrics.profitable.toString()}
                trend="neutral"
                icon={<Activity className="w-4 h-4" />}
                delay={2}
              />
            </div>

            <TableWrapper
              isLoading={deltaNeutralQuery.isLoading}
              isError={deltaNeutralQuery.isError}
              error={deltaNeutralQuery.error}
              refetch={deltaNeutralQuery.refetch}
              count={reverseArbControls.processedItems.length}
              searchQuery={reverseArbControls.searchQuery}
              setSearchQuery={reverseArbControls.setSearchQuery}
            >
              <DeltaNeutralTable
                rows={reverseArbControls.processedItems}
                mode="reverse-arb"
                sortConfig={reverseArbControls.sortConfig}
                toggleSort={reverseArbControls.toggleSort}
              />
            </TableWrapper>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table wrapper with loading/error/search chrome
// ---------------------------------------------------------------------------

function TableWrapper({
  isLoading,
  isError,
  error,
  refetch,
  count,
  searchQuery,
  setSearchQuery,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  count: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/20 overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 h-9 w-[260px] rounded-lg px-3 ring-1 ring-white/5 bg-secondary/20">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              className="bg-transparent border-none focus:outline-none text-sm w-full text-foreground placeholder:text-muted-foreground/50"
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {count} MARKETS
          </Badge>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading yield data...</span>
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <p className="text-sm">{error instanceof Error ? error.message : "Failed to load yield data."}</p>
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="w-3 h-3 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && count === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No markets found.
          </div>
        )}

        {!isLoading && !isError && count > 0 && (
          <div className="w-full overflow-x-auto [&_th]:last:justify-end [&_td]:text-end [&_td:not(:first-child)]:text-end">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  );
}
