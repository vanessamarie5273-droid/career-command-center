"use client";
import { useRef, useState } from "react";

type Props = {
  endpoint: string; field: string; value: string | number | boolean | null | undefined; label?: string;
  type?: "text" | "textarea" | "date" | "datetime" | "number" | "select" | "checkbox" | "url";
  options?: [string, string][]; placeholder?: string; rows?: number; className?: string; onSaved?: () => void;
};

const toInput = (v: Props["value"], type: Props["type"]) => {
  if (v == null) return "";
  if (type === "date" && typeof v === "string") return v.slice(0, 10);
  if (type === "datetime" && typeof v === "string") { const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  return String(v);
};

/** Inline-editable field that saves automatically (on change for selects/checkboxes, debounced for text). */
export default function AutoField({ endpoint, field, value, label, type = "text", options, placeholder, rows = 3, className = "", onSaved }: Props) {
  const [v, setV] = useState<string | boolean>(type === "checkbox" ? !!value : toInput(value, type));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(v);

  async function save(next: string | boolean) {
    if (next === last.current) return;
    setState("saving");
    let payload: unknown = next;
    if (type === "number") payload = next === "" ? null : Number(next);
    if ((type === "date" || type === "datetime") && next === "") payload = null;
    if (type === "datetime" && next) payload = new Date(next as string).toISOString();
    if (type !== "checkbox" && type !== "number" && next === "") payload = null;
    const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: payload }) });
    if (res.ok) { last.current = next; setState("saved"); setErr(null); onSaved?.(); setTimeout(() => setState("idle"), 1500); }
    else { setState("error"); setErr((await res.json().catch(() => ({}))).error ?? "Save failed"); }
  }
  const change = (next: string | boolean, immediate = false) => {
    setV(next);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) save(next); else timer.current = setTimeout(() => save(next), 800);
  };
  const indicator = <span className={`text-[10px] ml-1 ${state === "error" ? "text-red-600" : "text-emerald-600"}`}>{state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "error" ? err : ""}</span>;

  if (type === "checkbox")
    return <label className={`inline-flex items-center gap-2 text-sm ${className}`}><input type="checkbox" checked={!!v} onChange={(e) => change(e.target.checked, true)} />{label}{indicator}</label>;
  return (
    <div className={className}>
      {label && <label className="label">{label}{indicator}</label>}
      {type === "textarea" ? (
        <textarea className="input" rows={rows} value={v as string} placeholder={placeholder} onChange={(e) => change(e.target.value)} onBlur={() => save(v)} />
      ) : type === "select" ? (
        <select className="input" value={v as string} onChange={(e) => change(e.target.value, true)}>{options?.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      ) : (
        <input className="input" type={type === "datetime" ? "datetime-local" : type} value={v as string} placeholder={placeholder} onChange={(e) => change(e.target.value, type === "date" || type === "datetime")} onBlur={() => save(v)} />
      )}
      {!label && indicator}
    </div>
  );
}
