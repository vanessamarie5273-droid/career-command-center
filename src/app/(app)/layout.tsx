import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const unread = await prisma.alert.count({ where: { read: false } });
  return (
    <div className="min-h-screen">
      <Sidebar alerts={unread} />
      <div className="lg:pl-64">
        <Topbar email={s.email} />
        <main className="px-4 lg:px-8 py-6 max-w-[1500px]">{children}</main>
      </div>
    </div>
  );
}
