import { useState } from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from "recharts";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { type DailyMetric } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

interface PnLChartsProps {
  data: DailyMetric[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card/95 backdrop-blur-md border border-border/50 p-4 rounded-xl shadow-xl">
        <p className="text-muted-foreground text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm font-mono">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-foreground font-semibold">
              ${Number(entry.value).toFixed(2)}
            </span>
            <span className="text-muted-foreground capitalize">
              {entry.name.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function PnLCharts({ data }: PnLChartsProps) {
  const [activeTab, setActiveTab] = useState("cumulative");

  // Transform dates for charts
  const chartData = data.map(d => ({
    ...d,
    formattedDate: format(new Date(d.date), "MMM dd"),
    dailyPnlNum: Number(d.dailyPnl),
    cumulativePnlNum: Number(d.cumulativePnl),
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <Card className="bg-card border-border shadow-lg shadow-black/20 col-span-1 lg:col-span-2 overflow-hidden h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">PnL Analysis</CardTitle>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="cumulative" className="text-xs px-3 py-1.5">Cumulative</TabsTrigger>
            <TabsTrigger value="daily" className="text-xs px-3 py-1.5">Daily PnL</TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs px-3 py-1.5">Heatmap</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      
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
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#27d388" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#27d388" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2d" vertical={false} />
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
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27d388', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area 
                    type="monotone" 
                    dataKey="cumulativePnlNum" 
                    stroke="#27d388" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPnl)" 
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2d" vertical={false} />
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
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="dailyPnlNum" name="Daily PnL" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.dailyPnlNum >= 0 ? '#27d388' : '#ff4d4d'} 
                      />
                    ))}
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
              className="h-full w-full grid grid-cols-7 gap-2 overflow-y-auto custom-scrollbar pr-2"
            >
              {chartData.map((day, idx) => (
                <div 
                  key={idx}
                  className="aspect-square rounded-md flex flex-col items-center justify-center p-1 border transition-all hover:scale-105"
                  style={{
                    backgroundColor: day.dailyPnlNum > 0 
                      ? `rgba(39, 211, 136, ${Math.min(0.8, Math.max(0.1, Math.abs(day.dailyPnlNum) / 500))})`
                      : `rgba(255, 77, 77, ${Math.min(0.8, Math.max(0.1, Math.abs(day.dailyPnlNum) / 500))})`,
                    borderColor: day.dailyPnlNum > 0 ? 'rgba(39, 211, 136, 0.2)' : 'rgba(255, 77, 77, 0.2)'
                  }}
                >
                  <span className="text-[10px] text-muted-foreground">{day.formattedDate}</span>
                  <span className={`text-xs font-bold ${day.dailyPnlNum > 0 ? 'text-primary' : 'text-destructive'}`}>
                    {day.dailyPnlNum > 0 ? '+' : ''}{day.dailyPnlNum.toFixed(0)}
                  </span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
