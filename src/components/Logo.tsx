"use client";
import { useState } from "react";

export default function Logo({ src, name, size = 28 }: { src?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  if (!src || failed)
    return <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-md bg-navy-800 text-[10px] font-semibold text-gold-300">{initials}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} onError={() => setFailed(true)} className="shrink-0 rounded-md bg-white ring-1 ring-slate-200 object-contain" style={{ width: size, height: size }} />;
}
