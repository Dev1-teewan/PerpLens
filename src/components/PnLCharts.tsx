import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { type DailyMetric } from "@/types/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip as RadixTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Timeframe } from "@/hooks/use-strategies";

interface PnLChartsProps {
  data: DailyMetric[];
  timeframe?: Timeframe;
}

/**
 * Parse date string (YYYY-MM-DD or ISO with time) as local date
 */
function parseLocalDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) {
    return dateStr;
  }
  // ISO with time (e.g. hourly "YYYY-MM-DDTHH:00:00")
  if (dateStr.includes("T")) {
    return new Date(dateStr);
  }
  // Parse YYYY-MM-DD as local time by using date parts
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format date to "MMM dd" in local timezone, or "HH:00" when hourly
 */
function formatDateLabel(date: Date, isHourly: boolean): string {
  if (isHourly) {
    return `${date.getHours().toString().padStart(2, "0")}:00`;
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate().toString().padStart(2, "0")}`;
}

const ApyTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = Number(payload[0].value);
    const isPositive = value >= 0;
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/50 p-4 rounded-xl shadow-xl">
        <p className="text-muted-foreground text-sm mb-2">{label}</p>
        <div className="flex items-center gap-2 text-sm font-mono">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isPositive ? "#27d388" : "#ff4d4d" }}
          />
          <span className="text-foreground font-semibold">
            {isPositive ? "+" : ""}
            {value.toFixed(2)}%
          </span>
          <span className="text-muted-foreground">APY</span>
        </div>
      </div>
    );
  }
  return null;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/50 p-4 rounded-xl shadow-xl">
        <p className="text-muted-foreground text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => {
          const value = Number(entry.value);
          const isPositive = value >= 0;
          return (
            <div
              key={index}
              className="flex items-center gap-2 text-sm font-mono"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isPositive ? "#27d388" : "#ff4d4d" }}
              />
              <span className="text-foreground font-semibold">
                ${value.toFixed(2)}
              </span>
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

type DailyChartMode = "pnl" | "apy";

export function PnLCharts({ data, timeframe = "7D" }: PnLChartsProps) {
  const [activeTab, setActiveTab] = useState("cumulative");
  const [dailyChartMode, setDailyChartMode] = useState<DailyChartMode>("pnl");
  const isHourly = timeframe === "24H";

  // Transform dates for charts (using local timezone) - base data without initial zero point
  const baseChartData = useMemo(() => {
    return data
      .map((d) => {
        const localDate = parseLocalDate(d.date);
        const cumulativePnlNum = Number(d.cumulativePnl);
        const apyNum = d.portfolioApy ? parseFloat(d.portfolioApy) : null;
        return {
          ...d,
          formattedDate: formatDateLabel(localDate, isHourly),
          localDate,
          dailyPnlNum: Number(d.dailyPnl),
          cumulativePnlNum,
          apyNum,
          notionalValue: d.notionalValue,
          portfolioApy: d.portfolioApy,
          perMarketBreakdown: d.perMarketBreakdown,
        };
      })
      .sort((a, b) => a.localDate.getTime() - b.localDate.getTime());
  }, [data, isHourly]);

  // Chart data with initial 0 point (for cumulative chart only)
  const cumulativeChartData = useMemo(() => {
    if (baseChartData.length === 0) return [];

    const firstDate = baseChartData[0].localDate;
    const startDate = new Date(firstDate);
    startDate.setDate(startDate.getDate() - 1);

    return [
      {
        formattedDate: formatDateLabel(startDate, isHourly),
        localDate: startDate,
        dailyPnlNum: 0,
        cumulativePnlNum: 0,
        date: startDate,
        dailyPnl: "0",
        cumulativePnl: "0",
      } as any,
      ...baseChartData,
    ];
  }, [baseChartData, isHourly]);

  // Use baseChartData for daily/heatmap, cumulativeChartData for cumulative
  const chartData = baseChartData;

  // Dynamic Y domain for daily bar chart so bars fill more space
  const dailyMax = useMemo(() => {
    if (chartData.length === 0) return 30;
    const max = Math.max(...chartData.map((d) => d.dailyPnlNum), 0);
    // Add 10% padding
    return Math.ceil(max * 1.1) || 30;
  }, [chartData]);

  const dailyMin = useMemo(() => {
    if (chartData.length === 0) return 0;
    const min = Math.min(...chartData.map((d) => d.dailyPnlNum), 0);
    // Only go negative if there are actual negative values
    if (min >= 0) return 0;
    return Math.floor(min * 1.1);
  }, [chartData]);

  // Dynamic Y domain for APY bar chart
  const apyMax = useMemo(() => {
    if (chartData.length === 0) return 30;
    const vals = chartData
      .filter((d) => d.apyNum !== null)
      .map((d) => d.apyNum!);
    if (vals.length === 0) return 30;
    const max = Math.max(...vals, 0);
    return Math.ceil(max * 1.1) || 30;
  }, [chartData]);

  const apyMin = useMemo(() => {
    if (chartData.length === 0) return 0;
    const vals = chartData
      .filter((d) => d.apyNum !== null)
      .map((d) => d.apyNum!);
    if (vals.length === 0) return 0;
    const min = Math.min(...vals, 0);
    if (min >= 0) return 0;
    return Math.floor(min * 1.1);
  }, [chartData]);

  // Check if cumulative has any negative values and calculate gradient split point
  const hasNegativeCumulative = useMemo(() => {
    return cumulativeChartData.some((d) => d.cumulativePnlNum < 0);
  }, [cumulativeChartData]);

  // Calculate where 0 sits as a percentage from top for the gradient split
  // 0 is treated as positive (green)
  const zeroLinePercent = useMemo(() => {
    if (cumulativeChartData.length === 0) return 100;
    const values = cumulativeChartData.map((d) => d.cumulativePnlNum);
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max <= 0) return 0; // All negative
    if (min >= 0) return 100; // All positive (including 0)
    // Calculate percentage from top where 0 line sits
    // Add small offset so 0 is clearly in green zone
    const range = max - min;
    const zeroPos = (max / range) * 100;
    return Math.min(zeroPos + 0.5, 100); // Slight offset to keep 0 in green
  }, [cumulativeChartData]);

  return (
    <Card className="bg-card border-border shadow-lg shadow-black/20 col-span-1 lg:col-span-2 overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">PnL Analysis</CardTitle>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="cumulative" className="text-xs px-3 py-1.5">
              Cumulative
            </TabsTrigger>
            <TabsTrigger value="daily" className="text-xs px-3 py-1.5">
              Daily PnL
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs px-3 py-1.5">
              Heatmap
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <AnimatePresence>
        {activeTab === "daily" && (
          <motion.div
            key="daily-option"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex justify-end px-6 pb-1"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <button
                onClick={() => setDailyChartMode("pnl")}
                className={`transition-colors ${
                  dailyChartMode === "pnl"
                    ? "text-foreground"
                    : "text-muted-foreground/30 hover:text-muted-foreground/60 cursor-pointer"
                }`}
              >
                $
              </button>
              <span className="text-muted-foreground/20">|</span>
              <button
                onClick={() => setDailyChartMode("apy")}
                className={`transition-colors ${
                  dailyChartMode === "apy"
                    ? "text-foreground"
                    : "text-muted-foreground/30 hover:text-muted-foreground/60 cursor-pointer"
                }`}
              >
                APY%
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CardContent className="h-[350px] p-4">
        <AnimatePresence mode="wait">
          {activeTab === "cumulative" && (
            <motion.div
              key="cumulative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeChartData}>
                  <defs>
                    {/* Split gradient: green above 0, red below 0 */}
                    <linearGradient
                      id="splitColorFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#27d388" stopOpacity={0.5} />
                      <stop
                        offset={`${zeroLinePercent}%`}
                        stopColor="#27d388"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset={`${zeroLinePercent}%`}
                        stopColor="#ff4d4d"
                        stopOpacity={0.15}
                      />
                      <stop
                        offset="100%"
                        stopColor="#ff4d4d"
                        stopOpacity={0.5}
                      />
                    </linearGradient>
                    {/* Split gradient for line stroke */}
                    <linearGradient
                      id="splitColorLine"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#27d388" />
                      <stop
                        offset={`${zeroLinePercent}%`}
                        stopColor="#27d388"
                      />
                      <stop
                        offset={`${zeroLinePercent}%`}
                        stopColor="#ff4d4d"
                      />
                      <stop offset="100%" stopColor="#ff4d4d" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a2d"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="formattedDate"
                    stroke="#52525b"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    stroke="#52525b"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  {hasNegativeCumulative && (
                    <ReferenceLine
                      y={0}
                      stroke="#52525b"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{
                      stroke: "#52525b",
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePnlNum"
                    stroke="url(#splitColorLine)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#splitColorFill)"
                    name="Cumulative PnL"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {activeTab === "daily" && (
            <motion.div
              key="daily"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#2a2a2d"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="formattedDate"
                    stroke="#52525b"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#52525b"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={
                      dailyChartMode === "pnl"
                        ? (value) => `$${value}`
                        : (value) => `${value}%`
                    }
                    domain={
                      dailyChartMode === "pnl"
                        ? [dailyMin, dailyMax]
                        : [apyMin, apyMax]
                    }
                  />
                  {dailyChartMode === "apy" && (
                    <ReferenceLine
                      y={0}
                      stroke="#52525b"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Tooltip
                    content={
                      dailyChartMode === "pnl" ? (
                        <CustomTooltip />
                      ) : (
                        <ApyTooltip />
                      )
                    }
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar
                    dataKey={
                      dailyChartMode === "pnl" ? "dailyPnlNum" : "apyNum"
                    }
                    name={dailyChartMode === "pnl" ? "Daily PnL" : "APY"}
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((entry, index) => {
                      const val =
                        dailyChartMode === "pnl"
                          ? entry.dailyPnlNum
                          : (entry.apyNum ?? 0);
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={val >= 0 ? "#27d388" : "#ff4d4d"}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {activeTab === "heatmap" && (
            <motion.div
              key="heatmap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full w-full overflow-auto"
              style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
            >
              <TooltipProvider delayDuration={200}>
                <div
                  className="grid gap-2 w-full min-h-full"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${isHourly ? "6.5rem" : "7rem"}, 1fr))`,
                  }}
                >
                  {chartData.map((day, idx) => {
                    const pnl = day.dailyPnlNum;
                    const isPositive = pnl >= 0;
                    const notional = day.notionalValue
                      ? parseFloat(day.notionalValue)
                      : null;
                    const apy = day.portfolioApy
                      ? parseFloat(day.portfolioApy)
                      : null;
                    const hasBreakdown =
                      day.perMarketBreakdown &&
                      day.perMarketBreakdown.length > 0;

                    const cellContent = (
                      <div
                        className={`min-h-[5rem] rounded-lg flex flex-col items-center justify-center p-2 border transition-all hover:scale-[1.02] cursor-pointer ${
                          isPositive
                            ? "bg-primary/15 border-primary/30 hover:bg-primary/25"
                            : "bg-red-500/10 border-red-400/20 hover:bg-red-500/15"
                        }`}
                      >
                        <span className="text-[10px] text-foreground/70 font-medium">
                          {day.formattedDate}
                        </span>
                        <span
                          className={`text-sm font-bold tabular-nums ${isPositive ? "text-primary" : "text-red-400/90"}`}
                        >
                          {isPositive ? "+" : ""}
                          {pnl.toFixed(2)}
                        </span>
                        {notional !== null && (
                          <span className="text-[9px] text-foreground/60 tabular-nums">
                            $
                            {notional >= 1000
                              ? `${(notional / 1000).toFixed(1)}k`
                              : notional.toFixed(0)}
                          </span>
                        )}
                        {apy !== null && (
                          <span
                            className={`text-[9px] tabular-nums ${apy >= 0 ? "text-primary/80" : "text-red-400/70"}`}
                          >
                            {apy >= 0 ? "+" : ""}
                            {apy.toFixed(1)}% APY
                          </span>
                        )}
                      </div>
                    );

                    if (hasBreakdown) {
                      return (
                        <RadixTooltip key={idx}>
                          <TooltipTrigger asChild>{cellContent}</TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs p-0">
                            <div className="p-3 space-y-2">
                              <div className="flex justify-between items-center border-b border-border pb-2">
                                <span className="font-semibold">
                                  {day.formattedDate}
                                </span>
                                <span
                                  className={`font-bold ${isPositive ? "text-primary" : "text-destructive"}`}
                                >
                                  ${pnl.toFixed(2)}
                                </span>
                              </div>
                              {notional !== null && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Total Notional
                                  </span>
                                  <span className="font-mono">
                                    $
                                    {notional.toLocaleString(undefined, {
                                      maximumFractionDigits: 0,
                                    })}
                                  </span>
                                </div>
                              )}
                              {apy !== null && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Portfolio APY
                                  </span>
                                  <span
                                    className={`font-mono ${apy >= 0 ? "text-primary" : "text-destructive"}`}
                                  >
                                    {apy >= 0 ? "+" : ""}
                                    {apy.toFixed(2)}%
                                  </span>
                                </div>
                              )}
                              {day.perMarketBreakdown &&
                                day.perMarketBreakdown.length > 0 && (
                                  <div className="pt-2 border-t border-border">
                                    <div className="text-xs font-medium mb-1">
                                      Per Market
                                    </div>
                                    <table className="w-full text-[10px]">
                                      <thead>
                                        <tr className="text-muted-foreground">
                                          <th className="text-left pr-2">
                                            Market
                                          </th>
                                          <th className="text-right pr-2">
                                            Funding
                                          </th>
                                          <th className="text-right pr-2">
                                            Notional
                                          </th>
                                          <th className="text-right">APY</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[...day.perMarketBreakdown]
                                          .sort(
                                            (a, b) =>
                                              b.notionalValue - a.notionalValue,
                                          )
                                          .map((m, i) => (
                                            <tr
                                              key={i}
                                              className="tabular-nums"
                                            >
                                              <td className="pr-2 font-medium">
                                                {m.marketName.replace(
                                                  "-PERP",
                                                  "",
                                                )}
                                              </td>
                                              <td
                                                className={`text-right pr-2 ${m.dailyFunding >= 0 ? "text-primary" : "text-destructive"}`}
                                              >
                                                ${m.dailyFunding.toFixed(2)}
                                              </td>
                                              <td className="text-right pr-2">
                                                $
                                                {(
                                                  m.notionalValue / 1000
                                                ).toFixed(1)}
                                                k
                                              </td>
                                              <td
                                                className={`text-right ${m.apy >= 0 ? "text-primary" : "text-destructive"}`}
                                              >
                                                {m.apy.toFixed(1)}%
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                            </div>
                          </TooltipContent>
                        </RadixTooltip>
                      );
                    }

                    return <div key={idx}>{cellContent}</div>;
                  })}
                </div>
              </TooltipProvider>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
