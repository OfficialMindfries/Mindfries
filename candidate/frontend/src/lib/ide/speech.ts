/**
 * Voice for the interview, using what the browser already has: speech
 * synthesis to read a question aloud and speech recognition to dictate an
 * answer. Turn-based, not a live call — the interviewer model is reached
 * through OpenRouter, which has no real-time audio stream.
 *
 * Both are optional layers over a text interview. Where a browser lacks
 * either one, the matching `can…` check is false and the UI simply doesn't
 * offer it; nothing here pretends to listen or speak.
 */

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canListen = () => !!recognitionCtor();
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Reads text aloud, replacing anything already being spoken. */
export function speak(text: string): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export interface Dictation {
  stop(): void;
}

/**
 * Starts dictation. `onText` receives each finalised phrase as it's
 * recognised; `onEnd` fires once when listening stops, with the browser's
 * own error code if that's why (e.g. "not-allowed" for a refused mic).
 */
export function listen(onText: (text: string) => void, onEnd: (error?: string) => void): Dictation | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  let error: string | undefined;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) onText(result[0].transcript.trim());
    }
  };
  recognition.onerror = (event) => {
    error = event.error;
  };
  recognition.onend = () => onEnd(error);

  try {
    recognition.start();
  } catch {
    return null;
  }
  return { stop: () => recognition.stop() };
}
