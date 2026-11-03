import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { CATEGORIES } from "@/data/companies";
import NewJobForm from "./NewJobForm";

export const metadata = { title: "Add a Job by URL" };

export default async function NewJob({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const { company } = await searchParams;
  const companies = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const initial = company ? (companies.find((c) => c.id === company)?.name ?? company.slice(0, 200)) : undefined;
  return (
    <>
      <PageHeader title="Add a job by URL" sub="For a specific posting found outside the automated feeds, such as LinkedIn or a referral. Paste the posting's own URL, not a careers homepage." />
      <Card><NewJobForm companies={companies} categories={[...CATEGORIES]} initialCompany={initial} /></Card>
    </>
  );
}
