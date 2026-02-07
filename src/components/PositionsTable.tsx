import { useState, useMemo, Fragment } from "react";
import { type Position } from "@/types/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { getDriftIconUrl } from "@/lib/drift-icons";
import { useTableControls } from "@/hooks/use-table-controls";
import { SortableHeader } from "@/components/SortableHeader";
import { Sparkline } from "@/components/Sparkline";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

type PositionSortKey = "notional" | "fundingPnl" | "roi";

const positionExtractors: Record<PositionSortKey, (p: Position) => number> = {
  notional: (p) => Number(p.notionalValue) || 0,
  fundingPnl: (p) => Number(p.fundingEarned) || 0,
  roi: (p) => Number(p.roi) || 0,
};

interface PositionRowProps {
  pos: Position;
  isExpanded: boolean;
  onToggle: () => void;
  formatCurrency: (val: string | number) => string;
  formatPercent: (val: string | number) => string;
  formatTokenAmount: (val: string | number) => string;
}

function PositionRow({ pos, isExpanded, onToggle, formatCurrency, formatPercent, formatTokenAmount }: PositionRowProps) {
  const netPnl = Number(pos.netPnl);
  const isProfit = netPnl >= 0;
  const hasNotionalValue = Number(pos.notionalValue) > 0;

  // Prepare sparkline data from marketDailyMetrics
  const sparklineData = useMemo(() => {
    if (!pos.marketDailyMetrics || pos.marketDailyMetrics.length === 0) {
      return [];
    }
    return pos.marketDailyMetrics.map((m) => ({
      value: Number(m.cumulativePnl),
    }));
  }, [pos.marketDailyMetrics]);

  // Get last cumulative PnL for sparkline color
  const lastCumulativePnl = sparklineData.length > 0
    ? sparklineData[sparklineData.length - 1].value
    : 0;
  const sparklineColor = lastCumulativePnl >= 0 ? "#27d388" : "#ff4d4d";

  // Prepare expanded chart data
  const chartData = useMemo(() => {
    if (!pos.marketDailyMetrics || pos.marketDailyMetrics.length === 0) {
      return [];
    }
    return pos.marketDailyMetrics.map((m) => {
      const date = m.date instanceof Date ? m.date : new Date(m.date);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return {
        date: `${months[date.getMonth()]} ${date.getDate()}`,
        cumulativePnl: Number(m.cumulativePnl),
      };
    });
  }, [pos.marketDailyMetrics]);

  const hasNegativeValues = chartData.some((d) => d.cumulativePnl < 0);

  // Calculate gradient split point for expanded chart (where 0 line sits)
  const zeroLinePercent = useMemo(() => {
    if (chartData.length === 0) return 100;
    const values = chartData.map(d => d.cumulativePnl);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max <= 0) return 0; // All negative
    if (min >= 0) return 100; // All positive
    const range = max - min;
    return (max / range) * 100;
  }, [chartData]);

  return (
    <Fragment>
      <TableRow
        className={cn(
          "cursor-pointer transition-colors border-border/50 hover:bg-muted/30",
          isExpanded && "bg-muted/20"
        )}
        onClick={onToggle}
      >
        <TableCell className="text-center">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium font-mono">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={getDriftIconUrl(pos.pairName)}
                alt=""
                className="w-full h-full object-contain"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const fallback = img.nextElementSibling as HTMLElement;
                  img.style.display = "none";
                  fallback?.classList.remove("hidden");
                  fallback?.classList.add("flex", "items-center", "justify-center");
                }}
              />
              <span className="hidden absolute inset-0 rounded-full bg-accent/20 text-accent text-xs font-bold">
                {pos.pairName.substring(0, 1)}
              </span>
            </div>
            {pos.pairName}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant="secondary"
            className={cn(
              "font-normal text-xs border",
              pos.strategySide === "Short Perp + Long Spot"
                ? "bg-emerald-900/40 text-emerald-400 border-emerald-600/30"
                : "bg-indigo-900/40 text-indigo-400 border-indigo-600/30"
            )}
          >
            {pos.strategySide}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">
          {hasNotionalValue ? formatCurrency(pos.notionalValue) : `${formatTokenAmount(pos.notionalSize)} ${pos.pairName.split("-")[0]}`}
        </TableCell>
        <TableCell className={cn("text-right font-mono font-medium", isProfit ? "text-primary" : "text-destructive")}>
          {isProfit ? '+' : ''}{formatCurrency(pos.fundingEarned)}
        </TableCell>
        <TableCell className={cn("text-right font-mono font-medium", Number(pos.roi) >= 0 ? "text-primary" : "text-destructive")}>
          {formatPercent(pos.roi)}
        </TableCell>
        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center">
            <Sparkline data={sparklineData} width={80} height={28} color={sparklineColor} />
          </div>
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isExpanded && (
          <TableRow key={`${pos.id}-detail`} className="hover:bg-transparent border-border/30 bg-muted/10">
            <TableCell colSpan={7} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left Side - Price & Notional Details */}
                  <div className="space-y-4">
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Position Details</h4>
                    <div className="bg-background/50 rounded-lg p-4 border border-border/50 space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase mb-1">Current Price</p>
                        <p className="font-mono text-xl font-bold text-foreground">
                          {Number(pos.currentPrice) > 0 ? formatCurrency(pos.currentPrice) : "—"}
                        </p>
                      </div>
                      <div className="border-t border-border/50 pt-3">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Notional Value</p>
                        <p className="font-mono text-xl font-bold text-foreground">
                          {hasNotionalValue ? formatCurrency(pos.notionalValue) : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTokenAmount(pos.notionalSize)} {pos.pairName.split("-")[0]}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Side - Cumulative PnL Chart */}
                  <div className="col-span-2 space-y-2">
                    <h4 className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Cumulative PnL</h4>
                    <div className="bg-background/50 rounded-lg p-4 border border-border/50 h-[180px]">
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              {/* Split gradient: green above 0, red below 0 */}
                              <linearGradient id={`posGradientFill-${pos.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#27d388" stopOpacity={0.5} />
                                <stop offset={`${zeroLinePercent}%`} stopColor="#27d388" stopOpacity={0.15} />
                                <stop offset={`${zeroLinePercent}%`} stopColor="#ff4d4d" stopOpacity={0.15} />
                                <stop offset="100%" stopColor="#ff4d4d" stopOpacity={0.5} />
                              </linearGradient>
                              <linearGradient id={`posGradientLine-${pos.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#27d388" />
                                <stop offset={`${zeroLinePercent}%`} stopColor="#27d388" />
                                <stop offset={`${zeroLinePercent}%`} stopColor="#ff4d4d" />
                                <stop offset="100%" stopColor="#ff4d4d" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2d" vertical={false} />
                            <XAxis
                              dataKey="date"
                              stroke="#52525b"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              stroke="#52525b"
                              tick={{ fontSize: 11 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `$${v}`}
                            />
                            {hasNegativeValues && (
                              <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                            )}
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number) => [`$${value.toFixed(2)}`, "Cumulative PnL"]}
                            />
                            <Area
                              type="monotone"
                              dataKey="cumulativePnl"
                              stroke={`url(#posGradientLine-${pos.id})`}
                              strokeWidth={2}
                              fill={`url(#posGradientFill-${pos.id})`}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                          No data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </Fragment>
  );
}

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { sortConfig, toggleSort, processedItems: sortedPositions } = useTableControls<Position, PositionSortKey>({
    items: positions,
    defaultSortKey: "notional",
    defaultDirection: "desc",
    valueExtractors: positionExtractors,
  });

  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const formatCurrency = (val: string | number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(Number(val));
  };

  const formatPercent = (val: string | number) => {
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 2,
    }).format(Number(val) / 100);
  };

  const formatTokenAmount = (val: string | number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(Number(val));
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg shadow-black/20 overflow-hidden">
      <div className="p-6 border-b border-border flex justify-between items-center">
        <h3 className="text-lg font-medium">Active Positions</h3>
        <Badge variant="outline" className="font-mono text-xs">
          {positions.length} PAIRS
        </Badge>
      </div>

      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-[50px]"></TableHead>
            <TableHead className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Pair</TableHead>
            <TableHead className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Strategy Side</TableHead>
            <SortableHeader<PositionSortKey>
              label="Notional"
              sortKey="notional"
              activeSortKey={sortConfig.key}
              activeDirection={sortConfig.direction}
              onSort={toggleSort}
              align="right"
            />
            <SortableHeader<PositionSortKey>
              label="Funding PnL"
              sortKey="fundingPnl"
              activeSortKey={sortConfig.key}
              activeDirection={sortConfig.direction}
              onSort={toggleSort}
              align="right"
            />
            <SortableHeader<PositionSortKey>
              label="ROI"
              sortKey="roi"
              activeSortKey={sortConfig.key}
              activeDirection={sortConfig.direction}
              onSort={toggleSort}
              align="right"
            />
            <TableHead className="text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider w-[100px]">Trend</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPositions.map((pos) => (
            <PositionRow
              key={pos.id}
              pos={pos}
              isExpanded={expandedRows.has(pos.id)}
              onToggle={() => toggleRow(pos.id)}
              formatCurrency={formatCurrency}
              formatPercent={formatPercent}
              formatTokenAmount={formatTokenAmount}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
