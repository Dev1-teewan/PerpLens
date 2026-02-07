import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowUp, Fuel } from "lucide-react";
import { fetchMarketCandle } from "@/services/drift-api";

export function Header() {
  const [location] = useLocation();
  const [solPrice, setSolPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarketCandle("SOL-PERP").then((price) => {
      if (!cancelled) setSolPrice(price);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDashboard = location === "/";
  const isScanner = location === "/scanner";

  return (
    <header className="sticky top-0 z-50 h-16 flex justify-between items-center border-b border-white/5 bg-background/80 backdrop-blur-md px-4 sm:px-6 lg:px-8">
      <div className="flex items-center">
        <Link href="/" className="flex items-center gap-4">
          <span className="text-xl font-display font-bold tracking-tight text-foreground">
            Perp<span className="text-primary">Lens</span>
          </span>
        </Link>
        <div className="h-6 w-px bg-white/10 mx-4" aria-hidden />
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <Link
            href="/"
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isDashboard
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/scanner"
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isScanner
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            Yield Scanner
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3 bg-secondary/30 rounded-full px-4 py-1.5 border border-white/5">
          <span className="flex items-center gap-1.5 text-primary font-medium text-sm">
            <ArrowUp className="w-3.5 h-3.5" />
            {solPrice != null
              ? `$${solPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <Fuel className="w-3.5 h-3.5" />
            Low
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-primary/40 text-primary/90 hover:bg-primary/15 hover:border-primary hover:text-primary"
        >
          Log In
        </Button>
      </div>
    </header>
  );
}
