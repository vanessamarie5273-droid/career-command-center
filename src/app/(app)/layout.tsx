import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { aiPauseNow } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const [unread, pause] = await Promise.all([prisma.alert.count({ where: { read: false } }), aiPauseNow()]);
  return (
    <div className="min-h-screen lg:bg-[linear-gradient(to_right,#A100C2_14rem,transparent_14rem)]">
      <Sidebar alerts={unread} />
      <div className="lg:pl-56">
        <Topbar alerts={unread} />
        {pause && (
          <div role="status" className="mx-4 mt-4 rounded-ctl bg-amber-50 px-4 py-2.5 text-[14px] text-amber-900 ring-1 ring-amber-300 lg:mx-6">
            <span className="font-semibold">AI is paused.</span> {pause.reason === "credit" ? "Your Anthropic credit ran out." : "Anthropic didn't accept the API key."} Feeds, Outlook sync, alerts and your board keep working. <Link href="/settings" className="font-semibold underline">What to do</Link>
          </div>
        )}
        <main className="px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
