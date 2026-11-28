"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, navFor } from "./icons";

export default function Topbar({ alerts }: { alerts: number }) {
  const r = useRouter();
  const path = usePathname();
  const [q, setQ] = useState("");
  const tabs = navFor(path)?.tabs;
  return (
    <header className="sticky top-0 z-20 border-b border-ink-line bg-white/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 pl-14 lg:px-6">
        {tabs && (
          <nav className="flex shrink-0 rounded-ctl bg-brand-100 p-1" aria-label="Pages in this workspace">
            {tabs.map((t) => {
              const on = t.href === "/" ? path === "/" : path === t.href || path.startsWith(`${t.href}/`);
              return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`rounded-md px-2.5 py-1 text-[14px] font-semibold transition sm:px-3.5 ${on ? "bg-brand-600 text-white shadow-sm" : "text-brand-800 hover:bg-white/70"}`}>{t.label}</Link>;
            })}
          </nav>
        )}
        <form className={`relative min-w-0 max-w-xl flex-1 ${tabs ? "hidden md:block" : ""}`} onSubmit={(e) => { e.preventDefault(); if (q.trim()) r.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies, jobs, people, applications" className="input rounded-full pl-9" aria-label="Search companies, jobs, contacts and applications" />
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3" /></svg>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/alerts" className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 ring-1 ring-ink-line hover:bg-brand-50" aria-label={`Alerts${alerts ? `, ${alerts} unread` : ""}`}>
            <Icon name="bell" size={17} />
            {alerts > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{alerts > 99 ? "99+" : alerts}</span>}
          </Link>
          <button onClick={() => r.push("/assistant")} className="btn-gold" aria-label="Ask">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg><span className="hidden sm:inline">Ask</span>
          </button>
        </div>
      </div>
    </header>
  );
}
