"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContactImport() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  async function up(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/contacts/import", { method: "POST", body: fd });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Imported ${j.rows} connections (${j.created} new, ${j.updated} updated). ${j.matched} work at target companies.` : j.error);
    r.refresh();
  }
  return (
    <div className="text-sm space-y-2">
      <p className="text-xs text-slate-500">Upload Connections.csv from LinkedIn&apos;s official data export.</p>
      <label className="btn-primary cursor-pointer">{busy ? "Importing…" : "Choose Connections.csv"}<input type="file" accept=".csv" className="hidden" onChange={up} /></label>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}

export function NewContact({ companies }: { companies: { id: string; name: string }[] }) {
  const r = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (res.ok) { e.currentTarget.reset(); r.refresh(); } else alert((await res.json()).error);
  }
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 text-sm">
      <input name="firstName" required placeholder="First name" className="input" /><input name="lastName" placeholder="Last name" className="input" />
      <input name="title" placeholder="Title" className="input col-span-2" />
      <select name="companyId" className="input col-span-2"><option value="">Company…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input name="linkedinUrl" type="url" placeholder="LinkedIn URL" className="input col-span-2" />
      <select name="role" className="input"><option value="">Relevance</option><option value="recruiter">Recruiter</option><option value="hiring_manager">Hiring manager</option><option value="executive">Executive</option><option value="referral">Referral</option></select>
      <select name="degree" className="input"><option value="">Connection</option><option value="1st">1st</option><option value="2nd">2nd</option><option value="none">None</option></select>
      <button className="btn-primary col-span-2 justify-center">Add contact</button>
    </form>
  );
}

export function OutreachDraft({ contactId, name, company, title, role }: { contactId: string; name: string; company: string; title: string; role?: string }) {
  const base = `Hi ${name},\n\nI'm a senior enterprise sales executive with about nine years at SAP, where I launched the North America Digital Hub sales development team and earned Winners Circle in 2025. ${company} stands out to me${role ? `, and the ${role} opening looks like a strong match for that experience` : ""}.\n\nWould you be open to a brief conversation about how your team is growing${title && /recruit|talent/i.test(title) ? " and what you look for in candidates" : ""}?\n\nThank you,\nVanessa`;
  const [text, setText] = useState(base);
  const [busy, setBusy] = useState(false);
  async function ai() {
    setBusy(true);
    const res = await fetch("/api/assistant/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId }) });
    const j = await res.json(); setBusy(false);
    if (res.ok) setText(j.text); else alert(j.error);
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Drafted from your stated experience only. Edit freely, then copy into LinkedIn or email and log it below.</p>
      <textarea className="input" rows={9} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2"><button className="btn-ghost" onClick={() => navigator.clipboard.writeText(text)}>Copy</button><button className="btn-ghost" disabled={busy} onClick={ai}>{busy ? "Personalizing…" : "Personalize with AI"}</button></div>
    </div>
  );
}

export function ReplyToggle({ id, replied }: { id: string; replied: boolean }) {
  const r = useRouter();
  return <label className="text-xs inline-flex items-center gap-1 mt-1"><input type="checkbox" checked={replied} onChange={async (e) => { await fetch(`/api/touches/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replied: e.target.checked }) }); r.refresh(); }} />Replied</label>;
}
