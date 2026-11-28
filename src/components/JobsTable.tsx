"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Logo from "./Logo";

type Row = {
  id: string; title: string; company: { id: string; name: string; logoUrl: string | null; category: string; growthScore?: number | null }; location: string | null; arrangement: string | null;
  postedAt: string | null; firstSeenAt: string; lastVerifiedAt: string; applyUrl: string; score: number | null; aiScore: number | null; tier: string | null; overridden: boolean;
  confidence: string | null; salaryMin: number | null; salaryMax: number | null; oteMin: number | null; oteMax: number | null; category: string | null; status: string; favorite: boolean;
  family: string | null; sources: string[]; application: { id: string; stage: string; applied: boolean } | null; excludedReason: string | null;
};

const k = (n: number) => `$${Math.round(n / 1000)}K`;
const pay = (r: Row) => (r.oteMax || r.oteMin ? `OTE ${r.oteMin && r.oteMax && r.oteMin !== r.oteMax ? `${k(r.oteMin)}–${k(r.oteMax)}` : k((r.oteMax || r.oteMin)!)}` : r.salaryMax || r.salaryMin ? (r.salaryMin && r.salaryMax && r.salaryMin !== r.salaryMax ? `${k(r.salaryMin)}–${k(r.salaryMax)}` : k((r.salaryMax || r.salaryMin)!)) : null);
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const scoreTone = (n: number | null) => ((n ?? 0) >= 72 ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : (n ?? 0) >= 60 ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "bg-slate-50 text-slate-600 ring-slate-300/40");

// Columns she can sort by, and the Discover sort each one sets. "" is the default: most recently posted first.
const SORTS: { label: string; sort: string; className?: string }[] = [
  { label: "Score", sort: "score" }, { label: "Role", sort: "" }, { label: "Company", sort: "company", className: "hidden lg:table-cell" },
  { label: "Location", sort: "location", className: "hidden xl:table-cell" }, { label: "Published pay", sort: "comp", className: "hidden sm:table-cell" }, { label: "Posted", sort: "", className: "hidden xl:table-cell" },
];

/**
 * The Discover table. Each row has one main action (Save, or the posting once saved) and a ⋯ menu for the rest, so
 * the feed reads as a list of roles rather than a wall of checkboxes. "Select several" brings back the checkboxes
 * for bulk changes. Clicking a role opens it in the side panel without leaving the feed.
 */
export default function JobsTable({ rows, compact = false, restorable = false }: { rows: Row[]; compact?: boolean; restorable?: boolean }) {
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  const sp = useSearchParams();
  const path = usePathname();
  const href = (o: Record<string, string>) => { const u = new URLSearchParams(sp.toString()); for (const [key, v] of Object.entries(o)) { if (v) u.set(key, v); else u.delete(key); } return `${path}?${u}`; };
  const view = sp.get("view");
  const sort = sp.get("sort") ?? "";
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function bulk(action: string, ids = [...sel]) {
    setBusy(true);
    const res = await fetch("/api/jobs/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action }) });
    setBusy(false);
    if (!res.ok) { alert("That change was not saved. Try again."); return; }
    setSel(new Set()); r.refresh();
  }
  async function save(id: string) {
    setBusy(true);
    const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: id }) });
    setBusy(false);
    if (res.ok) r.refresh(); else alert((await res.json().catch(() => ({}))).error ?? "Could not save the role");
  }
  if (!rows.length) return <div className="card p-8 text-center text-sm text-ink-3">No roles match these filters. If no job-feed refresh has run yet, start one from Settings.</div>;
  const checks = !compact && selecting;
  return (
    <div className="card overflow-hidden">
      {!compact && (
        <div className="flex min-h-[48px] flex-wrap items-center gap-2 border-b border-ink-line px-4 py-2 text-[13px]">
          {selecting && sel.size > 0 ? (
            <>
              <span className="font-semibold text-ink">{sel.size} selected</span>
              <button disabled={busy} onClick={() => bulk("pipeline")} className="btn-primary btn-sm">Save to Ready to Apply</button>
              <button disabled={busy} onClick={() => bulk("applied")} className="btn-ghost btn-sm">Mark applied</button>
              <button disabled={busy} onClick={() => bulk("favorite")} className="btn-ghost btn-sm">★ Favorite</button>
              <button disabled={busy} onClick={() => bulk("unfavorite")} className="btn-ghost btn-sm">Unfavorite</button>
              <button disabled={busy} onClick={() => bulk("dismiss")} className="btn-ghost btn-sm">Not a fit</button>
              <button disabled={busy} onClick={() => bulk("duplicate")} className="btn-ghost btn-sm">Duplicate</button>
              {restorable && <button disabled={busy} onClick={() => bulk("restore")} className="btn-ghost btn-sm">Restore to feed</button>}
            </>
          ) : <span className="text-ink-3">{view ? "Sorted by this view. Pick Your Feed to sort by a column." : "Click a column to sort. Click a role to see the fit."}</span>}
          <button onClick={() => { setSelecting(!selecting); setSel(new Set()); }} className="link ml-auto">{selecting ? "Done selecting" : "Select several"}</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead><tr>
            {checks && <th className="w-8"><input type="checkbox" aria-label="Select all" checked={sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((x) => x.id)) : new Set())} /></th>}
            {SORTS.map((c) => {
              const on = !view && c.label !== "Role" && (c.label === "Posted" ? !sort : sort === c.sort);
              const can = !compact && !view && c.label !== "Role";
              return <th key={c.label} className={c.className} aria-sort={on ? (c.sort === "company" || c.sort === "location" ? "ascending" : "descending") : undefined}>{can ? <Link href={href({ sort: c.sort, page: "" })} scroll={false} className="inline-flex items-center gap-1 hover:underline">{c.label}{on && <span aria-hidden>{c.sort === "company" || c.sort === "location" ? "▲" : "▼"}</span>}</Link> : c.label}</th>;
            })}
            <th className="hidden 2xl:table-cell">Status</th><th><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {rows.map((x) => {
              const open = x.status === "OPEN";
              const roleHref = compact ? `/jobs/${x.id}` : href({ job: x.id });
              return (
                <tr key={x.id} className={!open ? "opacity-60" : sel.has(x.id) ? "bg-brand-50" : ""}>
                  {checks && <td><input type="checkbox" aria-label={`Select ${x.title}`} checked={sel.has(x.id)} onChange={() => toggle(x.id)} /></td>}
                  <td className="whitespace-nowrap">
                    <span className={`inline-flex min-w-[2.2rem] justify-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums ring-1 ${scoreTone(x.score)}`} title={`AI score ${x.aiScore ?? "—"}${x.overridden ? " (overridden)" : ""} · confidence ${x.confidence ?? "—"}`}>{x.score ?? "—"}</span>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{x.tier ? x.tier.replace("TIER", "Tier ") : ""}{x.overridden ? " ✎" : ""}</div>
                  </td>
                  <td className="min-w-[150px] xl:min-w-[220px]">
                    <Link href={roleHref} scroll={false} className="font-semibold text-ink hover:text-brand-700 hover:underline">{x.favorite && <span className="mr-1 text-accent-500" aria-label="Favorite">★</span>}{x.title}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
                      <span className="lg:hidden">{x.company.name} ·</span><span className="xl:hidden">{x.postedAt ? `posted ${d(x.postedAt)} ·` : ""}</span>
                      {(x.company.growthScore ?? 0) >= 85 && <span className="chip tone-good" title={`Growth potential ${x.company.growthScore}/100 (AI assessment)`}>Hypergrowth</span>}
                      {x.category === "STRETCH" && <span className="chip tone-progress">Stretch</span>}
                      {x.category === "RELOCATION" && <span className="chip tone-due" title="On-site or hybrid outside Arizona">Relocation</span>}
                      <span>{x.excludedReason ?? x.sources.join(", ").toLowerCase().replace(/_/g, " ")}</span>
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap lg:table-cell"><Link href={`/companies/${x.company.id}`} className="inline-flex items-center gap-2 hover:underline"><Logo src={x.company.logoUrl} name={x.company.name} size={20} />{x.company.name}</Link></td>
                  <td className="hidden min-w-[120px] text-ink-2 xl:table-cell">{x.location || "—"}<div className="text-[13px] text-ink-3">{x.arrangement}</div></td>
                  <td className="hidden whitespace-nowrap sm:table-cell">{pay(x) ?? <span className="text-[13px] text-ink-3">Not published</span>}</td>
                  <td className="hidden whitespace-nowrap xl:table-cell">{x.postedAt ? d(x.postedAt) : <span className="text-[13px] text-ink-3" title="The source did not give a posted date">Not given</span>}<div className="text-[12px] text-ink-3" title={`Last seen on the employer's board ${new Date(x.lastVerifiedAt).toLocaleString()}`}>seen {d(x.lastVerifiedAt)}</div></td>
                  <td className="hidden whitespace-nowrap text-[13px] 2xl:table-cell">{x.application ? <Link className="link" href={x.application.applied ? `/applications/${x.application.id}` : "/apply"}>{x.application.applied ? "Applied" : "Ready to Apply"}</Link> : <span className="text-ink-3">New</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-1">
                      {!compact && !x.application && open ? <button disabled={busy} onClick={() => save(x.id)} className="btn-primary btn-sm" title="Moves this role to Ready to Apply">+ Save</button>
                        : x.applyUrl ? <a href={x.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">Posting ↗</a> : <span className="text-[13px] text-ink-3">Not posted</span>}
                      {!compact && <RowMenu x={x} busy={busy} restorable={restorable} act={(a) => bulk(a, [x.id])} />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The ⋯ menu on a row. Placed with fixed positioning so the table's scroll area never clips it. */
function RowMenu({ x, busy, restorable, act }: { x: Row; busy: boolean; restorable: boolean; act: (action: string) => void }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; if (e.type === "mousedown" && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return; setPos(null); };
    window.addEventListener("mousedown", close); window.addEventListener("keydown", close); window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);
  const open = () => {
    if (pos) return setPos(null);
    const b = btn.current!.getBoundingClientRect();
    const below = window.innerHeight - b.bottom > 300;
    setPos({ top: below ? b.bottom + 4 : Math.max(8, b.top - 296), right: Math.max(8, window.innerWidth - b.right) });
  };
  const live = x.status === "OPEN" && !x.application?.applied;
  const item = "block w-full rounded-md px-3 py-2 text-left text-[14px] text-ink hover:bg-brand-50 disabled:opacity-50";
  const run = (a: string) => { setPos(null); act(a); };
  return (
    <>
      <button ref={btn} onClick={open} aria-haspopup="menu" aria-expanded={!!pos} aria-label={`More actions for ${x.title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-ctl text-ink-3 hover:bg-brand-50 hover:text-brand-700">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {pos && (
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }} className="z-50 w-56 rounded-card border border-ink-line bg-white p-1 shadow-lg">
          <Link role="menuitem" href={`/jobs/${x.id}`} className={item}>Open full page and kit</Link>
          {x.applyUrl && <a role="menuitem" href={x.applyUrl} target="_blank" rel="noopener noreferrer" className={item}>Open employer posting ↗</a>}
          <div className="my-1 border-t border-ink-line" />
          {live && <button role="menuitem" disabled={busy} onClick={() => run("applied")} className={item} title="Move to Applications as Applied and remove from the feed">Mark applied</button>}
          <button role="menuitem" disabled={busy} onClick={() => run(x.favorite ? "unfavorite" : "favorite")} className={item}>{x.favorite ? "Remove favorite" : "★ Favorite"}</button>
          {live && <button role="menuitem" disabled={busy} onClick={() => run("dismiss")} className={item} title="Remove from the feed; counted under Not a Fit">Not a fit</button>}
          {live && <button role="menuitem" disabled={busy} onClick={() => run("duplicate")} className={item} title="Remove this copy from the feed; counted under Duplicates">Duplicate</button>}
          {restorable && <button role="menuitem" disabled={busy} onClick={() => run("restore")} className={item}>Restore to feed</button>}
        </div>
      )}
    </>
  );
}
