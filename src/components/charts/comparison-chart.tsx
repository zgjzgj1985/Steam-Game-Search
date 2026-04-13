"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DataSet {
  name: string;
  data: number[];
  color?: string;
}

interface ComparisonChartProps {
  data: {
    labels: string[];
    datasets: DataSet[];
  };
  className?: string;
}

export function ComparisonChart({ data, className }: ComparisonChartProps) {
  const chartData = data.labels.map((label, index) => {
    const entry: Record<string, string | number> = { name: label };
    data.datasets.forEach((dataset) => {
      entry[dataset.name] = dataset.data[index];
    });
    return entry;
  });

  const colors = data.datasets.map((d, i) => d.color || `hsl(${i * 120}, 70%, 50%)`);

  return (
    <div className={`w-full h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={80}
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px"
            }}
          />
          <Legend />
          {data.datasets.map((dataset, index) => (
            <Bar
              key={dataset.name}
              dataKey={dataset.name}
              fill={colors[index]}
              radius={[0, 4, 4, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}