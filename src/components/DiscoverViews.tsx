"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type View = { key: string; label: string; href: string; hint?: string };
type Saved = { id: string; name: string; query: string };

/**
 * Discover's views: the main ones as tabs, everything else (more rankings, screened-out lists, her own saved views)
 * in one menu. Replaces the row of category pills and the separate "Saved filters" line.
 */
export default function DiscoverViews({ tabs, more, screened, current }: { tabs: View[]; more: View[]; screened: View[]; current: string }) {
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const sp = useSearchParams();
  const path = usePathname();
  const r = useRouter();
  const load = () => fetch("/api/saved-filters?page=jobs").then((x) => x.json()).then((x) => setSaved(x.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : e.type !== "mousedown" || !box.current?.contains(e.target as Node)) setOpen(null); };
    const scroll = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("mousedown", close); window.addEventListener("keydown", close); window.addEventListener("resize", close); window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); window.removeEventListener("resize", close); window.removeEventListener("scroll", scroll, true); };
  }, [open]);
  const query = (() => { const u = new URLSearchParams(sp.toString()); u.delete("page"); u.delete("job"); return u.toString(); })();
  const mine = saved.find((s) => s.query === query);
  const inMenu = [...more, ...screened].find((v) => v.key === current);
  async function save() {
    if (!name.trim()) return;
    await fetch("/api/saved-filters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: "jobs", name: name.trim(), query }) });
    setName(""); setNaming(false); load();
  }
  async function del(id: string) { await fetch(`/api/saved-filters?id=${id}`, { method: "DELETE" }); load(); }
  const tab = (on: boolean) => `inline-flex h-8 items-center rounded-ctl px-3 text-[13px] font-semibold transition ${on ? "bg-white text-brand-700 shadow-sm" : "text-white/90 hover:bg-white/15"}`;
  const row = (on: boolean) => `block rounded-md px-3 py-2 text-[14px] hover:bg-brand-50 ${on ? "font-semibold text-brand-700" : "text-ink"}`;
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-card bg-white/10 p-1 ring-1 ring-white/20" role="tablist" aria-label="Views">
      {tabs.map((v) => <Link key={v.key} role="tab" aria-selected={current === v.key && !mine} href={v.href} title={v.hint} className={tab(current === v.key && !mine)}>{v.label}</Link>)}
      <div ref={box}>
        <button ref={btn} onClick={() => { if (open) return setOpen(null); const b = btn.current!.getBoundingClientRect(); setOpen({ top: b.bottom + 4, left: Math.max(8, Math.min(b.left, window.innerWidth - 296)) }); }} aria-expanded={!!open} aria-haspopup="menu" className={tab(!!inMenu || !!mine)}>{mine ? mine.name : inMenu ? inMenu.label : "More views"} <span aria-hidden className="ml-1">▾</span></button>
        {open && (
          <div role="menu" style={{ position: "fixed", top: open.top, left: open.left }} className="z-50 max-h-[70vh] w-72 overflow-y-auto rounded-card border border-ink-line bg-white p-1 text-ink shadow-lg">
            <Group title="Rankings">{more.map((v) => <Link key={v.key} role="menuitem" href={v.href} title={v.hint} onClick={() => setOpen(null)} className={row(current === v.key)}>{v.label}</Link>)}</Group>
            <Group title="Screened out and history">{screened.map((v) => <Link key={v.key} role="menuitem" href={v.href} title={v.hint} onClick={() => setOpen(null)} className={row(current === v.key)}>{v.label}</Link>)}</Group>
            <Group title="Your saved views">
              {saved.map((s) => (
                <div key={s.id} className="flex items-center">
                  <button role="menuitem" onClick={() => { setOpen(null); r.push(`${path}?${s.query}`); }} className={`${row(mine?.id === s.id)} flex-1 text-left`}>{s.name}</button>
                  <button onClick={() => del(s.id)} className="h-8 w-8 rounded-md text-ink-3 hover:bg-rose-50 hover:text-rose-700" aria-label={`Delete saved view ${s.name}`}>×</button>
                </div>
              ))}
              {!saved.length && !naming && <p className="px-3 py-1 text-[13px] text-ink-3">None yet. Set filters, then save them here.</p>}
              {naming ? (
                <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex gap-1 px-2 py-1">
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this view" aria-label="Name this view" className="input" />
                  <button className="btn-primary btn-sm">Save</button>
                </form>
              ) : !mine && <button onClick={() => setNaming(true)} className={`${row(false)} w-full text-left text-brand-700`}>+ Save current filters as a view</button>}
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="py-1 [&+&]:border-t [&+&]:border-ink-line"><div className="px-3 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</div>{children}</div>;
}
