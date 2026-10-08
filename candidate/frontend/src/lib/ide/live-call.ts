/**
 * The browser's end of the live voice interview: one WebSocket to the
 * candidate backend carrying the microphone up and the interviewer's voice
 * down (candidate/backend's internal/httpapi/live.go relays it to Gemini's
 * Live API — this page never talks to Gemini, and never holds its key).
 *
 * Audio is raw 16-bit mono PCM in both directions, at the rates the backend
 * names when it issues the ticket. Everything else on the socket is a small
 * JSON message: captions as each side speaks, a "question" when the
 * interviewer has finished asking one, and how the call ended.
 *
 * This is real audio over real devices. If the page can't capture or play
 * it, `start` rejects and the interview is held turn by turn instead.
 */

export interface LiveQuestion {
  asked: number;
  total: number;
  answerSeconds: number;
  /** How much of the question is still to be heard when this arrives. */
  startsInMs: number;
}

export interface LiveCallHandlers {
  /** The call is connected and the interviewer is about to speak. */
  onReady(): void;
  /** A fragment of what is being said, as it is said. */
  onCaption(role: "interviewer" | "candidate", text: string): void;
  /** The interviewer has finished asking a question; the answer clock starts in `startsInMs`. */
  onQuestion(question: LiveQuestion): void;
  /** The time for the current answer ran out; the interviewer is moving on. */
  onTimeUp(): void;
  /**
   * The call is over. "done": the interview is complete. "fallback": it
   * isn't, and should continue turn by turn from where the transcript stops.
   */
  onEnd(outcome: "done" | "fallback", reason?: string): void;
}

export interface LiveCallOptions {
  url: string;
  ticket: string;
  /** The microphone stream — the interview's recorder already holds one. */
  mic: MediaStream;
  inputRate: number;
  outputRate: number;
}

export function canHoldLiveCall(): boolean {
  return typeof window !== "undefined" && "WebSocket" in window && "AudioContext" in window && "AudioWorkletNode" in window;
}

// Runs on the audio thread: hands each block of microphone samples to the page.
const MIC_TAP = `
class MicTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("mic-tap", MicTap);
`;

/** How much microphone audio goes in each message upstream. */
const CHUNK_MS = 100;
/** A little headroom so chunks that arrive unevenly still play without gaps. */
const PLAYBACK_LEAD_S = 0.06;

/**
 * Averages `input` (at `fromRate`) down to `toRate` and returns it as 16-bit
 * PCM, along with the samples left over that didn't fill a whole output
 * sample — the caller prepends those to the next block.
 */
export function downsampleToPcm16(input: Float32Array, fromRate: number, toRate: number): { pcm: Int16Array; rest: Float32Array } {
  const ratio = fromRate / toRate;
  const count = Math.floor(input.length / ratio);
  const pcm = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / (to - from)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return { pcm, rest: input.slice(Math.floor(count * ratio)) };
}

export class LiveCall {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private tapUrl: string | null = null;
  private pending: Float32Array = new Float32Array(0);
  private playing = new Set<AudioBufferSourceNode>();
  private playUntil = 0;
  private ended = false;

  constructor(
    private readonly options: LiveCallOptions,
    private readonly handlers: LiveCallHandlers,
  ) {}

  /** Connects and starts streaming. Rejects if the call can't be set up at all. */
  async start(): Promise<void> {
    const { url, ticket, mic } = this.options;
    const context = new AudioContext();
    this.context = context;
    // The dialog opened from a click, so this normally resolves at once; a
    // context left suspended would capture and play nothing.
    await context.resume();

    this.tapUrl = URL.createObjectURL(new Blob([MIC_TAP], { type: "application/javascript" }));
    await context.audioWorklet.addModule(this.tapUrl);

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("The voice line could not be reached."));
    });
    socket.onerror = null;
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => this.end("fallback", "The voice line dropped.");
    socket.send(JSON.stringify({ ticket }));

    const source = context.createMediaStreamSource(mic);
    const tap = new AudioWorkletNode(context, "mic-tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    // Routed to the output through a silent gain: a node that leads nowhere
    // isn't guaranteed to be run, and the microphone must not be played back.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(tap).connect(mute).connect(context.destination);
    tap.port.onmessage = (event: MessageEvent<Float32Array>) => this.capture(event.data);
  }

  private capture(block: Float32Array): void {
    const context = this.context;
    const socket = this.socket;
    if (!context || !socket || socket.readyState !== WebSocket.OPEN) return;
    const joined = new Float32Array(this.pending.length + block.length);
    joined.set(this.pending);
    joined.set(block, this.pending.length);
    if (joined.length < (context.sampleRate * CHUNK_MS) / 1000) {
      this.pending = joined;
      return;
    }
    const { pcm, rest } = downsampleToPcm16(joined, context.sampleRate, this.options.inputRate);
    this.pending = rest;
    socket.send(pcm.buffer);
  }

  private receive(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      this.play(data);
      return;
    }
    if (typeof data !== "string") return;
    let message: { type?: string; role?: string; text?: string; reason?: string } & Partial<LiveQuestion>;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    switch (message.type) {
      case "ready":
        this.handlers.onReady();
        break;
      case "caption":
        if ((message.role === "interviewer" || message.role === "candidate") && typeof message.text === "string") {
          this.handlers.onCaption(message.role, message.text);
        }
        break;
      case "question":
        this.handlers.onQuestion({
          asked: Number(message.asked) || 0,
          total: Number(message.total) || 0,
          answerSeconds: Number(message.answerSeconds) || 0,
          startsInMs: Math.max(0, Number(message.startsInMs) || 0),
        });
        break;
      case "interrupted":
        this.stopPlayback();
        break;
      case "time_up":
        this.handlers.onTimeUp();
        break;
      case "done": {
        // The sign-off was generated faster than it is spoken; let it finish
        // before the dialog closes over it.
        const context = this.context;
        const wait = context ? Math.max(0, this.playUntil - context.currentTime) * 1000 + 300 : 0;
        setTimeout(() => this.end("done"), wait);
        break;
      }
      case "fallback":
      case "error":
        this.end("fallback", message.reason);
        break;
    }
  }

  private play(data: ArrayBuffer): void {
    const context = this.context;
    if (!context || data.byteLength < 2) return;
    const pcm = new Int16Array(data, 0, Math.floor(data.byteLength / 2));
    const buffer = context.createBuffer(1, pcm.length, this.options.outputRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const at = Math.max(context.currentTime + PLAYBACK_LEAD_S, this.playUntil);
    source.start(at);
    this.playUntil = at + buffer.duration;
    this.playing.add(source);
    source.onended = () => this.playing.delete(source);
  }

  /** The candidate spoke over the interviewer: drop what hasn't been heard yet. */
  private stopPlayback(): void {
    for (const source of this.playing) {
      try {
        source.stop();
      } catch {
        // already finished
      }
    }
    this.playing.clear();
    this.playUntil = 0;
  }

  private end(outcome: "done" | "fallback", reason?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.release();
    this.handlers.onEnd(outcome, reason);
  }

  /** Hangs up without reporting an outcome — the caller already knows why. */
  close(): void {
    this.ended = true;
    this.release();
  }

  private release(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    this.stopPlayback();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    if (this.tapUrl) URL.revokeObjectURL(this.tapUrl);
    this.tapUrl = null;
  }
}
