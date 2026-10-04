"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatDayMonth } from "@/lib/format";

export type DailyPoint = { day: string; gross_cents: number; orders: number };

export function SalesChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#dedee5" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayMonth}
            tick={{ fill: "#9497a9", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => formatBRL(v).replace(/,\d{2}$/, "")}
            tick={{ fill: "#9497a9", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            cursor={{ fill: "rgba(133,91,251,0.08)" }}
            formatter={(value) => [formatBRL(Number(value)), "Receita bruta"]}
            labelFormatter={(label) => formatDayMonth(String(label))}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #dedee5",
              boxShadow: "rgba(0,0,0,0.03) 0px 4px 24px",
            }}
          />
          <Bar dataKey="gross_cents" fill="#7132f5" radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
