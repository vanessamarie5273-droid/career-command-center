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
    <div className="min-h-screen lg:bg-[linear-gradient(to_right,#060d1f_14rem,transparent_14rem)]">
      <Sidebar alerts={unread} />
      <div className="lg:pl-56">
        <Topbar alerts={unread} />
        <main className="px-3 lg:px-5 py-4">{children}</main>
      </div>
    </div>
  );
}
