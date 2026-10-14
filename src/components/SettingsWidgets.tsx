"use client";
import { useState } from "react";

export function RestoreForm() {
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("mode") === "replace" && !confirm("Replace ALL current data with this backup? Download a fresh backup first if unsure.")) return;
    setMsg("Restoring…");
    const res = await fetch("/api/restore", { method: "POST", body: fd });
    const j = await res.json();
    setMsg(res.ok ? `Restored (${j.mode}): ${Object.entries(j.restored).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing new"}` : j.error);
  }
  return (
    <form onSubmit={submit} className="space-y-2 pt-2 border-t border-slate-100">
      <div className="label">Restore from backup</div>
      <input type="file" name="file" accept=".json" required className="input" />
      <select name="mode" className="input"><option value="merge">Merge: add missing records</option><option value="replace">Replace everything</option></select>
      <button className="btn-ghost">Restore</button>
      {msg && <p className="text-xs">{msg}</p>}
    </form>
  );
}

export function PasswordForm() {
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "password", ...f }) });
    setMsg(res.ok ? "Password changed" : (await res.json()).error);
    if (res.ok) e.currentTarget.reset();
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input name="current" type="password" required placeholder="Current password" className="input" autoComplete="current-password" />
      <input name="next" type="password" required minLength={12} placeholder="New password (12+ characters)" className="input" autoComplete="new-password" />
      <button className="btn-ghost">Change password</button>
      {msg && <p className="text-xs">{msg}</p>}
    </form>
  );
}

export function RescoreButton() {
  const [msg, setMsg] = useState<string | null>(null);
  return <><button className="btn-ghost" onClick={async () => { setMsg("Rescoring…"); const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rescore" }) }); setMsg(r.ok ? `Rescored ${(await r.json()).rescored} jobs` : "Failed"); }}>Rescore all jobs</button>{msg && <span className="ml-2 text-xs">{msg}</span>}</>;
}
