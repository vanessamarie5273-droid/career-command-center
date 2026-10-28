import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { kitDocIds, libraryOnly } from "@/lib/kitDocs";
import { Card, FactTag, Logo, TierBadge, ScorePill } from "@/components/ui";
import { CRITERION_LABEL, WEIGHTS, effectiveScore, effectiveTier, type Criterion, type Reason } from "@/lib/scoring";
import { FAMILY_LABEL, type RoleFamily } from "@/lib/roles";
import { date, dateTime, range, STAGE_LABEL, TIER_LABEL } from "@/lib/format";
import { isSpecificJobUrl } from "@/lib/links";
import OverrideControl from "@/components/OverrideControl";
import AddToPipeline from "@/components/AddToPipeline";
import ResumeMatch from "@/components/ResumeMatch";
import ApplicationKit, { type KitRow } from "@/components/ApplicationKit";
import { assistantConfigured } from "@/lib/assistant";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const j = await prisma.job.findUnique({ where: { id }, include: { company: true, sources: true, events: { orderBy: { at: "desc" }, take: 30 }, applications: true } });
  if (!j) notFound();
  const resumes = await prisma.document.findMany({ where: { kind: "resume" }, select: { id: true, name: true, version: true, isTailored: true }, orderBy: { createdAt: "desc" } });
  const kits = await prisma.kit.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, parts: true, checks: true, resumeDocId: true, letterDocId: true } });
  const breakdown = (j.scoreBreakdown ?? {}) as Record<Criterion, number>;
  const reasons = (j.scoreReasons ?? []) as Reason[];
  const app = j.applications[0];
  const specific = isSpecificJobUrl(j.applyUrl);
  const pub = range(j.oteMin, j.oteMax);
  const base = range(j.salaryMin, j.salaryMax);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start gap-4">
        <Logo src={j.company.logoUrl} name={j.company.name} size={48} />
        <div className="flex-1 min-w-[260px]">
          <div className="text-sm text-slate-500"><Link className="link" href={`/companies/${j.company.id}`}>{j.company.name}</Link> · {j.company.category}</div>
          <h1 className="h1 mt-0.5">{j.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <TierBadge tier={effectiveTier(j)} overridden={!!j.overrideTier} />
            <ScorePill score={effectiveScore(j)} confidence={j.confidence} />
            <span className="muted">Confidence: {j.confidence ?? "—"}</span>
            {j.category !== "MAIN" && <span className="chip bg-amber-50 text-amber-800 ring-1 ring-amber-600/20">{j.category === "RELOCATION" ? "Relocation opportunity" : j.category === "STRETCH" ? "Stretch role" : `Excluded: ${j.excludedReason}`}</span>}
            {j.status === "CLOSED" && <span className="chip bg-red-50 text-red-700 ring-1 ring-red-600/20">Closed {date(j.closedAt)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <a href={j.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-gold px-5 py-2.5 text-base">Open employer posting ↗</a>
          {!specific && <span className="text-xs text-amber-700">This link may not be job-specific; verify before applying.</span>}
          {app ? <Link href={`/applications/${app.id}`} className="link text-sm">In pipeline: {STAGE_LABEL[app.stage]} →</Link> : <AddToPipeline jobId={j.id} />}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Why this score" action={<span className="text-xs text-slate-500">AI score {j.score ?? "—"} · {j.tier ? TIER_LABEL[j.tier] : ""}</span>}>
            <div className="space-y-3">
              {(Object.keys(WEIGHTS) as Criterion[]).map((c) => {
                const pts = breakdown[c] ?? 0;
                const rs = reasons.filter((r) => r.criterion === c);
                return (
                  <div key={c}>
                    <div className="flex items-center justify-between text-sm"><span className="font-medium">{CRITERION_LABEL[c]} <span className="text-slate-400 font-normal">({WEIGHTS[c]}%)</span></span><span className="tabular-nums font-semibold">{pts} / {WEIGHTS[c]}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-[#3b5bdb]" style={{ width: `${(pts / WEIGHTS[c]) * 100}%` }} /></div>
                    <ul className="mt-1 space-y-0.5">{rs.map((r, i) => <li key={i} className="text-xs text-slate-600"><span className={r.delta === "+" ? "text-emerald-600" : r.delta === "-" ? "text-red-600" : "text-slate-400"}>{r.delta === "+" ? "▲" : r.delta === "-" ? "▼" : "•"}</span> {r.text}</li>)}</ul>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-slate-500">Company market position and equity upside are AI assessments of the company, not facts. Compensation counts as known only when the employer publishes it.</p>
          </Card>
          {(j.requiredQuals || j.preferredQuals) && (
            <Card title="Qualifications">
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div><div className="label">Required</div><pre className="whitespace-pre-wrap font-sans text-slate-700">{j.requiredQuals || "Not separated in posting"}</pre></div>
                <div><div className="label">Preferred</div><pre className="whitespace-pre-wrap font-sans text-slate-700">{j.preferredQuals || "None listed separately"}</pre></div>
              </div>
            </Card>
          )}
          <ApplicationKit jobId={j.id} resumes={resumes.filter((r) => !r.isTailored)} kits={JSON.parse(JSON.stringify(kits)) as KitRow[]} configured={assistantConfigured()} />
          <ResumeMatch jobId={j.id} resumes={libraryOnly(resumes, await kitDocIds(prisma), kits.map((k) => k.resumeDocId))} />
          <Card title="Job description (as published)">
            {j.description ? <div className="prose-sm max-w-none text-sm leading-relaxed text-slate-700 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h2]:mt-4 [&_h3]:mt-3 [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2" dangerouslySetInnerHTML={{ __html: sanitize(j.description) }} /> : <pre className="whitespace-pre-wrap font-sans text-sm">{j.descriptionText || "No description captured."}</pre>}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Role facts">
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <dt className="muted">Location</dt><dd>{j.location || "—"}</dd>
              <dt className="muted">Arrangement</dt><dd>{j.workArrangement}</dd>
              <dt className="muted">Territory</dt><dd>{j.territory || "Not stated"}</dd>
              <dt className="muted">Role type</dt><dd>{FAMILY_LABEL[(j.roleFamily as RoleFamily) || "NOT_RELEVANT"]}</dd>
              <dt className="muted">Seniority</dt><dd>{j.seniority?.replace("_", " ").toLowerCase()}</dd>
              <dt className="muted">Experience</dt><dd>{j.yearsRequired ? `${j.yearsRequired}+ years` : "Not stated"}</dd>
              <dt className="muted">Posted</dt><dd>{date(j.postedAt)}</dd>
              <dt className="muted">First found</dt><dd>{dateTime(j.firstSeenAt)}</dd>
              <dt className="muted">Last verified</dt><dd>{dateTime(j.lastVerifiedAt)}</dd>
              <dt className="muted">Clearance</dt><dd>{j.requiresClearance ? "Required (excluded)" : "Not required"}</dd>
              <dt className="muted">Travel</dt><dd className="text-xs">{j.travelNotes || "Not stated"}</dd>
              <dt className="muted">Relocation</dt><dd className="text-xs">{j.relocationNotes || "Not stated"}</dd>
            </dl>
          </Card>
          <Card title="Compensation" action={<FactTag type={j.compFactType} />}>
            {pub || base ? (
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                {pub && <><dt className="muted">OTE</dt><dd className="font-semibold">{pub}</dd></>}
                {base && <><dt className="muted">{pub ? "Base" : "Pay range"}</dt><dd className="font-semibold">{base}</dd></>}
                <dt className="muted">Equity</dt><dd>{j.equityMentioned ? "Mentioned in posting" : "Not mentioned"}</dd>
                {j.commissionNotes && <><dt className="muted">Variable</dt><dd className="text-xs">{j.commissionNotes}</dd></>}
                {j.compText && <><dt className="muted">Source text</dt><dd className="text-xs text-slate-500">“{j.compText}”</dd></>}
              </dl>
            ) : <p className="text-sm text-slate-500">The employer has not published pay for this role. No estimate is shown here; record recruiter-provided figures on the application.</p>}
          </Card>
          <Card title="Your ranking override"><OverrideControl id={j.id} tier={j.overrideTier} score={j.overrideScore} note={j.overrideNote} aiScore={j.score} aiTier={j.tier} favorite={j.favorite} dismissed={j.dismissed} /></Card>
          <Card title="Sources">
            <ul className="space-y-2 text-sm">{j.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className="link">{s.provider.toLowerCase()} posting ↗</a><div className="text-xs text-slate-500">first seen {dateTime(s.firstSeenAt)} · last seen {dateTime(s.lastSeenAt)}</div></li>)}</ul>
          </Card>
          <Card title="History">
            <ul className="space-y-1.5 text-xs">{j.events.map((e) => <li key={e.id}><span className="font-medium capitalize">{e.kind}</span> · {dateTime(e.at)}{e.detail ? <div className="text-slate-500">{e.detail}</div> : null}</li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// Employer HTML is rendered inside our page; strip anything executable.
function sanitize(html: string) {
  let s = html;
  if (/&lt;\w/.test(s)) s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return s
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta|svg|math)[\s\S]*?(<\/\s*\1\s*>|\/?>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
}
