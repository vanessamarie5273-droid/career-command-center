"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "./Logo";

type Row = {
  id: string; title: string; company: { id: string; name: string; logoUrl: string | null; category: string }; location: string | null; arrangement: string | null;
  postedAt: string | null; firstSeenAt: string; lastVerifiedAt: string; applyUrl: string; score: number | null; aiScore: number | null; tier: string | null; overridden: boolean;
  confidence: string | null; salaryMin: number | null; salaryMax: number | null; oteMin: number | null; oteMax: number | null; category: string | null; status: string; favorite: boolean;
  family: string | null; sources: string[]; application: { id: string; stage: string; applied: boolean } | null; excludedReason: string | null;
};

const k = (n: number) => `$${Math.round(n / 1000)}K`;
const pay = (r: Row) => (r.oteMax || r.oteMin ? `OTE ${r.oteMin && r.oteMax && r.oteMin !== r.oteMax ? `${k(r.oteMin)}–${k(r.oteMax)}` : k((r.oteMax || r.oteMin)!)}` : r.salaryMax || r.salaryMin ? (r.salaryMin && r.salaryMax && r.salaryMin !== r.salaryMax ? `${k(r.salaryMin)}–${k(r.salaryMax)}` : k((r.salaryMax || r.salaryMin)!)) : null);
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

export default function JobsTable({ rows, compact = false }: { rows: Row[]; compact?: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function bulk(action: string) {
    setBusy(true);
    await fetch("/api/jobs/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel], action }) });
    setBusy(false); setSel(new Set()); r.refresh();
  }
  if (!rows.length) return <div className="card p-8 text-center text-sm text-slate-500">No roles match these filters. If no job-feed refresh has run yet, start one from the Command Center.</div>;
  return (
    <div className="card overflow-hidden">
      {!compact && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-navy-950 px-4 py-2 text-sm text-white">
          <span>{sel.size} selected</span>
          <button disabled={busy} onClick={() => bulk("pipeline")} className="btn bg-gold-500 text-navy-950 !py-1">Add to pipeline</button>
          <button disabled={busy} onClick={() => bulk("favorite")} className="btn bg-white/10 !py-1">★ Favorite</button>
          <button disabled={busy} onClick={() => bulk("unfavorite")} className="btn bg-white/10 !py-1">Unfavorite</button>
          <button disabled={busy} onClick={() => bulk("dismiss")} className="btn bg-white/10 !py-1">Dismiss</button>
          <button disabled={busy} onClick={() => bulk("restore")} className="btn bg-white/10 !py-1">Restore</button>
          <button onClick={() => setSel(new Set())} className="ml-auto text-white/60 text-xs">Clear</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            {!compact && <th className="w-8"><input type="checkbox" aria-label="Select all" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((x) => x.id)) : new Set())} /></th>}
            <th>Score</th><th>Role</th><th>Company</th><th>Location</th><th>Published pay</th><th>Posted</th><th>Verified</th><th>Pipeline</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className={x.status === "CLOSED" ? "opacity-60" : ""}>
                {!compact && <td><input type="checkbox" aria-label={`Select ${x.title}`} checked={sel.has(x.id)} onChange={() => toggle(x.id)} /></td>}
                <td className="whitespace-nowrap">
                  <span className={`inline-flex min-w-[2.2rem] justify-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1 ${(x.score ?? 0) >= 72 ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : (x.score ?? 0) >= 60 ? "bg-navy-500/5 text-navy-700 ring-navy-500/20" : "bg-slate-50 text-slate-600 ring-slate-300/40"}`} title={`AI score ${x.aiScore ?? "—"}${x.overridden ? " (overridden)" : ""} · confidence ${x.confidence ?? "—"}`}>{x.score ?? "—"}</span>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{x.tier ? x.tier.replace("TIER", "Tier ") : ""}{x.overridden ? " ✎" : ""}</div>
                </td>
                <td className="min-w-[240px]">
                  <Link href={`/jobs/${x.id}`} className="font-medium text-navy-950 hover:underline">{x.favorite && <span className="text-gold-500 mr-1">★</span>}{x.title}</Link>
                  <div className="text-xs text-slate-500">{x.category === "STRETCH" ? "Stretch · " : x.category === "RELOCATION" ? "Relocation · " : ""}{x.excludedReason ?? x.sources.join(", ").toLowerCase()}</div>
                </td>
                <td className="whitespace-nowrap"><Link href={`/companies/${x.company.id}`} className="inline-flex items-center gap-2 hover:underline"><Logo src={x.company.logoUrl} name={x.company.name} size={20} />{x.company.name}</Link></td>
                <td className="min-w-[150px] text-slate-600">{x.location || "—"}<div className="text-xs text-slate-400">{x.arrangement}</div></td>
                <td className="whitespace-nowrap">{pay(x) ?? <span className="text-slate-400 text-xs">Not published</span>}</td>
                <td className="whitespace-nowrap text-slate-600">{d(x.postedAt)}</td>
                <td className="whitespace-nowrap text-xs text-slate-500" title={new Date(x.lastVerifiedAt).toLocaleString()}>{d(x.lastVerifiedAt)}</td>
                <td className="whitespace-nowrap text-xs">{x.application ? <Link className="link" href={`/applications/${x.application.id}`}>{x.application.applied ? "Applied" : x.application.stage.replace(/_/g, " ").toLowerCase()}</Link> : <span className="text-slate-400">—</span>}</td>
                <td><a href={x.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !py-1 !px-2.5 text-xs">Apply ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
