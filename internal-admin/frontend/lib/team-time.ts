import { todayIn } from "./targets-rules";

// Follow-ups are due on calendar days, and a calendar day depends on where
// you are. The team is in India, so that's the default; set ADMIN_TIMEZONE to
// override. Server-side only — client components get `today` passed in, so
// server and client can never disagree about which day it is.
export const TEAM_TZ = process.env.ADMIN_TIMEZONE || "Asia/Kolkata";
export const teamToday = () => todayIn(TEAM_TZ);
