"use client";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#5D36FF", "#A100C2", "#7458FF", "#D522BF", "#9D85FF", "#f0a6e6"];

export function PipelineDonut({ data }: { data: { label: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div className="flex h-full items-center gap-3">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number, n: string) => [v, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-bold text-navy-950">{total}</span><span className="text-[12px] font-semibold text-slate-500">Active</span></div>
      </div>
      <ul className="min-w-0 space-y-1 text-[14px]">
        {data.map((d, i) => <li key={d.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} /><span className="truncate">{d.label}</span><b className="ml-auto pl-2 tabular-nums">{d.count}</b></li>)}
      </ul>
    </div>
  );
}

export function ReplyBars({ data }: { data: { label: string; sent: number; responded: number }[] }) {
  const rows = data.slice(0, 5).map((d) => ({ ...d, label: d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label, waiting: d.sent - d.responded }));
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number, n: string) => [v, n === "responded" ? "Replied" : "No reply"]} />
          <Bar dataKey="responded" stackId="a" fill="#5D36FF" radius={[4, 0, 0, 4]} barSize={18} isAnimationActive={false} />
          <Bar dataKey="waiting" stackId="a" fill="#e4dcff" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
