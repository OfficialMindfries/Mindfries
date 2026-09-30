import "server-only";
import { Resend } from "resend";

export const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "officemindfries@gmail.com";

let cached: Resend | null | undefined;
function client(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  cached = key ? new Resend(key) : null;
  return cached;
}

export function mailerReady(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<string> {
  const c = client();
  const from = process.env.RESEND_FROM;
  if (!c || !from) throw new Error("Email not configured — set RESEND_API_KEY and RESEND_FROM");
  const { data, error } = await c.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    replyTo: opts.replyTo ?? NOTIFY_EMAIL,
  });
  if (error) throw new Error(error.message);
  return data?.id ?? "";
}
