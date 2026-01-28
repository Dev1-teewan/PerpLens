import { useState } from "react";
import { type Position } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PositionsTableProps {
  positions: Position[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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
            <TableHead className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Hedge Type</TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Notional</TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Net PnL</TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">Funding</TableHead>
            <TableHead className="text-right font-semibold text-muted-foreground text-xs uppercase tracking-wider">ROI</TableHead>
            <TableHead className="text-center font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => {
            const isExpanded = expandedRows.has(pos.id);
            const netPnl = Number(pos.netPnl);
            const isProfit = netPnl >= 0;

            return (
              <>
                <TableRow 
                  key={pos.id} 
                  className={cn(
                    "cursor-pointer transition-colors border-border/50 hover:bg-muted/30",
                    isExpanded && "bg-muted/20"
                  )}
                  onClick={() => toggleRow(pos.id)}
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
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
                        {pos.pairName.substring(0, 1)}
                      </div>
                      {pos.pairName}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground border-border">
                      {pos.hedgeType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatCurrency(pos.notionalSize)}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono font-medium", isProfit ? "text-primary" : "text-destructive")}>
                    {isProfit ? '+' : ''}{formatCurrency(pos.netPnl)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    +{formatCurrency(pos.fundingEarned)}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono font-medium", Number(pos.roi) >= 0 ? "text-primary" : "text-destructive")}>
                    {formatPercent(pos.roi)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={cn(
                      "bg-opacity-10 border-0",
                      pos.status === 'Open' ? "bg-primary text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {pos.status}
                    </Badge>
                  </TableCell>
                </TableRow>
                
                <AnimatePresence>
                  {isExpanded && (
                    <TableRow key={`${pos.id}-detail`} className="hover:bg-transparent border-border/30 bg-muted/10">
                      <TableCell colSpan={8} className="p-0">
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                              <h4 className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Position Details</h4>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <span className="text-muted-foreground">Current Price:</span>
                                <span className="font-mono text-right">{formatCurrency(pos.currentPrice)}</span>
                                <span className="text-muted-foreground">Entry ROI:</span>
                                <span className={cn("font-mono text-right", Number(pos.roi) >= 0 ? "text-primary" : "text-destructive")}>
                                  {Number(pos.roi).toFixed(2)}%
                                </span>
                              </div>
                            </div>
                            
                            <div className="col-span-2 bg-background/50 rounded-lg p-4 border border-border/50 flex justify-between items-center">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-primary/10 rounded-full text-primary">
                                  <TrendingUp className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase">Long Leg Entry</p>
                                  <p className="font-mono font-medium">{formatCurrency(pos.longEntryPrice)}</p>
                                </div>
                              </div>
                              
                              <div className="h-8 w-[1px] bg-border" />
                              
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-destructive/10 rounded-full text-destructive">
                                  <TrendingDown className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase">Short Leg Entry</p>
                                  <p className="font-mono font-medium">{formatCurrency(pos.shortEntryPrice)}</p>
                                </div>
                              </div>
                              
                              <div className="h-8 w-[1px] bg-border" />
                              
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-accent/10 rounded-full text-accent">
                                  <DollarSign className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase">Est. Annual Funding</p>
                                  <p className="font-mono font-medium text-accent">
                                    {formatCurrency(Number(pos.notionalSize) * 0.12)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </TableCell>
                    </TableRow>
                  )}
                </AnimatePresence>
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
