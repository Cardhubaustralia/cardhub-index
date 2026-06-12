"use client";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export interface PricePoint {
  t: string; // ISO timestamp
  price: number;
}

export default function PriceChart({ data, up }: { data: PricePoint[]; up: boolean }) {
  const stroke = up ? "#10b981" : "#f43f5e";
  const fill = up ? "#d1fae5" : "#ffe4e6";
  const points = data.map((d) => ({
    ...d,
    label: new Date(d.t).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
            tickLine={false} axisLine={false} minTickGap={40}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }}
            tickLine={false} axisLine={false} width={56}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            formatter={(v) => [`$${Number(v).toFixed(2)}`, "Price"]}
            labelStyle={{ fontWeight: 800 }}
            contentStyle={{ borderRadius: 16, border: "2px solid #e2e8f0", fontWeight: 700 }}
          />
          <Area
            type="monotone" dataKey="price"
            stroke={stroke} strokeWidth={3} fill={fill} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
