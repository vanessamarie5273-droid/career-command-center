"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewApplication({ companies, companyId }: { companies?: { id: string; name: string }[]; companyId?: string }) {
  const [open, setOpen] = useState(false);
  const r = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: companyId ?? f.companyId, title: f.title, stage: "READY_TO_APPLY" }) });
    const j = await res.json();
    if (res.ok) r.push(`/applications/${j.id}`);
  }
  if (!open) return <button className="btn-ghost" onClick={() => setOpen(true)}>+ Company-level pursuit</button>;
  return (
    <form onSubmit={submit} className="card flex flex-wrap items-end gap-2 p-2">
      {!companyId && <select name="companyId" className="input w-48">{companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <input name="title" required placeholder="Target role, e.g. Strategic AE (networking)" className="input w-64" />
      <button className="btn-primary">Create</button>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
