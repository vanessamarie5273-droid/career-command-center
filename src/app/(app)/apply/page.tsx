import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, Empty, Logo, PageHeader, ScorePill, TierBadge } from "@/components/ui";
import ReadyToApply from "@/components/ReadyToApply";
import { MATCHING } from "@/lib/queries";
import { effectiveScore, effectiveTier } from "@/lib/scoring";
import { dateTime } from "@/lib/format";
import type { KitChecks, KitParts } from "@/lib/kitParts";

export const metadata = { title: "Ready to Apply" };

export default async function ApplyPage() {
  const [ready, next] = await Promise.all([
    prisma.job.findMany({ where: { ...MATCHING, kits: { some: {} } }, include: { company: true, kits: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: "desc" }] }),
    prisma.job.findMany({ where: { ...MATCHING, category: "MAIN", kits: { none: {} } }, include: { company: true }, orderBy: [{ overrideScore: { sort: "desc", nulls: "last" } }, { score: "desc" }], take: 10 }),
  ]);
  return (
    <>
      <PageHeader title="Ready to Apply" sub="Roles with a finished Application Kit. Open the employer's form, paste your materials, submit it yourself, then mark it applied: the app records it and books the hiring manager outreach and the follow-up." />
      <div className="space-y-4">
        {ready.length === 0 ? <Empty>No kits yet. Build one from any job page, or start with the top roles below.</Empty> : ready.map((j) => {
          const kit = j.kits[0];
          const issues = Object.values(kit.checks as KitChecks).flat().length;
          return (
            <section key={j.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Logo src={j.company.logoUrl} name={j.company.name} size={36} />
                <div className="flex-1 min-w-[220px]">
                  <Link className="font-semibold text-navy-950 hover:underline" href={`/jobs/${j.id}#kit`}>{j.title}</Link>
                  <div className="text-sm text-slate-500">{j.company.name}{j.location ? ` · ${j.location}` : ""}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><TierBadge tier={effectiveTier(j)} /><ScorePill score={effectiveScore(j)} /><span className="muted">Kit built {dateTime(kit.createdAt)}</span>{issues ? <Link href={`/jobs/${j.id}#kit`} className="chip bg-amber-50 text-amber-800">{issues} check{issues > 1 ? "s" : ""} to review</Link> : <span className="chip bg-emerald-50 text-emerald-700">Checks pass</span>}</div>
                </div>
                <ReadyToApply jobId={j.id} kitId={kit.id} applyUrl={j.applyUrl} parts={kit.parts as KitParts} resumeDocId={kit.resumeDocId} letterDocId={kit.letterDocId} />
              </div>
            </section>
          );
        })}
        <Card title="Top roles without a kit">
          {next.length === 0 ? <p className="muted text-sm">Every top role has a kit.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {next.map((j) => <li key={j.id} className="flex items-center gap-3 py-2"><ScorePill score={effectiveScore(j)} /><span className="flex-1"><Link className="link" href={`/jobs/${j.id}`}>{j.title}</Link> <span className="text-slate-500">· {j.company.name}</span></span><Link className="btn-ghost" href={`/jobs/${j.id}#kit`}>Build kit →</Link></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
