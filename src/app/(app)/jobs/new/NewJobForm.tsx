"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Co = { id: string; name: string };

export default function NewJobForm({ companies, categories, initialCompany }: { companies: Co[]; categories: string[]; initialCompany?: string }) {
  const r = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState(initialCompany ?? "");
  const match = companies.find((c) => c.name.toLowerCase() === company.trim().toLowerCase());
  const isNew = company.trim().length > 0 && !match;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!match && !isNew) { setErr("Choose a company or type a new company's name."); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      ...(match ? { companyId: match.id } : { newCompany: { name: company.trim(), category: f.category, website: f.website || undefined } }),
      source: f.source, title: f.title, url: f.url, remote: f.remote === "on", postedAt: f.postedAt || undefined, location: f.location || undefined, description: f.description || undefined,
    }) });
    const j = await res.json();
    if (res.ok) r.push(`/jobs/${j.id}`); else { setErr(j.issues?.[0]?.message ?? j.error ?? "Could not save"); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
      <div>
        <label className="label" htmlFor="company">Company</label>
        <input id="company" required list="company-list" autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="Start typing a company" />
        <datalist id="company-list">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <p className="text-[13px] text-slate-500 mt-1">{isNew ? "New company: it will be added to your Accounts when you save." : <>Pick one of your Accounts, or type a new name to add it here. You can also <Link className="link" href="/companies/new">add a company in Accounts</Link>.</>}</p>
      </div>
      <div><label className="label">Source</label><select name="source" className="input"><option value="MANUAL">Employer site</option><option value="LINKEDIN">LinkedIn</option><option value="REFERRAL">Referral</option></select></div>
      {isNew && (
        <div className="md:col-span-2 grid md:grid-cols-2 gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <div><label className="label">Industry</label><select name="category" required className="input">{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label">Company website (optional)</label><input name="website" type="url" placeholder="https://" className="input" /></div>
          <p className="md:col-span-2 text-[13px] text-slate-600">If the posting is on Greenhouse, Lever, Ashby, SmartRecruiters or Workday, the app reads the company&apos;s job board from the link, so its other openings show up in Discover too.</p>
        </div>
      )}
      <div className="md:col-span-2"><label className="label">Exact job title</label><input required name="title" className="input" /></div>
      <div className="md:col-span-2"><label className="label">Posting URL</label><input required type="url" name="url" className="input" placeholder="https://…/jobs/12345" /></div>
      <div><label className="label">Location</label><input name="location" className="input" /></div>
      <div><label className="label">Posted date</label><input type="date" name="postedAt" className="input" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remote" />Remote</label>
      <div className="md:col-span-2"><label className="label">Job description (paste)</label><textarea name="description" rows={10} className="input" /></div>
      {err && <p className="md:col-span-2 text-sm text-red-600">{err}</p>}
      <div><button className="btn-primary" disabled={busy}>{busy ? (isNew ? "Adding company and scoring…" : "Saving…") : isNew ? "Add company, save and score" : "Save and score"}</button></div>
    </form>
  );
}
