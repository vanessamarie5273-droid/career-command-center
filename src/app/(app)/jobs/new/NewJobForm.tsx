"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewJobForm({ companies }: { companies: { id: string; name: string }[] }) {
  const r = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, remote: f.remote === "on", postedAt: f.postedAt || undefined, location: f.location || undefined, description: f.description || undefined }) });
    const j = await res.json();
    if (res.ok) r.push(`/jobs/${j.id}`); else setErr(j.error || "Could not save");
  }
  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
      <div><label className="label">Company</label><select required name="companyId" className="input">{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><p className="text-xs text-slate-500 mt-1">Not listed? Add it in Company Intelligence first.</p></div>
      <div><label className="label">Source</label><select name="source" className="input"><option value="MANUAL">Employer site</option><option value="LINKEDIN">LinkedIn</option><option value="REFERRAL">Referral</option></select></div>
      <div className="md:col-span-2"><label className="label">Exact job title</label><input required name="title" className="input" /></div>
      <div className="md:col-span-2"><label className="label">Posting URL</label><input required type="url" name="url" className="input" placeholder="https://…/jobs/12345" /></div>
      <div><label className="label">Location</label><input name="location" className="input" /></div>
      <div><label className="label">Posted date</label><input type="date" name="postedAt" className="input" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" />Remote</label>
      <div className="md:col-span-2"><label className="label">Job description (paste)</label><textarea name="description" rows={10} className="input" /></div>
      {err && <p className="md:col-span-2 text-sm text-red-600">{err}</p>}
      <div><button className="btn-primary">Save and score</button></div>
    </form>
  );
}
