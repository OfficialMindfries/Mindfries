/**
 * Voice for the interview, using what the browser already has: speech
 * synthesis to read a question aloud and speech recognition to hear the
 * answer. The interviewer model is reached through OpenRouter, which has no
 * real-time audio stream, so this is a spoken conversation built from turns
 * — question out, answer in — rather than one open audio line.
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

/**
 * Reads text aloud in `lang` (a BCP-47 tag), replacing anything already
 * being spoken. `onEnd` fires once when it finishes, is cut off, or can't be
 * spoken at all — callers waiting to open the microphone afterwards are
 * never left waiting.
 */
export function speak(text: string, lang: string, onEnd?: () => void): void {
  if (!canSpeak()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  // Prefer a voice that actually speaks this language; without one the
  // browser reads, say, Hindi text with an English voice.
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.slice(0, 2) === lang.slice(0, 2));
  if (voice) utterance.voice = voice;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export interface Dictation {
  stop(): void;
}

export interface ListenOptions {
  /** BCP-47 tag of the language being spoken. */
  lang: string;
  /** Each finalised phrase, as it's recognised. */
  onText: (text: string) => void;
  /** Any sign of speech, including words not yet finalised — used to tell a pause from the end of an answer. */
  onActivity?: () => void;
  /** Fires once when listening stops, with the browser's own error code if that's why (e.g. "not-allowed" for a refused mic). */
  onEnd: (error?: string) => void;
}

/** Starts listening. Returns null where the browser can't. */
export function listen({ lang, onText, onActivity, onEnd }: ListenOptions): Dictation | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  let error: string | undefined;
  recognition.onresult = (event) => {
    onActivity?.();
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) onText(text);
      }
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
