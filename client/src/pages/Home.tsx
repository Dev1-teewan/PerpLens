import { useState, useEffect } from "react";
import { useStrategy } from "@/hooks/use-strategies";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [walletKey, setWalletKey] = useState("main-account");
  const [inputValue, setInputValue] = useState("main-account");
  const [timeframe, setTimeframe] = useState("30D");
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const { data, isLoading, isError, refetch, isRefetching } =
    useStrategy(walletKey);

  // Show error dialog when error occurs
  useEffect(() => {
    if (isError) {
      setShowErrorDialog(true);
    }
  }, [isError]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setShowErrorDialog(false); // Hide any existing error dialog
      setWalletKey(inputValue.trim());
    }
  };

  const handleDismissError = () => {
    setShowErrorDialog(false);
    // Reset to default account so user can still use the app
    setWalletKey("main-account");
    setInputValue("main-account");
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight">
                Quant<span className="text-primary">Dash</span>
              </h1>
              <p className="text-xs text-muted-foreground font-mono">
                STRATEGY MONITOR
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 bg-card border border-border rounded-full p-1 pl-4">
            <Search className="w-4 h-4 text-muted-foreground" />
            <form onSubmit={handleSearch}>
              <input
                className="bg-transparent border-none focus:outline-none text-sm w-64 text-foreground placeholder:text-muted-foreground/50"
                placeholder="Enter Wallet Subkey..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
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

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex bg-muted rounded-lg p-1">
              {["24H", "7D", "30D", "90D"].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    timeframe === tf
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf}
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
                  We couldn&apos;t fetch the strategy data for &quot;{walletKey}
                  &quot;. The server might be unreachable or the wallet address
                  may be invalid.
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
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live Connection
                <span className="mx-2 text-border">|</span>
                Last updated:{" "}
                {new Date(data.updatedAt || new Date()).toLocaleTimeString()}
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
            <MetricCard
              label="Total Funding PnL"
              value={`$${Number(data.totalFundingPnl).toLocaleString()}`}
              subValue="+12.5% vs last month"
              trend="up"
              icon={<TrendingUp className="w-5 h-5" />}
              delay={0}
              highlight={true}
            />
            <MetricCard
              label="Current APY"
              value={
                data.currentApy
                  ? `${Number(data.currentApy).toFixed(2)}%`
                  : "N/A"
              }
              subValue="Target: 15.00%"
              trend="neutral"
              icon={<Activity className="w-5 h-5" />}
              delay={1}
            />
            <MetricCard
              label="Active Notional"
              value={
                data.activeNotional
                  ? `$${Number(data.activeNotional).toLocaleString()}`
                  : "N/A"
              }
              subValue="55% Utilization"
              trend="up"
              icon={<Wallet className="w-5 h-5" />}
              delay={2}
            />
            <MetricCard
              label="Open Positions"
              value={data.positions.length.toString()}
              subValue="All Systems Healthy"
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
              <PnLCharts data={data.dailyMetrics} />
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
            We couldn&apos;t find any funding payment records for &quot;
            {walletKey}&quot;. Try a different wallet address or use
            &quot;main-account&quot; to view demo data.
          </p>
          <Button
            onClick={() => {
              setWalletKey("main-account");
              setInputValue("main-account");
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
