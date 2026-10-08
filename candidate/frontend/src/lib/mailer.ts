import "server-only";

// Sending mail to candidates — through Resend, the provider the company
// portal and internal-admin already send with (their lib/mailer.ts), reached
// over its HTTP API so this app doesn't take on the SDK for two messages.
//
// Without RESEND_API_KEY and RESEND_FROM nothing is sent, and every caller
// says so to the person in front of it — a reset link that was never mailed
// is not reported as "check your inbox".

export function mailerReady(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) throw new Error("Email not configured — set RESEND_API_KEY and RESEND_FROM");

  // RESEND_API_URL exists so a check can point this at a stand-in; unset, it
  // is Resend.
  const base = process.env.RESEND_API_URL || "https://api.resend.com";
  const res = await fetch(`${base}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(process.env.NOTIFY_EMAIL ? { reply_to: process.env.NOTIFY_EMAIL } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || `The mail provider refused the message (HTTP ${res.status}).`);
  }
}
