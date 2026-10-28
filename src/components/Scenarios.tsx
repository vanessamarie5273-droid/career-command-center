"use client";
import { useState } from "react";

type A = { id: string; label: string; base: number | null; ote: number | null; variable: number | null; signing: number | null; equityValue: number | null; equityType: string | null; isPublic: boolean; source: string | null };
const $ = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function Scenarios({ apps }: { apps: A[] }) {
  const [attain, setAttain] = useState(100);
  const [equityMult, setEquityMult] = useState(1);
  const usable = apps.filter((a) => a.base || a.ote);
  if (!usable.length) return <p className="text-sm text-slate-500">Add base, OTE or equity figures to two or more applications to compare scenarios.</p>;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <label className="label">Quota attainment: {attain}%<input type="range" min={50} max={160} step={5} value={attain} onChange={(e) => setAttain(Number(e.target.value))} className="w-full" /></label>
        <label className="label">Private-equity outcome: {equityMult === 0 ? "worth nothing" : `${equityMult}× your estimate`}<input type="range" min={0} max={3} step={0.5} value={equityMult} onChange={(e) => setEquityMult(Number(e.target.value))} className="w-full" /></label>
      </div>
      <p className="text-xs text-slate-500">Public RSUs use your estimate as-is; private equity scales with the outcome slider. These are scenarios, not forecasts.</p>
      <table className="tbl"><thead><tr><th>Opportunity</th><th>Year-1 cash</th><th>4-year total</th><th>Source</th></tr></thead>
        <tbody>{usable.map((a) => {
          const base = a.base ?? (a.ote ? a.ote / 2 : 0);
          const variable = a.variable ?? (a.ote && a.base ? a.ote - a.base : a.ote ? a.ote / 2 : 0);
          const cash = base + variable * (attain / 100);
          const eq = (a.equityValue ?? 0) * (a.isPublic ? 1 : equityMult);
          const assumed = !a.base || (!a.variable && !(a.ote && a.base));
          return <tr key={a.id}><td>{a.label}{assumed && <div className="text-[11px] text-amber-700">Assumes 50/50 split (base/variable not both recorded)</div>}</td><td className="font-semibold">{$(cash + (a.signing ?? 0))}</td><td>{$(cash * 4 + (a.signing ?? 0) + eq)}</td><td className="text-xs">{a.source ?? "—"}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}
