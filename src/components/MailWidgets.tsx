"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
};

/** Settings: connect, check now, disconnect. */
export function OutlookControls({ connected }: { connected: boolean }) {
  const r = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function act(action: "sync" | "disconnect") {
    if (action === "disconnect" && !confirm("Disconnect Outlook? The app stops reading recruiter replies and can't save drafts until you connect again.")) return;
    setBusy(action); setMsg(null);
    try { const j = await post("/api/mail", { action }); setMsg(action === "sync" ? j.note : "Disconnected"); r.refresh(); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  }
  if (!connected) return <a className="btn-primary" href="/api/mail/connect">Connect Outlook</a>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => act("sync")}>{busy === "sync" ? "Checking your inbox…" : "Check inbox now"}</button>
        <a className="btn-ghost" href="/api/mail/connect">Reconnect</a>
        <button className="btn-ghost" disabled={!!busy} onClick={() => act("disconnect")}>Disconnect</button>
      </div>
      {msg && <p className="text-[13px] text-slate-600">{msg}</p>}
    </div>
  );
}

export function UndoEmail({ id }: { id: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="text-[13px] link shrink-0" disabled={busy} onClick={async () => { setBusy(true); try { await post(`/api/mail/events/${id}/undo`, {}); r.refresh(); } catch (e) { alert((e as Error).message); } setBusy(false); }}>{busy ? "Undoing…" : "Undo"}</button>;
}

type Draft = { subject: string; body: string; linkedin: string; issues: { text: string; detail: string }[]; to: string | null; inThread: boolean; webLink: string };

function DraftResult({ d }: { d: Draft }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, t: string) => { navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(null), 1500); };
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3 text-[14px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-emerald-50 text-emerald-700">Saved to Outlook Drafts</span>
        <span className="text-[13px] text-slate-500">{d.inThread ? "As a reply in their thread" : d.to ? `To ${d.to}` : "No recipient yet: add one in Outlook"}</span>
        <a className="btn-gold ml-auto" href={d.webLink} target="_blank" rel="noopener noreferrer">Open in Outlook ↗</a>
      </div>
      <div><b>Subject:</b> {d.subject}</div>
      <pre className="whitespace-pre-wrap font-sans text-slate-800">{d.body}</pre>
      {d.issues.length > 0 && <ul className="text-[13px] text-amber-800 list-disc ml-4">{d.issues.map((i, k) => <li key={k}><b>{i.text}</b>: {i.detail}</li>)}</ul>}
      {d.linkedin && (
        <div className="border-t border-slate-200 pt-2">
          <div className="label">LinkedIn version</div>
          <p className="whitespace-pre-wrap text-slate-800">{d.linkedin}</p>
          <button className="btn-ghost mt-1" onClick={() => copy("li", d.linkedin)}>{copied === "li" ? "Copied" : "Copy LinkedIn note"}</button>
        </div>
      )}
    </div>
  );
}

/** One button that writes a follow-up and saves it to Outlook Drafts. */
export function DraftButton({ applicationId, kind, prepId, label, to }: { applicationId: string; kind: "hiring_manager" | "recruiter" | "interview_followup"; prepId?: string; label: string; to?: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    try { setD(await post("/api/mail/drafts", { applicationId, kind, prepId, to })); r.refresh(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return (
    <div>
      <button className="btn-primary" disabled={busy} onClick={go}>{busy ? "Writing and saving…" : d ? `${label} again` : label}</button>
      {err && <p className="mt-1 text-[13px] text-red-700">{err}</p>}
      {d && <DraftResult d={d} />}
    </div>
  );
}
