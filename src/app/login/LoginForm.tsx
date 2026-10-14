"use client";
import { useState } from "react";

export default function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
    if (res.ok) window.location.href = next;
    else { setError((await res.json().catch(() => ({}))).error || "Sign-in failed"); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="input py-2" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input py-2" /></div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full justify-center py-2" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
