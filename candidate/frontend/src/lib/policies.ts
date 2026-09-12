/**
 * What gets recorded, how it's used, and for how long — the real consent
 * copy a candidate agrees to in onboarding (ConsentStep), pulled out here so
 * the "Privacy & recording policy" item in the account menu shows the exact
 * same text rather than a second, hand-written version that could quietly
 * drift from what was actually agreed to.
 */

export const RECORDED_SIGNALS = [
  { icon: "🗂️", label: "Repository navigation", detail: "Which files you explore and in what order" },
  { icon: "✏️", label: "Code changes", detail: "Every edit, not just the final state" },
  { icon: "⌨️", label: "Terminal commands", detail: "Commands run and their output" },
  { icon: "🧪", label: "Test execution", detail: "Which tests you run and when" },
  { icon: "💬", label: "AI assistant usage", detail: "How you interact with the AI — what you ask and why" },
  { icon: "⏱️", label: "Time patterns", detail: "Where you spend time — reading, coding, debugging" },
];

export const WHAT_IS_RECORDED = {
  title: "What is recorded during a session",
  body: "Your camera feed, code activity, and workspace behaviour are captured throughout a session. Nothing is recorded until you click Enter Workspace on the final onboarding step.",
};

export const HOW_EVIDENCE_IS_USED = {
  title: "How evidence is used",
  body: "Mindfries doesn't score your final code. Instead, it produces an evidence report for the hiring team that describes how you approached the problem — what you explored, where you debugged, how you used tests, and how you explained your decisions. The hiring team makes the final call.",
};

export const RETENTION = {
  title: "Retention",
  body: "Session recordings and activity data are retained for 90 days and then permanently deleted, unless you request earlier deletion.",
};
