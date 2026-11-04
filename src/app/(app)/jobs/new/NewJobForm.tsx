"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Co = { id: string; name: string };
type Mode = "role" | "company";
type Via = { key: string; label: string };

export default function NewJobForm({ companies, categories, foundVia, initialCompany, initialMode = "role" }: { companies: Co[]; categories: string[]; foundVia: Via[]; initialCompany?: string; initialMode?: Mode }) {
  const r = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [company, setCompany] = useState(initialCompany ?? "");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState<string | null>(null); // until she picks, follows whether there's a posting link
  const match = companies.find((c) => c.name.toLowerCase() === company.trim().toLowerCase());
  const isNew = company.trim().length > 0 && !match;
  const role = mode === "role";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!match && !isNew) { setErr("Choose a company or type a new company's name."); return; }
    if (!role && match && !f.contactName && !f.notes && !f.foundUrl) { r.push(`/companies/${match.id}`); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      ...(match ? { companyId: match.id } : { newCompany: { name: company.trim(), category: f.category, website: f.website || undefined } }),
      companyOnly: !role,
      ...(role ? { title: f.title, url: f.url, remote: f.remote === "on", postedAt: f.postedAt, location: f.location, description: f.description } : {}),
      source: f.source, foundUrl: f.foundUrl, notes: f.notes,
      ...(f.contactName?.trim() ? { contact: { name: f.contactName, title: f.contactTitle, linkedinUrl: f.contactLinkedin } } : {}),
    }) });
    const j = await res.json();
    if (res.ok) r.push(role ? `/jobs/${j.id}` : `/companies/${j.companyId}`);
    else { setErr(j.issues?.[0]?.message ?? j.error ?? "Could not save"); setBusy(false); }
  }

  const tab = (m: Mode, label: string) => (
    <button type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
      className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition ${mode === m ? "bg-white text-[#4424e6] shadow-sm ring-1 ring-[#cbbdff]" : "text-slate-600 hover:text-slate-900"}`}>{label}</button>
  );
  const button = busy ? (isNew ? "Adding company…" : "Saving…")
    : role ? (isNew ? "Add company and role" : "Save role and score")
    : isNew ? "Add company" : "Save to account";

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3 max-w-3xl">
      <div className="md:col-span-2">
        <div role="tablist" aria-label="What are you adding?" className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          {tab("role", "A role")}{tab("company", "Just the company")}
        </div>
        <p className="text-[13px] text-slate-500 mt-1.5">{role ? "Posted or not. If you heard about it in a comment or a conversation, leave the link blank." : "Add a company to your Accounts to target it, even with no opening yet."}</p>
      </div>

      <div className="md:col-span-2">
        <label className="label" htmlFor="company">Company</label>
        <input id="company" required list="company-list" autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="Start typing a company" />
        <datalist id="company-list">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <p className="text-[13px] text-slate-500 mt-1">{isNew ? "New company: it will be added to your Accounts when you save." : match ? "Already one of your Accounts." : "Pick one of your Accounts, or type a new name to add it."}</p>
      </div>
      {isNew && (
        <div className="md:col-span-2 grid md:grid-cols-2 gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
          <div><label className="label" htmlFor="category">Industry</label><select id="category" name="category" required className="input">{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="label" htmlFor="website">Company website (optional)</label><input id="website" name="website" type="url" placeholder="https://" className="input" /></div>
          <p className="md:col-span-2 text-[13px] text-slate-600">The app looks for the company&apos;s public job board when you save, so its other openings show up in Discover too.</p>
        </div>
      )}

      {role && (
        <>
          <div className="md:col-span-2"><label className="label" htmlFor="title">Role title</label><input id="title" required name="title" className="input" placeholder="e.g. Enterprise Account Executive, Southwest" /></div>
          <div><label className="label" htmlFor="location">Location (optional)</label><input id="location" name="location" className="input" placeholder="Phoenix, AZ" /></div>
          <label className="flex items-center gap-2 text-sm md:mt-6"><input type="checkbox" name="remote" />Remote</label>
          <div className="md:col-span-2">
            <label className="label" htmlFor="url">Posting URL (optional)</label>
            <input id="url" type="url" name="url" value={url} onChange={(e) => setUrl(e.target.value)} className="input" placeholder="https://…/jobs/12345" />
            <p className="text-[13px] text-slate-500 mt-1">The posting&apos;s own link, not a careers homepage. Leave blank if it isn&apos;t posted yet.</p>
          </div>
        </>
      )}

      <fieldset className="md:col-span-2 grid md:grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-[13px] font-semibold text-slate-700">Where you heard about it</legend>
        <div><label className="label" htmlFor="source">How</label><select id="source" name="source" className="input" value={source ?? (role && url ? "MANUAL" : "FEED")} onChange={(e) => setSource(e.target.value)}>{foundVia.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
        <div><label className="label" htmlFor="foundUrl">Link to the post or comment (optional)</label><input id="foundUrl" name="foundUrl" type="url" className="input" placeholder="https://www.linkedin.com/posts/…" /></div>
        <div><label className="label" htmlFor="contactName">Who mentioned it (optional)</label><input id="contactName" name="contactName" className="input" placeholder="Full name" /></div>
        <div><label className="label" htmlFor="contactTitle">Their title (optional)</label><input id="contactTitle" name="contactTitle" className="input" placeholder="e.g. VP Sales" /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="contactLinkedin">Their LinkedIn profile (optional)</label><input id="contactLinkedin" name="contactLinkedin" type="url" className="input" placeholder="https://www.linkedin.com/in/…" /></div>
        <p className="md:col-span-2 -mt-1 text-[13px] text-slate-500">A name saves them to My Network on this account, so you can follow up with them.</p>
        <div className="md:col-span-2"><label className="label" htmlFor="notes">Notes (optional)</label><textarea id="notes" name="notes" rows={3} className="input" placeholder={role ? "What they said: team, territory, hiring manager, timing" : "Why this company, who you know there, what you heard"} /></div>
      </fieldset>

      {role && (
        <details className="md:col-span-2 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-slate-700">Posting details (optional)</summary>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div><label className="label" htmlFor="postedAt">Posted date</label><input id="postedAt" type="date" name="postedAt" className="input" /></div>
            <div className="md:col-span-2"><label className="label" htmlFor="description">Job description (paste)</label><textarea id="description" name="description" rows={8} className="input" /></div>
          </div>
        </details>
      )}

      {err && <p className="md:col-span-2 text-sm text-red-600">{err}</p>}
      <div><button className="btn-primary" disabled={busy}>{button}</button></div>
    </form>
  );
}
