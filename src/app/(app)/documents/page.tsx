import Link from "next/link";
import DeleteDocument from "@/components/DeleteDocument";
import { prisma } from "@/lib/db";
import { kitDocIds, libraryOnly } from "@/lib/kitDocs";
import { PageHeader, Card, Empty } from "@/components/ui";
import UploadDocument from "@/components/UploadDocument";
import { date } from "@/lib/format";

export const metadata = { title: "Resume Library" };
const KIND_LABEL: Record<string, string> = { resume: "Resumes", cover_letter: "Cover letters", recommendation: "Letters of recommendation", bio: "Executive biographies", references: "References", other: "Other materials" };

export default async function Documents() {
  const all = await prisma.document.findMany({ select: { id: true, name: true, kind: true, version: true, industry: true, roleType: true, fileName: true, size: true, createdAt: true, isTailored: true, sha256: true, atsReport: true, _count: { select: { submittedAs: true, coverFor: true, applications: true } }, submittedAs: { select: { stage: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }, { createdAt: "desc" }] });
  // Kit resumes and letters live on their company and application pages.
  const docs = libraryOnly(all, await kitDocIds(prisma));
  const unique = new Set(docs.filter((d) => d.kind === "resume").map((d) => d.sha256)).size;
  const groups = Object.keys(KIND_LABEL).map((k) => [k, docs.filter((d) => d.kind === k)] as const).filter(([, v]) => v.length);
  return (
    <>
      <PageHeader title="Resume Library" sub={`${unique} unique resume${unique === 1 ? "" : "s"} · ${docs.length} documents. Files are stored privately in your database; text is extracted for ATS checks and job matching. Resumes and letters from an Application Kit stay with their company and application.`} />
      <Card title="Upload" className="mb-4"><UploadDocument /></Card>
      {groups.length === 0 ? <Empty>No documents yet. Upload your resume to enable ATS checks, job matching and submission tracking.</Empty> : groups.map(([k, list]) => (
        <Card key={k} title={KIND_LABEL[k]} className="mb-4">
          <div className="overflow-x-auto"><table className="tbl">
            <thead><tr><th>Name</th><th>Version</th><th>Industry</th><th>Role type</th>{k === "resume" && <th>ATS check</th>}<th>Used in</th><th>Interview rate</th><th>Added</th><th></th></tr></thead>
            <tbody>{list.map((d) => {
              const used = d._count.submittedAs + d._count.coverFor + d._count.applications;
              const progressed = d.submittedAs.filter((a) => ["HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"].includes(a.stage)).length;
              const ats = d.atsReport as { score: number } | null;
              return (
                <tr key={d.id}>
                  <td><Link href={`/documents/${d.id}`} className="font-medium hover:underline">{d.name}</Link>{d.isTailored && <span className="chip ml-1 bg-violet-50 text-violet-700">tailored</span>}<div className="text-xs text-slate-400">{d.fileName} · {Math.round(d.size / 1024)} KB</div></td>
                  <td>{d.version}</td><td>{d.industry ?? "—"}</td><td>{d.roleType ?? "—"}</td>
                  {k === "resume" && <td>{ats ? <span className={`font-semibold ${ats.score >= 80 ? "text-emerald-700" : ats.score >= 60 ? "text-amber-700" : "text-red-700"}`}>{ats.score}%</span> : "—"}</td>}
                  <td>{used} application{used === 1 ? "" : "s"}</td>
                  <td>{d._count.submittedAs ? `${Math.round((progressed / d._count.submittedAs) * 100)}%` : "—"}</td>
                  <td className="whitespace-nowrap">{date(d.createdAt)}</td>
                  <td className="whitespace-nowrap text-xs"><a className="link" href={`/api/documents/${d.id}/download`}>Original</a> · <a className="link" href={`/api/documents/${d.id}/export?format=docx`}>Word</a> · <a className="link" href={`/api/documents/${d.id}/export?format=pdf`}>PDF</a> · <DeleteDocument compact id={d.id} name={d.name} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </Card>
      ))}
    </>
  );
}
