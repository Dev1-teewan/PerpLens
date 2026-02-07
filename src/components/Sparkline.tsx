import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";

interface SparklineProps {
  data: { value: number }[];
  width?: number;
  height?: number;
  color?: string;
  showAxis?: boolean;
}

export function Sparkline({
  data,
  width = 80,
  height = 32,
  color,
  showAxis = false,
}: SparklineProps) {
  if (data.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-muted-foreground text-xs"
      >
        —
      </div>
    );
  }

  // Determine color based on trend (first to last value)
  const firstValue = data[0]?.value ?? 0;
  const lastValue = data[data.length - 1]?.value ?? 0;
  const isPositive = lastValue >= firstValue;
  const lineColor = color || (isPositive ? "#27d388" : "#ff4d4d");

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`sparkGradient-${lineColor}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          {showAxis && (
            <YAxis
              domain={["dataMin", "dataMax"]}
              hide
            />
          )}
          {data.some(d => d.value < 0) && (
            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" strokeWidth={0.5} />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={1.5}
            fill={`url(#sparkGradient-${lineColor})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
