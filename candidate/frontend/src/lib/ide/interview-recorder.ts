/**
 * Records the candidate's answers during the interview: their microphone,
 * plus the proctoring camera's picture when it's running. One clip per
 * answer, so each recording sits next to the question it answers.
 *
 * This is a real MediaRecorder over real devices. If the microphone is
 * refused or the browser can't record, `start` resolves to null and the
 * interview carries on as text — the UI says it isn't recording rather than
 * showing a recording light over nothing.
 */

export interface Clip {
  blob: Blob;
  seconds: number;
  /** "video" when the camera's picture is in the clip, "audio" otherwise. */
  kind: "audio" | "video";
}

export interface ClipRecording {
  kind: Clip["kind"];
  /** Stops recording and resolves with the clip, or null if nothing was captured. */
  stop(): Promise<Clip | null>;
}

// Modest bitrates: these are talking-head answers a reviewer listens to, a
// couple of minutes each, uploaded from whatever connection the candidate has.
const AUDIO_BITS = 32_000;
const VIDEO_BITS = 250_000;

const MIME_CANDIDATES = {
  video: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"],
  audio: ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"],
};

export function canRecord(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Holds one microphone stream for the length of an interview and cuts clips
 * from it. Asking for the microphone once, up front, means one permission
 * prompt rather than one per question.
 */
export class InterviewRecorder {
  private mic: MediaStream | null = null;

  /** Asks for the microphone. False if it was refused or isn't there. */
  async open(): Promise<boolean> {
    if (!canRecord()) return false;
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch {
      return false;
    }
  }

  /** Starts a clip. `camera` is the proctoring stream, if it's live. */
  start(camera: MediaStream | null): ClipRecording | null {
    if (!this.mic) return null;
    const videoTracks = camera?.getVideoTracks().filter((t) => t.readyState === "live") ?? [];
    const kind: Clip["kind"] = videoTracks.length > 0 ? "video" : "audio";
    const mimeType = MIME_CANDIDATES[kind].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return null;

    const stream = new MediaStream([...this.mic.getAudioTracks(), ...videoTracks]);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS, videoBitsPerSecond: VIDEO_BITS });
    } catch {
      return null;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(1000);

    return {
      kind,
      stop: () =>
        new Promise<Clip | null>((resolve) => {
          if (recorder.state === "inactive") {
            resolve(null);
            return;
          }
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
            resolve(blob.size > 0 ? { blob, seconds: Math.round((Date.now() - startedAt) / 1000), kind } : null);
          };
          recorder.stop();
        }),
    };
  }

  /** Releases the microphone. The camera stream belongs to the proctor gate and is left alone. */
  close(): void {
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    this.mic = null;
  }
}
