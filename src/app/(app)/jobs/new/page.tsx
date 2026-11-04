import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { CATEGORIES } from "@/data/companies";
import { FOUND_VIA } from "@/lib/manualEntry";
import NewJobForm from "./NewJobForm";

export const metadata = { title: "Add a Company or Job" };

export default async function NewJob({ searchParams }: { searchParams: Promise<{ company?: string; mode?: string }> }) {
  const { company, mode } = await searchParams;
  const companies = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const initial = company ? (companies.find((c) => c.id === company)?.name ?? company.slice(0, 200)) : undefined;
  const foundVia = Object.entries(FOUND_VIA).map(([key, label]) => ({ key, label }));
  return (
    <>
      <PageHeader title="Add a company or job" sub="Posted or not. The link is optional." />
      <Card><NewJobForm companies={companies} categories={[...CATEGORIES]} foundVia={foundVia} initialCompany={initial} initialMode={mode === "company" ? "company" : "role"} /></Card>
    </>
  );
}
