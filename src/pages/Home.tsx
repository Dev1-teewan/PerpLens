import { useState, useEffect, useRef } from "react";
import { useStrategy, type Timeframe } from "@/hooks/use-strategies";
import { MetricCard } from "@/components/MetricCard";
import { PnLCharts } from "@/components/PnLCharts";
import { PositionsTable } from "@/components/PositionsTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  Activity,
  Wallet,
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  X,
  Clock,
  Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SEARCH_HISTORY_KEY = "pnl-dashboard-search-history";
const MAX_HISTORY_ITEMS = 10;

function loadSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load search history:", e);
  }
  return [];
}

function saveSearchHistory(history: string[]) {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Failed to save search history:", e);
  }
}

const MOCK_ACCOUNT_DISPLAY = "Mock account";
const MOCK_ACCOUNT_KEY = "main-account";

function isMockAccount(value: string): boolean {
  const t = value.trim().toLowerCase();
  return t === "" || t === MOCK_ACCOUNT_DISPLAY.toLowerCase();
}

export default function Home() {
  const [walletKey, setWalletKey] = useState(MOCK_ACCOUNT_KEY);
  const [inputValue, setInputValue] = useState(MOCK_ACCOUNT_DISPLAY);
  const [hasClearedDefault, setHasClearedDefault] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("7D");
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputFocus = () => {
    if (!hasClearedDefault && inputValue === MOCK_ACCOUNT_DISPLAY) {
      setInputValue("");
      setHasClearedDefault(true);
    }
    setShowDropdown(true);
  };

  const { data, isLoading, isLoadingMore, isError, refetch, isRefetching } =
    useStrategy(walletKey, timeframe);

  // Load search history on mount
  useEffect(() => {
    setSearchHistory(loadSearchHistory());
  }, []);

  // Show error dialog when error occurs
  useEffect(() => {
    if (isError) {
      setShowErrorDialog(true);
    }
  }, [isError]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter history based on input
  const filteredHistory = searchHistory.filter((item) =>
    item.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addToSearchHistory = (address: string) => {
    if (!address || isMockAccount(address) || address === MOCK_ACCOUNT_KEY) return;

    const newHistory = [
      address,
      ...searchHistory.filter((item) => item !== address),
    ].slice(0, MAX_HISTORY_ITEMS);

    setSearchHistory(newHistory);
    saveSearchHistory(newHistory);
  };

  const removeFromHistory = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHistory = searchHistory.filter((item) => item !== address);
    setSearchHistory(newHistory);
    saveSearchHistory(newHistory);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedValue = inputValue.trim();
    const key = isMockAccount(trimmedValue) ? MOCK_ACCOUNT_KEY : trimmedValue;
    if (trimmedValue) {
      setShowErrorDialog(false);
      setWalletKey(key);
      if (!isMockAccount(trimmedValue)) addToSearchHistory(trimmedValue);
      setShowDropdown(false);
      setSelectedIndex(-1);
    }
  };

  const handleSelectHistory = (address: string) => {
    setInputValue(address);
    setWalletKey(address);
    addToSearchHistory(address);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredHistory.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredHistory.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredHistory.length - 1
      );
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectHistory(filteredHistory[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setSelectedIndex(-1);
    }
  };

  const handleDismissError = () => {
    setShowErrorDialog(false);
    setWalletKey(MOCK_ACCOUNT_KEY);
    setInputValue(MOCK_ACCOUNT_DISPLAY);
    setHasClearedDefault(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="PerpLens"
              className="w-16 h-16 object-contain"
            />
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight">
                Perp<span className="text-primary">Lens</span>
              </h1>
              <p className="text-xs text-muted-foreground font-mono tracking-widest">
                FUNDING STRATEGIES MONITOR
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 relative" ref={dropdownRef}>
            <div className="flex items-center gap-3 bg-card border border-border rounded-full p-1 pl-4">
              <Search className="w-4 h-4 text-muted-foreground" />
              <form onSubmit={handleSearch}>
                <input
                  ref={inputRef}
                  className="bg-transparent border-none focus:outline-none text-sm w-64 text-foreground placeholder:text-muted-foreground/50"
                  placeholder="Enter Wallet Subkey..."
                  value={inputValue}
                  onFocus={handleInputFocus}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setShowDropdown(true);
                    setSelectedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  autoComplete="off"
                />
              </form>
              <Button
                size="sm"
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 font-semibold shadow-[0_0_20px_-5px_rgba(39,211,136,0.4)] transition-all"
                onClick={handleSearch}
                disabled={isLoading || isRefetching}
              >
                {isRefetching ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Load Strategy
              </Button>
            </div>

            {/* Custom Dropdown */}
            <AnimatePresence>
              {showDropdown && filteredHistory.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-full min-w-[400px] bg-card border border-border rounded-xl shadow-xl shadow-black/30 overflow-hidden z-50"
                >
                  <div className="p-2 border-b border-border/50">
                    <p className="text-xs text-muted-foreground font-medium px-2">Recent Searches</p>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto">
                    {filteredHistory.map((address, index) => (
                      <div
                        key={address}
                        onClick={() => handleSelectHistory(address)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group ${
                          index === selectedIndex
                            ? "bg-primary/10 text-foreground"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Clock className="w-4 h-4 shrink-0 opacity-50" />
                        <span className="flex-1 text-sm font-mono truncate">
                          {address}
                        </span>
                        <button
                          onClick={(e) => removeFromHistory(address, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-all"
                          title="Remove from history"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

            <div className="flex items-center gap-2">
            <div className="hidden sm:flex bg-muted rounded-lg p-1 items-center gap-1">
              {(["24H", "7D", "30D"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                    timeframe === tf
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf}
                  {tf === "30D" && isLoadingMore && (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Error Dialog Popup */}
      <AnimatePresence>
        {showErrorDialog && isError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <button
                onClick={handleDismissError}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-4">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold mb-2">
                  Failed to load strategy data
                </h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  We couldn&apos;t fetch the strategy data for &quot;{walletKey === MOCK_ACCOUNT_KEY ? MOCK_ACCOUNT_DISPLAY : walletKey}&quot;.
                  The server might be unreachable or the wallet address may be invalid.
                </p>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    onClick={handleDismissError}
                    className="flex-1"
                  >
                    Go Back
                  </Button>
                  <Button
                    onClick={() => {
                      setShowErrorDialog(false);
                      refetch();
                    }}
                    className="flex-1 bg-primary hover:bg-primary/90"
                    disabled={isRefetching}
                  >
                    {isRefetching ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Try Again
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-b-accent/50 rounded-full animate-spin [animation-duration:1.5s]" />
          </div>
          <p className="mt-4 text-muted-foreground animate-pulse">
            Synchronizing on-chain data...
          </p>
        </div>
      ) : data ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Top Section - Status & Last Updated */}
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-3xl font-bold mb-1">Portfolio Snapshot</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${isLoadingMore ? 'bg-yellow-400' : 'bg-primary'} animate-pulse`} />
                {isLoadingMore ? 'Loading 30-day data...' : 'Live Connection'}
                <span className="mx-2 text-border">|</span>
                Last updated:{" "}
                {new Date(data.updatedAt || new Date()).toLocaleTimeString()}
                <span className="mx-2 text-border">|</span>
                Viewing: {timeframe}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-border hover:bg-muted text-muted-foreground"
            >
              <RefreshCw className="w-3 h-3 mr-2" />
              Refresh Data
            </Button>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(() => {
              const prev = data.previousPeriodFundingPnl != null ? Number(data.previousPeriodFundingPnl) : null;
              const curr = Number(data.totalFundingPnl);
              const hasComparison = prev != null && timeframe !== "30D" && !Number.isNaN(prev) && prev !== 0;
              const pctChange = hasComparison ? ((curr - prev) / Math.abs(prev)) * 100 : null;
              const vsLabel =
                timeframe === "24H" ? "vs last 24h" : timeframe === "7D" ? "vs last 7 days" : "vs last period";
              const subValue =
                pctChange != null
                  ? `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}% ${vsLabel}`
                  : vsLabel;
              const trend = pctChange != null ? (pctChange >= 0 ? "up" : "down") : (curr >= 0 ? "up" : "down");
              return (
                <MetricCard
                  label="Total Funding PnL"
                  value={`$${curr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  subValue={subValue}
                  trend={trend}
                  icon={<TrendingUp className="w-5 h-5" />}
                  delay={0}
                  highlight={curr >= 0}
                />
              );
            })()}
            <MetricCard
              label="Current APY"
              value={data.currentApy && Number(data.currentApy) > 0 ? `${Number(data.currentApy).toFixed(2)}%` : "—"}
              subValue="Annualized return"
              trend={data.currentApy && Number(data.currentApy) > 0 ? "up" : "neutral"}
              icon={<Activity className="w-5 h-5" />}
              delay={1}
            />
            <MetricCard
              label="Active Notional"
              value={data.activeNotional && Number(data.activeNotional) > 0 ? `$${Number(data.activeNotional).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}
              subValue="Total position value"
              trend="neutral"
              icon={<Wallet className="w-5 h-5" />}
              delay={2}
            />
            <MetricCard
              label="Open Positions"
              value={data.positions.length.toString()}
              subValue="Active markets"
              trend="neutral"
              icon={<RefreshCw className="w-5 h-5" />}
              delay={3}
            />
          </div>

          {/* Main Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Charts Section - 2/3 width */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="lg:col-span-2 h-[450px]"
            >
              <PnLCharts data={data.dailyMetrics} timeframe={timeframe} />
            </motion.div>

            {/* Quick Stats / Info - 1/3 width */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-6"
            >
              <div className="bg-card border border-border rounded-2xl p-6 shadow-lg shadow-black/20">
                <h3 className="text-lg font-bold mb-4">Risk Parameters</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Max Drawdown
                    </span>
                    <span className="font-mono font-medium text-destructive">
                      -2.4%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-destructive h-full rounded-full w-[12%]" />
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">
                      Exposure Ratio
                    </span>
                    <span className="font-mono font-medium text-primary">
                      0.85
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full w-[85%]" />
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-muted-foreground">
                      Hedge Health
                    </span>
                    <Badge
                      variant="outline"
                      className="text-emerald-400 border-emerald-400/20 bg-emerald-400/10"
                    >
                      Excellent
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-accent/20 to-card border border-accent/20 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 blur-[50px] rounded-full translate-x-10 -translate-y-10" />
                <h3 className="text-lg font-bold mb-2">Pro Tip</h3>
                <p className="text-sm text-muted-foreground mb-4 relative z-10">
                  Funding rates on SOL-PERP have increased by 0.02% in the last
                  4 hours. Consider increasing position size.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-accent/30 text-accent hover:bg-accent/10 hover:text-accent"
                >
                  View Analysis
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Positions Table - Full Width */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <PositionsTable positions={data.positions} />
          </motion.div>
        </main>
      ) : !isError ? (
        // No data found (404 case)
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
          <div className="p-4 rounded-full bg-muted text-muted-foreground mb-4">
            <Search className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold mb-2">No strategy data found</h2>
          <p className="text-muted-foreground mb-6 max-w-md text-sm">
            We couldn&apos;t find any funding payment records for &quot;{walletKey === MOCK_ACCOUNT_KEY ? MOCK_ACCOUNT_DISPLAY : walletKey}&quot;.
            Try a different wallet address or load demo data.
          </p>
          <Button
            onClick={() => {
              setWalletKey(MOCK_ACCOUNT_KEY);
              setInputValue(MOCK_ACCOUNT_DISPLAY);
              setHasClearedDefault(false);
            }}
            className="bg-primary hover:bg-primary/90"
          >
            Load Demo Data
          </Button>
        </div>
      ) : null}
    </div>
  );
}
