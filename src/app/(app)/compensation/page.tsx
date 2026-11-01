import { redirect } from "next/navigation";

// Compensation lives on each company's page now; the old tab sends old links there.
export default function Compensation() {
  redirect("/companies");
}
