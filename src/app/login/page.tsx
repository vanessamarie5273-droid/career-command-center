import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-navy-950 p-12 text-white">
        <div className="flex items-center gap-3"><Mark /><span className="text-lg font-semibold tracking-tight">Career Command Center</span></div>
        <div>
          <p className="text-3xl font-semibold leading-tight text-white/95">Executive career intelligence.<br /><span className="text-gold-400">Verified openings. Explainable fit.</span></p>
          <p className="mt-4 max-w-md text-white/60 text-sm">Private workspace. Every job links to the employer&apos;s own posting, and every metric is generated from your records.</p>
        </div>
        <p className="text-xs text-white/40">Private · Single-user · Encrypted in transit</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex items-center gap-3"><Mark /><span className="font-semibold">Career Command Center</span></div>
          <h1 className="h1">Sign in</h1>
          <p className="muted text-sm mt-1 mb-6">Use your personal account.</p>
          <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
        </div>
      </div>
    </div>
  );
}

function Mark() {
  return <svg width="32" height="32" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12224a" /><path d="M18 40 L30 24 L38 34 L46 20" stroke="#c4a254" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
