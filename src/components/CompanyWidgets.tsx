"use client";
import { useRouter } from "next/navigation";

const send = (url: string, body: unknown, method = "POST") => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function AddLeader({ companyId }: { companyId: string }) {
  const r = useRouter();
  return (
    <details className="text-sm"><summary className="cursor-pointer link text-xs">+ Add leader / hiring contact</summary>
      <form className="mt-2 space-y-1.5" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); await send(`/api/companies/${companyId}/leaders`, f); e.currentTarget.reset(); r.refresh(); }}>
        <input name="name" required placeholder="Name" className="input" />
        <input name="title" required placeholder="Title, e.g. Chief Revenue Officer" className="input" />
        <input name="linkedinUrl" type="url" placeholder="LinkedIn profile URL" className="input" />
        <input name="sourceUrl" type="url" placeholder="Source (company leadership page, press release)" className="input" />
        <button className="btn-primary">Save (marked confirmed with source)</button>
      </form>
    </details>
  );
}

export function AddNews({ companyId }: { companyId: string }) {
  const r = useRouter();
  return (
    <form className="grid sm:grid-cols-6 gap-2" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); await send(`/api/companies/${companyId}/news`, f); e.currentTarget.reset(); r.refresh(); }}>
      <select name="kind" className="input"><option value="funding">Funding</option><option value="leadership">Leadership</option><option value="product">Product</option><option value="acquisition">Acquisition</option><option value="partnership">Partnership</option><option value="hiring">Hiring</option></select>
      <input name="headline" required placeholder="Headline" className="input sm:col-span-2" />
      <input name="url" type="url" required placeholder="Source URL" className="input sm:col-span-2" />
      <input name="publishedAt" type="date" className="input" />
      <button className="btn-ghost sm:col-span-6 justify-self-start">Add development</button>
    </form>
  );
}

export function VerifyProfile({ id }: { id: string }) {
  const r = useRouter();
  return (
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await send(`/api/companies/${id}`, { profileFactType: "CONFIRMED", profileSource: f.get("src"), profileVerifiedAt: new Date().toISOString() }, "PATCH"); r.refresh(); }}>
      <input name="src" type="url" required placeholder="Source you checked (company site, filing)" className="input flex-1 min-w-[220px]" />
      <button className="btn-ghost">Mark profile verified today</button>
    </form>
  );
}
