/**
 * Keeps a record of the proctoring camera: a small still every half minute,
 * for as long as the session's camera is live.
 *
 * The camera has always been required and shown to the candidate; until now
 * nothing was kept of it, so "proctored" meant only that a light was on.
 * Stills rather than video on purpose: a frame every thirty seconds answers
 * what a reviewer actually asks — was the candidate there, were they alone —
 * at a few kilobytes each, where an hour of video is hundreds of megabytes
 * of someone thinking.
 *
 * Each still is uploaded straight to private storage and noted in the
 * session's trail, where the hiring team's report finds it. They are deleted
 * after the same 90 days as the interview recordings. The candidate is told
 * the camera is captured before it is ever turned on (ProctorGate, and the
 * consent copy in lib/policies.ts).
 */

/** How often a still is taken. */
export const SNAPSHOT_INTERVAL_MS = 30_000;
/** The first one, shortly after the camera comes on — so even a short session has one. */
const FIRST_SNAPSHOT_MS = 5_000;

// Small on purpose: enough to see who is in frame, not a portrait.
const WIDTH = 320;
const JPEG_QUALITY = 0.6;

export interface SnapshotSink {
  /** Somewhere to PUT the still, and the path it will have. Null when storage isn't available. */
  uploadTarget(): Promise<{ uploadUrl: string; path: string } | null>;
  /** Called once the still is stored. */
  stored(snapshot: { path: string; bytes: number }): void;
}

/** One frame of a live video stream as a JPEG, or null if a frame can't be had right now. */
async function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * WIDTH) || 240;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
}

/**
 * Starts taking stills of `stream`. Returns the function that stops it.
 * Failures are quiet: a still that can't be taken or stored is skipped, and
 * the next is tried on schedule — the session doesn't hang on its camera
 * record.
 */
export function startCameraSnapshots(stream: MediaStream, sink: SnapshotSink): () => void {
  // A detached <video> is how a frame is read off a stream; it is never shown.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);

  let stopped = false;
  let busy = false;
  const take = async () => {
    if (stopped || busy || document.hidden) return; // a hidden tab's video is paused; its frame would be stale
    busy = true;
    try {
      const frame = await grabFrame(video);
      if (!frame) return;
      const target = await sink.uploadTarget();
      if (!target || stopped) return;
      const put = await fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: frame });
      if (put.ok) sink.stored({ path: target.path, bytes: frame.size });
    } catch {
      // skipped; the next one is half a minute away
    } finally {
      busy = false;
    }
  };

  const first = setTimeout(() => void take(), FIRST_SNAPSHOT_MS);
  const interval = setInterval(() => void take(), SNAPSHOT_INTERVAL_MS);
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(interval);
    video.srcObject = null;
  };
}
