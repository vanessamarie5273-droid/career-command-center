"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const post = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function TaskList({ applicationId, tasks }: { applicationId: string; tasks: { id: string; title: string; dueAt: string | null; done: boolean }[] }) {
  const r = useRouter();
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await post("/api/tasks", { applicationId, title: f.get("title"), dueAt: f.get("dueAt") || null });
    e.currentTarget.reset(); r.refresh();
  }
  return (
    <div className="text-sm">
      <ul className="space-y-1.5 mb-3">{tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={t.done} onChange={async (e) => { await post(`/api/tasks/${t.id}`, { done: e.target.checked }, "PATCH"); r.refresh(); }} />
          <span className={t.done ? "line-through text-slate-400" : ""}>{t.title}{t.dueAt && <span className={`ml-1 text-xs ${!t.done && new Date(t.dueAt) < new Date() ? "text-red-600" : "text-slate-500"}`}>· {new Date(t.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}</span>
        </li>))}
      </ul>
      <form onSubmit={add} className="flex gap-1.5"><input name="title" required placeholder="New task" className="input" /><input name="dueAt" type="date" className="input w-36" /><button className="btn-primary">Add</button></form>
    </div>
  );
}

export function NoteForm({ applicationId, companyId }: { applicationId?: string; companyId?: string }) {
  const r = useRouter();
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await post("/api/activities", { applicationId, companyId, kind: f.get("kind"), body: f.get("body") });
    e.currentTarget.reset(); r.refresh();
  }
  return (
    <form onSubmit={add} className="space-y-2">
      <textarea name="body" required rows={2} className="input" placeholder="Add a note, call summary or interview debrief" />
      <div className="flex gap-2"><select name="kind" className="input w-40"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="interview">Interview</option><option value="meeting">Meeting</option></select><button className="btn-primary">Save note</button></div>
    </form>
  );
}

export function TouchForm({ applicationId, contacts }: { applicationId?: string; contacts: { id: string; name: string }[] }) {
  const r = useRouter();
  if (!contacts.length) return <p className="text-xs text-slate-500">Add a contact for this company in Network & Contacts to log outreach.</p>;
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    await post("/api/touches", { ...f, applicationId, followUpAt: f.followUpAt || null });
    e.currentTarget.reset(); r.refresh();
  }
  return (
    <form onSubmit={add} className="grid sm:grid-cols-4 gap-2">
      <select name="contactId" className="input">{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select name="channel" className="input"><option value="linkedin">LinkedIn</option><option value="email">Email</option><option value="phone">Phone</option><option value="in_person">In person</option></select>
      <input name="followUpAt" type="date" className="input" title="Follow-up date" />
      <button className="btn-ghost">Log outreach</button>
      <textarea name="message" rows={2} className="input sm:col-span-4" placeholder="Message sent (optional)" />
    </form>
  );
}

export function AttachDocument({ applicationId }: { applicationId: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  async function up(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("kind", "other"); fd.append("applicationId", applicationId); fd.append("name", file.name);
    await fetch("/api/documents", { method: "POST", body: fd });
    setBusy(false); r.refresh();
  }
  return <label className="btn-ghost cursor-pointer">{busy ? "Uploading…" : "Attach file"}<input type="file" className="hidden" onChange={up} /></label>;
}

export function DeleteApplication({ id }: { id: string }) {
  const r = useRouter();
  return <button className="btn-danger" onClick={async () => { if (confirm("Delete this application record? This is recorded in the audit log.")) { const res = await fetch(`/api/applications/${id}`, { method: "DELETE" }); if (res.ok) r.push("/applications"); else alert((await res.json()).error); } }}>Delete</button>;
}
