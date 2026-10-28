"use client";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Validated pair (dataviz validator, light surface): series-1 navy-blue, series-2 gold.
const S1 = "#3b5bdb";
const S2 = "#d4a017";
const AXIS = { fontSize: 11, fill: "#64748b" };
const GRID = <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />;
const TT = { contentStyle: { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgba(15,23,42,.08)" }, cursor: { fill: "rgba(59,91,219,0.06)" } };

/** With `href` on each row, clicking a bar opens the applications behind it. */
export function StageBars({ data }: { data: { label: string; count: number; href?: string }[] }) {
  const router = useRouter();
  if (!data.some((d) => d.count)) return <EmptyChart text="No applications yet. Add one from any job or company." />;
  const open = (row: unknown) => { const href = (row as { payload?: { href?: string } })?.payload?.href; if (href) router.push(href); };
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }} barCategoryGap={4}>
        <CartesianGrid stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={170} interval={0} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...TT} />
        <Bar dataKey="count" name="Applications" fill={S1} radius={[0, 4, 4, 0]} maxBarSize={14} label={{ position: "right", fontSize: 11, fill: "#334155" }} onClick={open} cursor={data.some((d) => d.href) ? "pointer" : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PipelineBars({ data }: { data: { name: string; value: number }[] }) {
  if (!data.some((d) => d.value)) return <EmptyChart text="No matching open roles yet. They appear after the first job-feed refresh." />;
  const fills = ["#c4a254", S1, "#94a3b8"];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 16 }}>
        {GRID}
        <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...TT} />
        <Bar dataKey="value" name="Open matching roles" radius={[4, 4, 0, 0]} maxBarSize={44} label={{ position: "top", fontSize: 11, fill: "#334155" }}>
          {data.map((_, i) => <Cell key={i} fill={fills[i]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IndustryBars({ data }: { data: { category: string; companies: number; matches: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
        <CartesianGrid stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="category" width={190} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="companies" name="Companies monitored" fill={S1} radius={[0, 4, 4, 0]} maxBarSize={9} />
        <Bar dataKey="matches" name="Open matching roles" fill={S2} radius={[0, 4, 4, 0]} maxBarSize={9} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CompBars({ data }: { data: { label: string; ote: number; base: number }[] }) {
  if (!data.some((d) => d.ote || d.base)) return <EmptyChart text="No published pay ranges among matching roles yet." />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} barGap={2}>
        {GRID}
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...TT} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="ote" name="Published OTE (top of range)" fill={S1} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="base" name="Published base/pay range (top)" fill={S2} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeeklyLine({ data }: { data: { week: string; applied: number; moves: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        {GRID}
        <XAxis dataKey="week" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
        <Tooltip contentStyle={TT.contentStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="applied" name="Applications submitted" stroke={S1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="moves" name="Stage changes" stroke={S2} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 px-6 text-center">{text}</div>;
}
