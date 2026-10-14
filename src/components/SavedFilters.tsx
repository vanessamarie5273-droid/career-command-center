"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type F = { id: string; name: string; query: string };

export default function SavedFilters({ page }: { page: string }) {
  const [items, setItems] = useState<F[]>([]);
  const sp = useSearchParams();
  const path = usePathname();
  const r = useRouter();
  const load = () => fetch(`/api/saved-filters?page=${page}`).then((x) => x.json()).then((x) => setItems(x.items || []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const name = prompt("Name this filter");
    if (!name) return;
    await fetch("/api/saved-filters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, name, query: sp.toString() }) });
    load();
  }
  async function del(id: string) { await fetch(`/api/saved-filters?id=${id}`, { method: "DELETE" }); load(); }
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
      <span className="text-slate-500">Saved filters:</span>
      {items.map((f) => (
        <span key={f.id} className="chip bg-white ring-1 ring-slate-200 gap-1">
          <button onClick={() => r.push(`${path}?${f.query}`)} className="hover:underline">{f.name}</button>
          <button onClick={() => del(f.id)} className="text-slate-400 hover:text-red-600" aria-label={`Delete ${f.name}`}>×</button>
        </span>
      ))}
      <button onClick={save} className="link">+ Save current filter</button>
    </div>
  );
}
