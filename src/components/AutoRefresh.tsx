"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-reads the page every `seconds` while something is in progress, e.g. a job feed refresh. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const r = useRouter();
  useEffect(() => { const t = setInterval(() => r.refresh(), seconds * 1000); return () => clearInterval(t); }, [r, seconds]);
  return null;
}
