"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewCompanyForm({ categories }: { categories: string[] }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const f = Object.fromEntries([...new FormData(e.currentTarget)].filter(([, v]) => v !== ""));
    const res = await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json();
    if (res.ok) r.push(`/companies/${j.id}`); else { setErr(j.error); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
      <div><label className="label">Name</label><input name="name" required className="input" /></div>
      <div><label className="label">Website</label><input name="website" type="url" required placeholder="https://" className="input" /></div>
      <div><label className="label">Industry</label><select name="category" className="input">{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div><label className="label">Headquarters</label><input name="headquarters" className="input" /></div>
      <div><label className="label">Ownership</label><input name="ownership" placeholder="Public / Private" className="input" /></div>
      <div><label className="label">Job board hint (optional)</label><input name="atsHint" placeholder="greenhouse:acme or ashby:acme" className="input" /></div>
      <div className="md:col-span-2"><label className="label">Description</label><textarea name="description" rows={3} className="input" /></div>
      {err && <p className="text-sm text-red-600 md:col-span-2">{err}</p>}
      <div><button className="btn-primary" disabled={busy}>{busy ? "Adding and checking job board…" : "Add company"}</button></div>
    </form>
  );
}
