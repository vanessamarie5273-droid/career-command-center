import Link from "next/link";
import { prisma } from "@/lib/db";
import { Empty, Logo, PageHeader, ScorePill, TierBadge } from "@/components/ui";
import ReadyToApply from "@/components/ReadyToApply";
import MarkApplied from "@/components/MarkApplied";
import DeleteSaved from "@/components/DeleteSaved";
import { READY_TO_APPLY } from "@/lib/queries";
import { effectiveScore, effectiveTier } from "@/lib/scoring";
import { date, dateTime } from "@/lib/format";
import type { KitChecks } from "@/lib/kitParts";
import type { KitRow } from "@/components/ApplicationKit";

export const metadata = { title: "Ready to Apply" };

export default async function ApplyPage() {
  // Only roles she saved from Discover Jobs. Each leaves this page when she marks it applied.
  const saved = await prisma.application.findMany({
    where: READY_TO_APPLY,
    include: { job: { include: { company: true, kits: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = saved.flatMap((a) => (a.job ? [{ app: a, j: a.job }] : [])).sort((x, y) => (effectiveScore(y.j) ?? 0) - (effectiveScore(x.j) ?? 0));
  return (
    <>
      <PageHeader title="Ready to Apply" />
      <div className="space-y-4">
        {rows.length === 0 ? <Empty>Nothing saved yet. In <Link className="link" href="/jobs">Discover Jobs</Link>, click Save on a role you want to apply to and it moves here.</Empty> : rows.map(({ app, j }) => {
          const kit = j.kits[0];
          const issues = kit ? Object.values(kit.checks as KitChecks).flat().length : 0;
          return (
            <section key={j.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Logo src={j.company.logoUrl} name={j.company.name} size={36} />
                <div className="flex-1 min-w-[220px]">
                  <Link className="font-semibold text-navy-950 hover:underline" href={`/jobs/${j.id}`}>{j.title}</Link>
                  <div className="text-sm text-slate-500">{j.company.name}{j.location ? ` · ${j.location}` : ""}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                    <TierBadge tier={effectiveTier(j)} /><ScorePill score={effectiveScore(j)} />
                    {kit ? <><span className="muted">Kit built {dateTime(kit.createdAt)}</span>{issues ? <span className="chip bg-amber-50 text-amber-800">{issues} check{issues > 1 ? "s" : ""} to review</span> : <span className="chip bg-emerald-50 text-emerald-700">Checks pass</span>}</> : <span className="muted">Saved {date(app.createdAt)} · no kit yet</span>}
                  </div>
                </div>
                {kit
                  ? <ReadyToApply key={kit.id} jobId={j.id} applyUrl={j.applyUrl} kit={JSON.parse(JSON.stringify(kit)) as KitRow} extra={<DeleteSaved appId={app.id} jobId={j.id} />} />
                  : <div className="flex flex-wrap items-center gap-2"><Link className="btn-gold" href={`/jobs/${j.id}#kit`}>Build kit →</Link>{j.applyUrl && <a className="btn-ghost" href={j.applyUrl} target="_blank" rel="noopener noreferrer">Open employer form ↗</a>}<MarkApplied jobId={j.id} kitId={null} /><DeleteSaved appId={app.id} jobId={j.id} /></div>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
