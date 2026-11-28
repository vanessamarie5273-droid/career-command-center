"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, NAV, UTILITY, navFor } from "./icons";
import { APP_SHORT } from "@/lib/brand";

/** Six workspaces up top; Alerts, Resumes, Settings and Sign out in a quieter utility area at the foot. */
export default function Sidebar({ alerts }: { alerts: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const cur = navFor(path)?.href;
  return (
    <>
      <button className="lg:hidden fixed top-2.5 left-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-900 text-white" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-56 flex-col text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#ffffff22" /><path d="M18 40 L30 24 L38 34 L46 20" stroke="#e9e3ff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="leading-tight"><div className="text-[12px] uppercase tracking-[0.18em] text-violet-200">Vanessa&apos;s</div><div className="text-[15px] font-semibold">{APP_SHORT}</div></div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Workspaces">
          {NAV.map((n) => <Item key={n.href} href={n.href} label={n.label} icon={n.icon} on={cur === n.href} close={() => setOpen(false)} />)}
        </nav>
        <div className="border-t border-white/10 px-3 py-3" aria-label="Utilities">
          {UTILITY.map((n) => <Item key={n.href} href={n.href} label={n.label} icon={n.icon} on={cur === n.href} close={() => setOpen(false)} small badge={n.href === "/alerts" ? alerts : 0} />)}
          <form action="/api/auth/logout" method="post">
            <button className="mt-1 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] text-white/70 hover:bg-white/10 hover:text-white">
              <span className="inline-flex w-7 justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg></span>Sign out
            </button>
          </form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

function Item({ href, label, icon, on, close, small, badge = 0 }: { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"]; on: boolean; close: () => void; small?: boolean; badge?: number }) {
  return (
    <Link href={href} onClick={close} aria-current={on ? "page" : undefined}
      className={`group mb-1 flex items-center gap-3 rounded-lg px-3 font-medium transition ${small ? "h-9 text-[14px]" : "h-11 text-[15.5px]"} ${on ? "bg-white/20 text-white ring-1 ring-white/30" : small ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
      <span className={`inline-flex shrink-0 items-center justify-center rounded-md ${small ? "h-7 w-7" : "h-8 w-8"} ${on ? "bg-white text-brand-700" : "text-current"}`}><Icon name={icon} size={small ? 16 : 18} /></span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && <span className="min-w-[22px] rounded-full bg-white px-1.5 text-center text-[12px] font-bold leading-[20px] text-brand-700">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}
