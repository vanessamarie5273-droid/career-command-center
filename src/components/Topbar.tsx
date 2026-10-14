"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Topbar({ email }: { email: string }) {
  const r = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 lg:px-8 h-14 pl-14 lg:pl-8">
        <form className="flex-1 max-w-xl" onSubmit={(e) => { e.preventDefault(); if (q.trim()) r.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies, jobs, contacts, applications…" className="input bg-slate-50" aria-label="Global search" />
        </form>
        <button onClick={() => r.push("/assistant")} className="btn-gold whitespace-nowrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /></svg>Ask
        </button>
        <span className="hidden md:block text-xs text-slate-500">{email}</span>
      </div>
    </header>
  );
}
