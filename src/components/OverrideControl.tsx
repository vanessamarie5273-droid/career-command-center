"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OverrideControl(p: { id: string; tier: string | null; score: number | null; note: string | null; aiScore: number | null; aiTier: string | null; favorite: boolean; dismissed: boolean }) {
  const [tier, setTier] = useState(p.tier ?? "");
  const [score, setScore] = useState(p.score?.toString() ?? "");
  const [note, setNote] = useState(p.note ?? "");
  const [saved, setSaved] = useState<string | null>(null);
  const r = useRouter();
  async function save(extra: object = {}) {
    const res = await fetch(`/api/jobs/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrideTier: tier || null, overrideScore: score ? Number(score) : null, overrideNote: note || null, ...extra }) });
    setSaved(res.ok ? "Saved" : "Save failed"); r.refresh();
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-slate-500">AI result stays on record: {p.aiScore ?? "—"} pts, {p.aiTier?.replace("TIER", "Tier ") ?? "—"}.</p>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Tier</label><select className="input" value={tier} onChange={(e) => setTier(e.target.value)}><option value="">Use AI tier</option><option value="TIER1">Tier 1</option><option value="TIER2">Tier 2</option><option value="TIER3">Tier 3</option></select></div>
        <div><label className="label">Score</label><input className="input" type="number" min={0} max={100} placeholder="AI" value={score} onChange={(e) => setScore(e.target.value)} /></div>
      </div>
      <div><label className="label">Why</label><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => save()}>Save override</button>
        <button className="btn-ghost" onClick={() => save({ favorite: !p.favorite })}>{p.favorite ? "★ Unfavorite" : "☆ Favorite"}</button>
        <button className="btn-ghost" onClick={() => save({ dismissed: !p.dismissed })}>{p.dismissed ? "Restore" : "Dismiss"}</button>
      </div>
      {saved && <p className="text-xs text-emerald-700">{saved}</p>}
    </div>
  );
}
