"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AlertActions() {
  const r = useRouter();
  return <button className="btn-ghost" onClick={async () => { await fetch("/api/alerts", { method: "POST" }); r.refresh(); }}>Mark all read</button>;
}

export function BriefingButton() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/briefing", { method: "POST" }); setBusy(false); r.refresh(); }}>{busy ? "Generating…" : "Generate briefing now"}</button>;
}
