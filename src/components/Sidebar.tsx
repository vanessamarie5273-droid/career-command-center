"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Command Center", icon: "M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" },
  { href: "/jobs", label: "Discover Jobs", icon: "M10 4h4a2 2 0 012 2v1h3a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h3V6a2 2 0 012-2zm0 3h4V6h-4z" },
  { href: "/companies", label: "Company Intelligence", icon: "M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 9h4a1 1 0 011 1v11M8 8h3M8 12h3M8 16h3" },
  { href: "/applications", label: "My Applications", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" },
  { href: "/contacts", label: "Network & Contacts", icon: "M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0M19 8a3 3 0 010 6" },
  { href: "/documents", label: "Resume Library", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  { href: "/compensation", label: "Compensation Intelligence", icon: "M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H7" },
  { href: "/alerts", label: "Alerts & Activity", icon: "M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0" },
  { href: "/reports", label: "Reports & Analytics", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/settings", label: "Settings & Integrations", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export default function Sidebar({ alerts }: { alerts: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <button className="lg:hidden fixed top-3 left-3 z-50 rounded-lg bg-navy-900 p-2 text-white" onClick={() => setOpen(!open)} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-navy-950 text-white flex flex-col transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/5">
          <svg width="30" height="30" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12224a" /><path d="M18 40 L30 24 L38 34 L46 20" stroke="#c4a254" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div className="leading-tight"><div className="text-[15px] font-semibold">Career Command</div><div className="text-[11px] uppercase tracking-[0.18em] text-gold-400">Center</div></div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map((n, i) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`group mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] ${active(n.href) ? "bg-white/[0.07] text-white" : "text-white/65 hover:text-white hover:bg-white/[0.04]"}`}>
              <span className={`w-0.5 h-5 -ml-3 rounded-full ${active(n.href) ? "bg-gold-500" : "bg-transparent"}`} />
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={active(n.href) ? "text-gold-400" : ""}><path d={n.icon} /></svg>
              <span className="flex-1"><span className="text-white/30 mr-1.5 tabular-nums">{i + 1}</span>{n.label}</span>
              {n.href === "/alerts" && alerts > 0 && <span className="chip bg-gold-500 text-navy-950">{alerts}</span>}
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
