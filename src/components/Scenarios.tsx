"use client";
import Link from "next/link";
import { useState } from "react";

type A = { id: string; href?: string; label: string; base: number | null; ote: number | null; variable: number | null; signing: number | null; equityValue: number | null; equityType: string | null; isPublic: boolean; source: string | null };
const $ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function Scenarios({ apps }: { apps: A[] }) {
  const [attain, setAttain] = useState(100);
  const [equityMult, setEquityMult] = useState(1);
  const usable = apps.filter((a) => a.base || a.ote);
  if (!usable.length) return <p className="text-sm text-slate-500">Add base, OTE or equity figures to two or more applications to compare scenarios.</p>;
  const rows = usable.map((a) => {
    const base = a.base ?? (a.ote ? a.ote / 2 : 0);
    const variable = a.variable ?? (a.ote && a.base ? a.ote - a.base : a.ote ? a.ote / 2 : 0);
    const cash = base + variable * (attain / 100) + (a.signing ?? 0);
    const eq = (a.equityValue ?? 0) * (a.isPublic ? 1 : equityMult);
    const assumed = !a.base || (!a.variable && !(a.ote && a.base));
    return { a, cash, total: (cash - (a.signing ?? 0)) * 4 + (a.signing ?? 0) + eq, eq, assumed };
  }).sort((x, y) => y.total - x.total);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Quota attainment <span className="float-right font-semibold text-navy-950 tabular-nums">{attain}%</span><input type="range" min={50} max={160} step={5} value={attain} onChange={(e) => setAttain(Number(e.target.value))} className="mt-1 w-full" /></label>
        <label className="text-xs font-medium text-slate-600">Private-equity outcome <span className="float-right font-semibold text-navy-950">{equityMult === 0 ? "worth nothing" : `${equityMult}× estimate`}</span><input type="range" min={0} max={3} step={0.5} value={equityMult} onChange={(e) => setEquityMult(Number(e.target.value))} className="mt-1 w-full" /></label>
      </div>
      <ul className="space-y-3">
        {rows.map(({ a, cash, total, eq, assumed }, i) => {
          const name = <span className="font-medium text-navy-950">{a.label}</span>;
          return (
            <li key={a.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{i === 0 && <span className="chip mr-1.5 bg-gold-500 text-navy-950">Top</span>}{a.href ? <Link href={a.href} className="hover:underline">{name}</Link> : name}</span>
                <span className="shrink-0 tabular-nums"><span className="font-semibold text-navy-950">{$(cash)}</span><span className="text-slate-400"> yr 1 · </span><span className="text-slate-600">{$(total)}</span><span className="text-slate-400"> 4 yr</span></span>
              </div>
              {/* 4-year total split into cash and equity, scaled to the best scenario. */}
              <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100" style={{ width: `${(total / max) * 100}%`, minWidth: "4%" }}>
                <div className="h-full bg-gradient-to-r from-[#3b5bdb] to-[#5c7cfa]" style={{ width: `${((total - eq) / total) * 100}%` }} />
                {eq > 0 && <div className="h-full bg-gradient-to-r from-violet-500 to-violet-300" style={{ width: `${(eq / total) * 100}%` }} />}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500"><span>Source: {a.source ?? "—"}</span>{eq > 0 && <span className="text-violet-600">Equity {$(eq)}</span>}{assumed && <span className="text-amber-700">Assumes 50/50 split (base/variable not both recorded)</span>}</div>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-[#3b5bdb]" />Cash, 4 years</span><span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-violet-400" />Equity</span>Public RSUs use your estimate as-is; private equity scales with the outcome slider. Scenarios, not forecasts.</p>
    </div>
  );
}
