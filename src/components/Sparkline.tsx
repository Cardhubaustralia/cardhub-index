"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export default function Sparkline({
  data,
  up,
}: {
  data: number[];
  up: boolean;
}) {
  if (!data || data.length < 2) {
    return <div className="h-8 w-full" />;
  }
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line
            type="monotone"
            dataKey="v"
            stroke={up ? "#10b981" : "#f43f5e"}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
