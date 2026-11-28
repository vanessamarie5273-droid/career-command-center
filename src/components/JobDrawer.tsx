import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { Logo, ScorePill, TierBadge, FactTag } from "@/components/ui";
import AddToPipeline from "@/components/AddToPipeline";
import MarkApplied from "@/components/MarkApplied";
import DrawerKeys from "@/components/DrawerKeys";
import { CRITERION_LABEL, effectiveScore, effectiveTier, type Reason } from "@/lib/scoring";
import { FAMILY_LABEL, type RoleFamily } from "@/lib/roles";
import { date, range, STAGE_LABEL, titleCase } from "@/lib/format";
import { isSpecificJobUrl } from "@/lib/links";
import { sanitize } from "@/lib/sanitize";

/**
 * A role opened from the Discover feed, in a side panel over the list: fit and gaps, pay, the company, people she
 * knows there, materials, and what to do next. The full page (score breakdown, kit builder, history) is one click away.
 */
export default async function JobDrawer({ id, closeHref }: { id: string; closeHref: string }) {
  const j = await prisma.job.findUnique({ where: { id }, include: { company: true, applications: { select: { id: true, stage: true, applied: true } } } });
  if (!j) return null;
  const [contacts, contactCount, openRoles, apps, kits] = await Promise.all([
    prisma.contact.findMany({ where: { companyId: j.companyId }, orderBy: [{ degree: "asc" }, { updatedAt: "desc" }], take: 4, select: { id: true, firstName: true, lastName: true, title: true, degree: true, role: true, linkedinUrl: true } }),
    prisma.contact.count({ where: { companyId: j.companyId } }),
    prisma.job.count({ where: { companyId: j.companyId, status: "OPEN", dismissed: false } }),
    prisma.application.count({ where: { companyId: j.companyId, applied: true } }),
    prisma.kit.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, createdAt: true } }),
  ]);
  const reasons = (j.scoreReasons ?? []) as Reason[];
  const fits = reasons.filter((r) => r.delta === "+");
  const gaps = reasons.filter((r) => r.delta === "-");
  const app = j.applications[0];
  const ote = range(j.oteMin, j.oteMax);
  const base = range(j.salaryMin, j.salaryMax);
  const c = j.company;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <DrawerKeys closeHref={closeHref} />
      <Link href={closeHref} scroll={false} aria-label="Close" className="absolute inset-0 bg-ink/30" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col bg-white shadow-2xl">
        <header className="border-b border-ink-line px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <Logo src={c.logoUrl} name={c.name} size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-ink-3"><Link className="link" href={`/companies/${c.id}`}>{c.name}</Link> · {c.category}</div>
              <h2 id="drawer-title" className="mt-0.5 text-[20px] font-semibold leading-snug text-ink">{j.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <ScorePill score={effectiveScore(j)} confidence={j.confidence} />
                <TierBadge tier={effectiveTier(j)} overridden={!!j.overrideTier} />
                {j.category === "STRETCH" && <span className="chip tone-progress">Stretch</span>}
                {j.category === "RELOCATION" && <span className="chip tone-due">Relocation</span>}
                {j.status === "CLOSED" && <span className="chip tone-bad">Closed {date(j.closedAt)}</span>}
              </div>
            </div>
            <Link href={closeHref} scroll={false} aria-label="Close panel" className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl text-[22px] leading-none text-ink-3 hover:bg-brand-50 hover:text-ink">×</Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {j.applyUrl ? <a href={j.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold">Open employer posting ↗</a> : <span className="chip tone-progress">Not posted yet</span>}
            {!app ? <AddToPipeline jobId={j.id} /> : <Link href={app.applied ? `/applications/${app.id}` : "/apply"} className="btn-ghost">{app.applied ? `In Applications: ${STAGE_LABEL[app.stage]}` : "Saved on Ready to Apply"} →</Link>}
            {!app?.applied && j.status === "OPEN" && <MarkApplied jobId={j.id} kitId={kits[0]?.id ?? null} />}
          </div>
          {j.applyUrl && !isSpecificJobUrl(j.applyUrl) && <p className="mt-2 text-[13px] text-amber-700">This link may not be job-specific; check it before applying.</p>}
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <Block title="Next step">
            <p className="text-[14px] text-ink-2">{next(!!app, !!app?.applied, kits.length > 0, contactCount, gaps.length)}</p>
          </Block>

          <div className="grid gap-6 sm:grid-cols-2">
            <Block title="Why it fits">
              {fits.length ? <ul className="space-y-1.5">{fits.slice(0, 6).map((r, i) => <Reason key={i} r={r} />)}</ul> : <None>No strengths recorded by the scoring.</None>}
            </Block>
            <Block title="Gaps to address">
              {gaps.length ? <ul className="space-y-1.5">{gaps.slice(0, 6).map((r, i) => <Reason key={i} r={r} />)}</ul> : <None>No gaps flagged.</None>}
            </Block>
          </div>

          <Block title="Pay" action={<FactTag type={j.compFactType} />}>
            {ote || base ? (
              <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 text-[14px]">
                {ote && <><dt className="text-ink-3">OTE</dt><dd className="font-semibold">{ote}</dd></>}
                {base && <><dt className="text-ink-3">{ote ? "Base" : "Pay range"}</dt><dd className="font-semibold">{base}</dd></>}
                <dt className="text-ink-3">Equity</dt><dd>{j.equityMentioned ? "Mentioned in posting" : "Not mentioned"}</dd>
              </dl>
            ) : <None>The employer has not published pay for this role.</None>}
          </Block>

          <Block title="Role">
            <dl className="grid grid-cols-[96px_1fr] gap-y-1.5 text-[14px]">
              <dt className="text-ink-3">Location</dt><dd>{j.location || "—"} <span className="text-ink-3">· {titleCase(j.workArrangement ?? "Not stated")}</span></dd>
              <dt className="text-ink-3">Role type</dt><dd>{FAMILY_LABEL[(j.roleFamily as RoleFamily) || "NOT_RELEVANT"]}</dd>
              <dt className="text-ink-3">Experience</dt><dd>{j.yearsRequired ? `${j.yearsRequired}+ years` : "Not stated"}</dd>
              <dt className="text-ink-3">Territory</dt><dd>{j.territory || "Not stated"}</dd>
              <dt className="text-ink-3">Posted</dt><dd>{j.postedAt ? date(j.postedAt) : "Not given"} <span className="text-ink-3">· last seen {date(j.lastVerifiedAt)}</span></dd>
            </dl>
          </Block>

          <Block title="Company" action={<Link href={`/companies/${c.id}`} className="link text-[13px]">Company page →</Link>}>
            <div className="grid grid-cols-3 gap-2">
              <Fact n={c.growthScore ?? "—"} label="Growth potential" hint="AI assessment, out of 100" />
              <Fact n={openRoles} label="Open roles tracked" />
              <Fact n={apps} label="Your applications" />
            </div>
            {(c.growthThesis || c.description) && <p className="mt-3 line-clamp-3 text-[14px] text-ink-2">{c.growthThesis || c.description}</p>}
          </Block>

          <Block title="People you know there" action={contactCount ? <Link href={`/network?company=co-${c.id}`} className="link text-[13px]">All {contactCount} →</Link> : undefined}>
            {contacts.length ? (
              <ul className="divide-y divide-ink-line">
                {contacts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                    <span className="min-w-0"><span className="font-medium text-ink">{p.firstName} {p.lastName}</span><span className="block truncate text-[13px] text-ink-3">{[p.title, p.degree && `${p.degree} degree`].filter(Boolean).join(" · ")}</span></span>
                    {p.linkedinUrl && <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="link shrink-0 text-[13px]">LinkedIn ↗</a>}
                  </li>
                ))}
              </ul>
            ) : <None>No contacts at {c.name} yet. <Link className="link" href="/contacts">Import connections</Link></None>}
          </Block>

          <Block title="Materials" action={<Link href={`/jobs/${j.id}`} className="link text-[13px]">Full page and kit →</Link>}>
            <p className="text-[14px] text-ink-2">{kits[0] ? <>Application kit built {date(kits[0].createdAt)}. Open the full page to review or rebuild it.</> : <>No kit yet. Build my kit on the full page makes a tailored resume, cover letter and hiring manager note.</>}</p>
          </Block>

          {(j.requiredQuals || j.preferredQuals) && (
            <Block title="Qualifications">
              <div className="grid gap-4 text-[14px] sm:grid-cols-2">
                <div><div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Required</div><p className="whitespace-pre-wrap text-ink-2">{j.requiredQuals || "Not separated in posting"}</p></div>
                <div><div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Preferred</div><p className="whitespace-pre-wrap text-ink-2">{j.preferredQuals || "None listed separately"}</p></div>
              </div>
            </Block>
          )}

          <Block title="Job description">
            <details className="group">
              <summary className="link cursor-pointer text-[14px]">Show the description as published</summary>
              {j.description ? <div className="mt-3 max-w-none text-[14px] leading-relaxed text-ink-2 [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2" dangerouslySetInnerHTML={{ __html: sanitize(j.description) }} /> : <p className="mt-3 whitespace-pre-wrap text-[14px] text-ink-2">{j.descriptionText || "No description captured."}</p>}
            </details>
          </Block>
        </div>
      </aside>
    </div>
  );
}

/** One plain sentence on what to do next, from where the role stands. */
function next(saved: boolean, applied: boolean, kit: boolean, people: number, gaps: number) {
  if (applied) return "You applied. Track replies and next steps on the application.";
  const who = people ? ` You know ${people} ${people === 1 ? "person" : "people"} there; ask for a referral before you apply.` : "";
  if (!saved) return `Save it to Ready to Apply if it's worth pursuing.${who}`;
  if (!kit) return `Build your kit on the full page${gaps ? ", and use the cover letter to answer the gaps below" : ""}.${who}`;
  return `Your kit is ready. Apply on the employer's site, then mark it applied here.${who}`;
}

function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[16px] font-semibold text-ink">{title}</h3>{action}</div>{children}</section>;
}
function Reason({ r }: { r: Reason }) {
  return <li className="flex gap-2 text-[14px] text-ink-2"><span aria-hidden className={r.delta === "+" ? "text-emerald-600" : "text-rose-600"}>{r.delta === "+" ? "▲" : "▼"}</span><span title={CRITERION_LABEL[r.criterion]}>{r.text}</span></li>;
}
function Fact({ n, label, hint }: { n: ReactNode; label: string; hint?: string }) {
  return <div className="rounded-ctl bg-brand-50 px-3 py-2" title={hint}><div className="text-[20px] font-semibold tabular-nums text-ink">{n}</div><div className="text-[12px] text-ink-3">{label}</div></div>;
}
function None({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-ink-3">{children}</p>;
}
