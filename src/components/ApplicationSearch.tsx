"use client";
import Link from "next/link";
import { useState } from "react";
import { SEARCH_BY, type SearchBy } from "@/lib/searchBy";

export default function ApplicationSearch({ by, q }: { by: SearchBy; q: string }) {
  const [mode, setMode] = useState<SearchBy>(by);
  const value = mode === by ? q : "";
  return (
    <form action="/" method="get" className="flex flex-wrap items-center gap-2">
      <select name="by" className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as SearchBy)} aria-label="Search by">
        {Object.entries(SEARCH_BY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {mode === "date"
        ? <input key="date" type="date" name="q" required className="input w-auto" defaultValue={value} aria-label="Date applied" />
        : <input key={mode} name="q" required className="input min-w-[220px] flex-1" defaultValue={value} placeholder={mode === "company" ? "e.g. Databricks" : "e.g. Strategic Account Executive"} aria-label={SEARCH_BY[mode]} />}
      <button className="btn-primary">Search</button>
      {q && <Link href="/" className="btn-ghost">Clear</Link>}
    </form>
  );
}
