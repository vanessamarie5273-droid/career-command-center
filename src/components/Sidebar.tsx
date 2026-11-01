"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, NAV, navFor } from "./icons";

export default function Sidebar({ alerts }: { alerts: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const cur = navFor(path)?.href;
  const active = (h: string) => h === cur;
  return (
    <>
      <button className="lg:hidden fixed top-3 left-3 z-50 rounded-lg bg-navy-900 p-2 text-white" onClick={() => setOpen(!open)} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <aside className={`fixed inset-y-0 left-0 z-40 w-56 bg-gradient-to-b from-navy-950 via-navy-950 to-navy-900 text-white flex flex-col transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/5">
          <svg width="30" height="30" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12224a" /><path d="M18 40 L30 24 L38 34 L46 20" stroke="#c4a254" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="leading-tight"><div className="text-[15px] font-semibold">Career Command</div><div className="text-[11px] uppercase tracking-[0.18em] text-gold-400">Center</div></div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`group mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition ${active(n.href) ? "bg-gradient-to-r from-gold-500/20 to-white/[0.04] text-white ring-1 ring-gold-500/25" : "text-white/70 hover:bg-white/[0.05] hover:text-white"}`}>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${active(n.href) ? "bg-gold-500 text-navy-950" : "bg-white/[0.06] text-white/70 group-hover:text-white"}`}><Icon name={n.icon} size={17} /></span>
              <span className="flex-1">{n.label}</span>
              {n.href === "/reports" && alerts > 0 && <span className="chip bg-gold-500 text-navy-950">{alerts}</span>}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="p-4 border-t border-white/5">
          <button className="w-full text-left text-xs text-white/50 hover:text-white">Sign out</button>
        </form>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
