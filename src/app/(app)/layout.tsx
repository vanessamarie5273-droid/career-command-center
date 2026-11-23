import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { aiPause } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const [unread, pause] = await Promise.all([prisma.alert.count({ where: { read: false } }), aiPause()]);
  return (
    <div className="min-h-screen lg:bg-[linear-gradient(to_right,#A100C2_14rem,transparent_14rem)]">
      <Sidebar alerts={unread} />
      <div className="lg:pl-56">
        <Topbar alerts={unread} />
        {pause && (
          <div role="status" className="mx-3 mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-[14px] text-amber-900 ring-1 ring-amber-300 lg:mx-5">
            <span className="font-semibold">AI is paused.</span> {pause.reason === "credit" ? "Your Anthropic credit ran out." : "Anthropic didn't accept the API key."} Feeds, Outlook sync, alerts and your board keep working. <Link href="/settings" className="font-semibold underline">What to do</Link>
          </div>
        )}
        <main className="px-3 lg:px-5 py-4">{children}</main>
      </div>
    </div>
  );
}
