import "server-only";
import { db } from "./supabase";

/**
 * Recordings are kept for 90 days and then permanently deleted — that is
 * what a candidate is told when they consent (RETENTION in
 * candidate/frontend/src/lib/policies.ts). This is the thing that does it,
 * for both kinds there are: the interview's audio/video clips, and the
 * proctoring camera's stills.
 *
 * Each is a file in a private storage bucket plus an event in the session's
 * trail pointing at it. Expiring one deletes the file and turns the event
 * into its "…_expired" form with the path removed, so the hiring team's view
 * can say the recording was deleted rather than show a player or picture
 * that fails. The written transcript and the rest of the trail are not
 * touched.
 *
 * Only files with an event are found. One that was uploaded but never noted
 * in the trail has nothing pointing at it and is not cleaned up here.
 */

export const RECORDING_RETENTION_DAYS = 90;

/** The kinds of stored recording, and what each becomes when it expires. */
const KINDS = [
  { event: "interview_recording", expired: "interview_recording_expired", bucket: "interview-recordings" },
  { event: "camera_snapshot", expired: "camera_snapshot_expired", bucket: "proctor-snapshots" },
] as const;

// One run handles this many of each kind; the rest wait for tomorrow's.
// Keeps a run well inside a serverless function's time limit however large
// the backlog is. Stills arrive 120 to a session, hence the larger share.
const MAX_PER_RUN = 2000;
const REMOVE_CHUNK = 100;

export interface RetentionResult {
  /** Files past the retention period that this run looked at. */
  found: number;
  /** Files deleted from storage and marked expired in the trail. */
  deleted: number;
  /** Ones that could not be deleted, left as they were for the next run. */
  failed: number;
}

interface RecordingRow {
  id: number;
  session_id: string;
  payload: Record<string, unknown> | null;
}

/** The files a run should delete: those whose event is older than the retention period. */
export function cutoffFor(now: Date, days = RECORDING_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * A file's path is only trusted if it sits in its own session's folder. The
 * event is written through an endpoint the candidate's browser can reach,
 * so a path pointing anywhere else is not something to act on.
 */
export function recordingPath(row: RecordingRow): string | null {
  const path = row.payload?.path;
  if (typeof path !== "string" || !path.startsWith(`${row.session_id}/`) || path.includes("..")) return null;
  return path;
}

export async function expireOldRecordings(now = new Date()): Promise<RetentionResult> {
  const c = db();
  if (!c) throw new Error("Supabase is not configured");
  const result: RetentionResult = { found: 0, deleted: 0, failed: 0 };

  for (const kind of KINDS) {
    const { data, error } = await c
      .from("activity_events")
      .select("id, session_id, payload")
      .eq("event_type", kind.event)
      .lt("occurred_at", cutoffFor(now).toISOString())
      .order("occurred_at", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as RecordingRow[];
    result.found += rows.length;

    for (let i = 0; i < rows.length; i += REMOVE_CHUNK) {
      const chunk = rows.slice(i, i + REMOVE_CHUNK);
      const paths = chunk.map(recordingPath).filter((p): p is string => p !== null);

      // Removing a file that is already gone is not an error, so a run that
      // died between the two steps below is finished by the next one.
      if (paths.length > 0) {
        const { error: removeError } = await c.storage.from(kind.bucket).remove(paths);
        if (removeError) {
          result.failed += chunk.length;
          continue;
        }
      }

      // Each event keeps its own payload, minus the path, under its new type.
      for (const row of chunk) {
        const rest = Object.fromEntries(Object.entries(row.payload ?? {}).filter(([key]) => key !== "path"));
        const { error: updateError } = await c
          .from("activity_events")
          .update({ event_type: kind.expired, payload: { ...rest, deletedAt: now.toISOString() } })
          .eq("id", row.id);
        if (updateError) result.failed++;
        else result.deleted++;
      }
    }
  }
  return result;
}
