import type { Lead } from "./types";

// Fixed outbound templates, company details auto-filled. The Tracker email
// button previews these (editable) before sending via Resend.
export type EmailTemplate = "demo" | "poc";

export interface RenderedEmail {
  subject: string;
  body: string;
}

const FROM_NAME = "Aaryan @ Mindfries";

export function renderEmail(template: EmailTemplate, lead: Lead): RenderedEmail {
  const company = lead.company;
  const role = lead.roleTitle ?? "an engineer";

  if (template === "demo") {
    return {
      subject: `${company} + Mindfries — a sharper way to run technical interviews`,
      body:
`Hi ${company} team,

I noticed you're hiring for ${role} — congrats on growing the team.

Mindfries runs candidates through a real, sandboxed coding assessment (bug fixes, features, refactors) and gives your hiring managers a structured signal on how they actually work, not just whiteboard trivia.

Would you be open to a 20-minute demo this week? I'll show you a live assessment and how the rubric scoring looks for a role like ${role}.

Best,
${FROM_NAME}`,
    };
  }

  // poc
  return {
    subject: `${company} — let's run a Mindfries pilot on your next ${role} req`,
    body:
`Hi ${company} team,

Thanks for taking the demo. As a next step I'd love to set up a no-cost proof-of-concept: we plug Mindfries into one live ${role} requisition, you assess real candidates, and we compare the signal against your current process.

It takes ~30 minutes to set up and you keep every result. If it doesn't beat your current bar, you walk away.

Shall I provision a pilot workspace for ${company}?

Best,
${FROM_NAME}`,
  };
}

// Best-guess inbox when a job post exposes only a company (not an email).
// The admin can edit before sending.
export function guessContactEmail(lead: Lead): string {
  if (lead.contactEmail) return lead.contactEmail;
  if (lead.domain) return `hello@${lead.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  return "";
}
