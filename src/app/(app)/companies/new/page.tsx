import { PageHeader, Card } from "@/components/ui";
import { CATEGORIES } from "@/data/companies";
import NewCompanyForm from "./NewCompanyForm";

export default function NewCompany() {
  return (
    <>
      <PageHeader title="Add a company" sub="The app will look for the company's public Greenhouse, Ashby or Lever job board straight away. For Workday or SmartRecruiters, give a hint such as workday:tenant|wd5|Site." />
      <Card><NewCompanyForm categories={[...CATEGORIES]} /></Card>
    </>
  );
}
