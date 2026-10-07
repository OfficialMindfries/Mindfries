import type { NotificationTone } from "./data";

/**
 * Working out a candidate's notifications from their real records.
 *
 * Nothing writes a notification anywhere. Each one is derived, every time
 * the bell is opened, from something that is true right now: an invitation
 * waiting for an answer, a due date coming up, a report that has finished.
 * So a notification can't outlive the thing it is about — answer the
 * invitation and it is gone — and a candidate who signs up after being
 * invited still sees the invitation.
 *
 * Pure, so Node can check it (derive.check.ts). Each item's `id` is stable
 * for the thing it is about, which is what read and dismissed state is
 * stored against (candidate_notification_state).
 */

export interface DerivedNotification {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  /** ISO time the notification became true — what it is ordered by. */
  at: string;
  /** Where it leads. */
  href: string;
}

export interface InvitationFact {
  id: string;
  role: string;
  company: string;
  /** assessments.status: invited|in_progress|submitted|closed|declined */
  status: string;
  accepted: boolean;
  createdAt: string;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
}

export interface ReportFact {
  sessionId: string;
  /** What the session was for, when known. */
  role: string | null;
  /** assessment_reports.status */
  status: string;
  updatedAt: string;
}

/** A due date is announced this many days ahead. */
export const DUE_SOON_DAYS = 3;
const DAY = 86_400_000;

/** The end of a YYYY-MM-DD day, in UTC — a due date is good through the day it names. */
const endOfDay = (date: string) => Date.parse(`${date}T23:59:59Z`);

const dayWord = (days: number) => (days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);

export function deriveNotifications(invitations: InvitationFact[], reports: ReportFact[], now: number): DerivedNotification[] {
  const out: DerivedNotification[] = [];

  for (const inv of invitations) {
    const open = inv.status === "invited" || inv.status === "in_progress";
    if (inv.status === "invited" && !inv.accepted) {
      out.push({
        id: `invite:${inv.id}`,
        tone: "info",
        title: `${inv.company} invited you: ${inv.role}`,
        body: "Accept or decline it from your assessments.",
        at: inv.createdAt,
        href: "/assessments?status=invited",
      });
    }
    if (open && inv.dueDate) {
      const due = endOfDay(inv.dueDate);
      if (Number.isFinite(due)) {
        const daysLeft = Math.floor((due - now) / DAY);
        if (now > due) {
          out.push({
            id: `overdue:${inv.id}`,
            tone: "error",
            title: `${inv.role} was due ${inv.dueDate}`,
            body: `${inv.company} asked for it by then. It is still open — whether it is still wanted is theirs to say.`,
            at: new Date(due).toISOString(),
            href: inv.status === "invited" ? "/assessments?status=invited" : "/assessments?status=in-progress",
          });
        } else if (daysLeft < DUE_SOON_DAYS) {
          out.push({
            id: `due:${inv.id}`,
            tone: "warning",
            title: `${inv.role} is due ${dayWord(daysLeft)}`,
            body: inv.status === "invited" ? `${inv.company} asked for it by ${inv.dueDate}. You haven't started.` : `${inv.company} asked for it by ${inv.dueDate}. It's under way.`,
            // It became true when the due date came within range.
            at: new Date(Math.max(due - DUE_SOON_DAYS * DAY, Date.parse(inv.createdAt) || 0)).toISOString(),
            href: inv.status === "invited" ? "/assessments?status=invited" : "/assessments?status=in-progress",
          });
        }
      }
    }
  }

  for (const r of reports) {
    if (r.status === "ready") {
      out.push({
        id: `report:${r.sessionId}`,
        tone: "success",
        title: r.role ? `Your report for ${r.role} is ready` : "Your report is ready",
        body: "See what was observed in your session.",
        at: r.updatedAt,
        href: `/assessments/${encodeURIComponent(r.sessionId)}/report`,
      });
    } else if (r.status === "failed") {
      out.push({
        id: `report-failed:${r.sessionId}`,
        tone: "neutral",
        title: r.role ? `The report for ${r.role} couldn't be generated` : "A report couldn't be generated",
        body: "Your session and its evidence are saved. This is a problem on our side, not with your work.",
        at: r.updatedAt,
        href: `/assessments/${encodeURIComponent(r.sessionId)}/report`,
      });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at));
}
