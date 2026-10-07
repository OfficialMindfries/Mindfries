// The email a candidate gets when a company invites them to a role.
//
// Pure, so it can be read and checked without a mail provider. The link
// goes to the candidate portal's own assessments page — not to a one-time
// token: the invitation belongs to whoever signs in with the invited
// address, so the message says which address that is.

export function invitationMail(input: {
  /** The candidate portal's public origin, no trailing slash. */
  portal: string;
  companyName: string;
  roleTitle: string;
  candidateName?: string;
  /** YYYY-MM-DD, if the company set one. */
  dueDate?: string;
}): { subject: string; text: string } {
  const first = input.candidateName?.trim().split(/\s+/)[0];
  const due = input.dueDate
    ? new Date(`${input.dueDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  return {
    subject: `${input.companyName} invited you to an assessment for ${input.roleTitle}`,
    text:
      `Hi${first ? ` ${first}` : ""},\n\n` +
      `${input.companyName} has invited you to take a technical assessment for ${input.roleTitle} on Mindfries.\n\n` +
      `See the invitation, and accept or decline it, here:\n\n${input.portal}/assessments?status=invited\n\n` +
      `Sign in — or create an account — with this email address; the invitation is tied to it.\n` +
      (due ? `\nThe company has asked for it by ${due}.\n` : "") +
      `\nWhat to expect: you work on a real task in a browser workspace, with a time limit, and the hiring team sees how you worked — the commands you ran, the changes you made, what you asked the AI assistant — along with stills from your camera. ` +
      `Nothing starts, and no clock runs, until you choose to begin.\n\n` +
      `If you weren't expecting this, you can ignore it or decline from the same page.\n`,
  };
}
