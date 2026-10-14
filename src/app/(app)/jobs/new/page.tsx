import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import NewJobForm from "./NewJobForm";

export default async function NewJob() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Add a job by URL" sub="For a specific posting found outside the automated feeds, such as LinkedIn or a referral. Paste the posting's own URL, not a careers homepage." />
      <Card><NewJobForm companies={companies} /></Card>
    </>
  );
}
