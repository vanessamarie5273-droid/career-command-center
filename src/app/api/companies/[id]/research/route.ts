// Research a company now (the account page's "Research" / "Refresh company info" button), and report progress.
// The research runs in the background, one at a time, so the request returns at once and the page polls.
import { route, aiNotConfigured } from "@/lib/api";
import { prisma } from "@/lib/db";
import { researchActive, researchConfigured, startResearch } from "@/lib/research";

type Ctx = { params: Promise<{ id: string }> };

const status = async (id: string) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { researchStatus: true, researchStartedAt: true, researchedAt: true, researchSummary: true, researchError: true } });
  const active = researchActive(c);
  // A run cut off by a restart reads as failed, so the button works again.
  const state = active ? c.researchStatus : c.researchStatus === "running" || c.researchStatus === "queued" ? "error" : c.researchStatus;
  return { status: state ?? "never", active, researchedAt: c.researchedAt, summary: c.researchSummary, error: state === "error" ? c.researchError ?? "Research stopped before it finished. Try again." : null };
};

export const GET = route<Ctx>("VIEWER", async (_req, { params }) => status((await params).id));

export const POST = route<Ctx>("EDITOR", async (_req, { params }) => {
  const { id } = await params;
  if (!researchConfigured()) return aiNotConfigured("Company research");
  const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { researchStatus: true, researchStartedAt: true } });
  if (!researchActive(c)) await startResearch(prisma, id);
  return status(id);
});
