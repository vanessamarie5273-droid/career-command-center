"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Escape closes a side panel, and the page behind it stops scrolling while it's open. */
export default function DrawerKeys({ closeHref }: { closeHref: string }) {
  const r = useRouter();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") r.replace(closeHref, { scroll: false }); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [closeHref, r]);
  return null;
}
