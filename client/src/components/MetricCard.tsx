import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  delay?: number;
  highlight?: boolean;
}

export function MetricCard({ 
  label, 
  value, 
  subValue, 
  trend, 
  icon, 
  delay = 0,
  highlight = false
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6 border transition-all duration-300 group",
        highlight 
          ? "bg-primary/5 border-primary/20 shadow-[0_0_30px_-10px_rgba(39,211,136,0.1)]" 
          : "bg-card border-border hover:border-border/80 shadow-lg shadow-black/20"
      )}
    >
      {highlight && (
        <div className="absolute top-0 right-0 p-3 opacity-20">
          <div className="w-24 h-24 bg-primary blur-[60px] rounded-full" />
        </div>
      )}
      
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </h3>
        {icon && (
          <div className={cn(
            "p-2 rounded-lg",
            highlight ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          )}>
            {icon}
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        <div className={cn(
          "text-3xl font-bold font-mono tracking-tight",
          highlight ? "text-primary text-glow" : "text-foreground"
        )}>
          {value}
        </div>
        
        {subValue && (
          <div className={cn(
            "text-sm font-medium flex items-center gap-1",
            trend === "up" ? "text-primary" : 
            trend === "down" ? "text-destructive" : 
            "text-muted-foreground"
          )}>
            {subValue}
          </div>
        )}
      </div>
    </motion.div>
  );
}
