// Email delivery through Resend's HTTPS API (https://resend.com). Configure RESEND_API_KEY and ALERT_FROM_EMAIL.
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.ALERT_FROM_EMAIL;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; detail: string }> {
  if (!emailConfigured()) return { ok: false, detail: "Email not configured (RESEND_API_KEY / ALERT_FROM_EMAIL missing)" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [to], subject, html }),
    signal: AbortSignal.timeout(20000),
  }).catch((e: Error) => ({ ok: false, status: 0, text: async () => e.message }) as unknown as Response);
  return res.ok ? { ok: true, detail: "sent" } : { ok: false, detail: `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
}
