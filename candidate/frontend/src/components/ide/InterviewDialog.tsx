"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Circle, Clock, MessagesSquare, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { idePalette, STATUS_BAR_BG } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { canListen, canSpeak, listen, speak, stopSpeaking, type Dictation } from "@/lib/ide/speech";
import { InterviewRecorder, type ClipRecording } from "@/lib/ide/interview-recorder";
import { confirmRecording, interviewStep, startRecordingUpload } from "@/app/ide/interview-actions";

/**
 * The follow-up interview (PRD §1.6: workspace → interview → submit).
 *
 * A few questions about the work the candidate just did, asked by the AI
 * Interviewer. It sits between the Submit button and the final
 * confirmation: the session is still live, so "Back to my work" really does
 * go back — unless the session's time has run out, in which case there is
 * no work left to go back to and the button isn't offered.
 *
 * Everything that shapes it comes from the backend, set by the hiring
 * company on the role: how many questions, in what language, and how long
 * each answer may take. The countdown here is a display of that limit; the
 * backend times each answer itself and is the one that marks it late.
 *
 * Conversation mode makes it a spoken exchange: the question is read aloud,
 * the microphone opens when it finishes, and a few seconds of silence after
 * the candidate has spoken sends the answer and brings the next question.
 * It is built from turns over the browser's own speech features — see
 * lib/ide/speech.ts for why it isn't one open audio line. Typing always
 * works alongside it.
 *
 * Each answer is recorded — microphone, plus the proctoring camera's picture
 * when it's on — and uploaded as its own clip. The candidate is told before
 * the first question, and the header shows whether recording is actually
 * happening; if the microphone is refused, it says so and the interview
 * continues as text.
 *
 * If the interviewer can't be reached, this says so and lets the candidate
 * continue to submit. Blocking a finished assessment on an AI outage would
 * punish the candidate for our failure; the report will show no interview
 * took place.
 */

interface InterviewDialogProps {
  theme: IdeTheme;
  sessionId: string;
  /** The workspace files to ground the questions in — read once, when the interview opens. */
  getFiles: () => Record<string, string>;
  /** The proctoring camera's stream, included in each answer's recording when live. */
  camera: MediaStream | null;
  /** False once the session's time is up: there's no work to go back to. */
  canGoBack: boolean;
  /** Back to the workspace; the interview resumes where it left off next time. */
  onCancel: () => void;
  /** The interview finished, or couldn't be held — move on to submitting. */
  onDone: () => void;
}

interface Progress {
  question: string;
  asked: number;
  total: number;
  language: string;
  answerSeconds: number;
}

/** After the candidate has said something, this much silence ends the answer in conversation mode. */
const SILENCE_MS = 3500;
/** How long finishing waits for the last recordings to upload before moving on without them. */
const UPLOAD_WAIT_MS = 20_000;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function InterviewDialog({ theme, sessionId, getFiles, camera, canGoBack, onCancel, onDone }: InterviewDialogProps) {
  const palette = idePalette(theme);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [answer, setAnswer] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [pending, setPending] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [voiceOn, setVoiceOn] = useState(true);
  // Hands-free by default wherever the browser can both speak and listen.
  const [conversation, setConversation] = useState(() => canListen() && canSpeak());
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | undefined>();
  const [recording, setRecording] = useState<"audio" | "video" | "off" | null>(null);

  const dictation = useRef<Dictation | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useRef<InterviewRecorder | null>(null);
  const clip = useRef<ClipRecording | null>(null);
  const uploads = useRef<Promise<void>[]>([]);
  const started = useRef(false);
  // Latest values for callbacks that outlive the render they were made in
  // (speech and timer callbacks) — same reason IdeShell keeps a snapshot ref.
  const answerRef = useRef("");
  const progressRef = useRef<Progress | null>(null);
  const pendingRef = useRef(true);
  const cameraRef = useRef(camera);
  useEffect(() => {
    answerRef.current = answer;
    progressRef.current = progress;
    pendingRef.current = pending;
    cameraRef.current = camera;
  });

  const conversationRef = useRef(conversation);
  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  const stopListening = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    dictation.current?.stop();
  }, []);

  /** Stops the current answer's clip and uploads it in the background. */
  const finishClip = useCallback(
    (question: number) => {
      const current = clip.current;
      clip.current = null;
      if (!current) return;
      uploads.current.push(
        (async () => {
          const recorded = await current.stop();
          if (!recorded) return;
          const target = await startRecordingUpload(sessionId, question, recorded.blob.type);
          if ("error" in target) return;
          const put = await fetch(target.uploadUrl, {
            method: "PUT",
            headers: { "content-type": recorded.blob.type },
            body: recorded.blob,
          }).catch(() => null);
          if (!put?.ok) return;
          await confirmRecording(sessionId, {
            path: target.path,
            question,
            seconds: recorded.seconds,
            bytes: recorded.blob.size,
            kind: recorded.kind,
          });
        })().catch(() => undefined),
      );
    },
    [sessionId],
  );

  const finish = useCallback(async () => {
    stopListening();
    stopSpeaking();
    setFinishing(true);
    // Give the last clips a bounded chance to land; an upload that's still
    // going after that doesn't hold the candidate's submission hostage.
    await Promise.race([Promise.allSettled(uploads.current), new Promise((resolve) => setTimeout(resolve, UPLOAD_WAIT_MS))]);
    recorder.current?.close();
    onDone();
  }, [onDone, stopListening]);

  const step = useCallback(
    async (input: { answer?: string; skip?: boolean; files?: Record<string, string> }) => {
      setPending(true);
      setError(undefined);
      const result = await interviewStep(sessionId, input);
      setPending(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.done) {
        void finish();
        return;
      }
      setProgress({
        question: result.question ?? "",
        asked: result.asked,
        total: result.total,
        language: result.language,
        answerSeconds: result.answerSeconds,
      });
      setSecondsLeft(result.secondsLeft ?? result.answerSeconds);
      setAnswer("");
      clip.current = recorder.current?.start(cameraRef.current) ?? null;
    },
    [sessionId, finish],
  );

  /** Sends whatever has been typed or said; with nothing at all, records the question as unanswered. */
  const sendAnswer = useCallback(
    (allowEmpty: boolean) => {
      const current = progressRef.current;
      if (!current || pendingRef.current) return;
      const text = answerRef.current.trim();
      if (!text && !allowEmpty) return;
      stopListening();
      stopSpeaking();
      finishClip(current.asked);
      void step(text ? { answer: text } : { skip: true });
    },
    [finishClip, step, stopListening],
  );

  const startListening = useCallback(() => {
    const current = progressRef.current;
    if (!current || dictation.current || pendingRef.current) return;
    setMicNote(undefined);
    let heard = false;
    const armSilence = () => {
      if (!conversationRef.current || !heard) return;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => sendAnswer(false), SILENCE_MS);
    };
    const session = listen({
      lang: current.language,
      onText: (text) => {
        heard = true;
        setAnswer((prev) => (prev ? `${prev} ${text}` : text));
        armSilence();
      },
      onActivity: armSilence,
      onEnd: (reason) => {
        setListening(false);
        dictation.current = null;
        if (reason === "not-allowed" || reason === "service-not-allowed") {
          setMicNote("Microphone access was refused — type your answer instead.");
          setConversation(false);
        } else if (reason === "language-not-supported") {
          setMicNote("Your browser can't listen in this interview's language — type your answer instead.");
          setConversation(false);
        } else if (reason && reason !== "no-speech" && reason !== "aborted") {
          setMicNote("Couldn't hear that — try again, or type your answer.");
        }
      },
    });
    if (!session) {
      setMicNote("Voice input isn't available in this browser — type your answer instead.");
      setConversation(false);
      return;
    }
    dictation.current = session;
    setListening(true);
  }, [sendAnswer]);

  // Open the interview once: ask for the microphone (for recording), then
  // the first question. The ref guards React's development double-mount,
  // which would otherwise ask for two first questions.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const next = new InterviewRecorder();
      const opened = await next.open();
      recorder.current = opened ? next : null;
      setRecording(opened ? (cameraRef.current ? "video" : "audio") : "off");
      await step({ files: getFiles() });
    })();
  }, [step, getFiles]);

  // Each new question: read it aloud, and in conversation mode open the
  // microphone as soon as it has been read.
  useEffect(() => {
    if (!progress?.question) return;
    if (voiceOn && canSpeak()) {
      speak(progress.question, progress.language, () => {
        if (conversationRef.current) startListening();
      });
    } else if (conversationRef.current) {
      startListening();
    }
    // Deliberately keyed on the question alone: toggling voice or
    // conversation mid-question shouldn't re-read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.question]);

  // The answer countdown. When it reaches zero the answer is sent as it
  // stands — or recorded as unanswered if there is nothing.
  useEffect(() => {
    if (secondsLeft === null || pending || error || finishing) return;
    if (secondsLeft <= 0) {
      sendAnswer(true);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, pending, error, finishing, sendAnswer]);

  useEffect(
    () => () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      dictation.current?.stop();
      stopSpeaking();
      // Leaving mid-answer (back to the workspace): drop the partial clip
      // and release the microphone. Finished clips keep uploading.
      void clip.current?.stop();
      recorder.current?.close();
    },
    [],
  );

  const low = secondsLeft !== null && secondsLeft <= 15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-dialog-title"
        className={clsx(
          "flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border shadow-2xl",
          palette.border,
          palette.appBg,
          palette.text,
        )}
      >
        <div className={clsx("flex items-center gap-2 border-b px-4 py-3", palette.border)}>
          <MessagesSquare size={16} className={palette.accent} />
          <h2 id="interview-dialog-title" className="text-sm font-semibold">
            A few questions about your work
          </h2>
          <div className={clsx("ml-auto flex items-center gap-3 text-xs", palette.textMuted)}>
            {recording && recording !== "off" && (
              <span className="flex items-center gap-1 text-red-400" title={`Your answers are being recorded (${recording === "video" ? "camera and microphone" : "microphone"})`}>
                <Circle size={8} fill="currentColor" /> REC
              </span>
            )}
            {progress && (
              <span className="tabular-nums">
                Question {progress.asked} of {progress.total}
              </span>
            )}
            {progress && secondsLeft !== null && !finishing && (
              <span className={clsx("flex items-center gap-1 tabular-nums", low && "font-semibold text-red-400")}>
                <Clock size={12} /> {clock(Math.max(0, secondsLeft))}
              </span>
            )}
            {canSpeak() && (
              <button
                type="button"
                title={voiceOn ? "Stop reading questions aloud" : "Read questions aloud"}
                onClick={() => {
                  if (voiceOn) stopSpeaking();
                  setVoiceOn((on) => !on);
                }}
                className={clsx("rounded-md p-1", palette.hover)}
              >
                {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          {finishing && <p className={palette.textMuted}>That&apos;s the interview. Saving your answers…</p>}

          {!finishing && !progress && !error && (
            <div className={clsx("space-y-2", palette.textMuted)}>
              <p>
                Before you submit, the AI interviewer will ask a few short questions about what you
                built and why. Each answer has a time limit, shown at the top.
              </p>
              <p>
                {recording === "off"
                  ? "Your answers are kept as text. They are not being recorded — the microphone isn't available."
                  : "Your answers are recorded — your voice, and your camera if it's on — and shared with the hiring team alongside the written transcript."}
              </p>
              {pending && <p>Preparing the first question…</p>}
            </div>
          )}

          {!finishing && progress && (
            <>
              <p className="leading-relaxed font-medium">{progress.question}</p>
              <textarea
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  // Typing takes over from the silence timer — an edit isn't the end of an answer.
                  if (silenceTimer.current) clearTimeout(silenceTimer.current);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendAnswer(false);
                }}
                disabled={pending}
                rows={5}
                autoFocus
                placeholder={
                  listening ? "Listening… speak your answer." : canListen() ? "Type your answer, or use the microphone…" : "Type your answer…"
                }
                className={clsx(
                  "mt-3 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none disabled:opacity-60",
                  palette.border,
                )}
              />
              {micNote && <p className={clsx("mt-1.5 text-xs", palette.textMuted)}>{micNote}</p>}
              {canListen() && canSpeak() && (
                <label className={clsx("mt-2 flex items-center gap-2 text-xs", palette.textMuted)}>
                  <input
                    type="checkbox"
                    checked={conversation}
                    onChange={(e) => {
                      setConversation(e.target.checked);
                      if (!e.target.checked && silenceTimer.current) clearTimeout(silenceTimer.current);
                    }}
                  />
                  Conversation mode — listen after each question and move on when I stop speaking
                </label>
              )}
            </>
          )}

          {error && !finishing && (
            <div className="mt-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <p className="font-medium">{error}</p>
              <p className="mt-1 opacity-90">
                You can try again, or continue to submit without the interview — your report will
                show that it didn&apos;t take place.
              </p>
            </div>
          )}
        </div>

        {!finishing && (
          <div className={clsx("flex items-center gap-2 border-t px-4 py-3", palette.border)}>
            {canGoBack && (
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  stopSpeaking();
                  onCancel();
                }}
                className={clsx("rounded-md px-3 py-1.5 text-xs", palette.hover, palette.textMuted)}
              >
                Back to my work
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {error ? (
                <>
                  <button
                    type="button"
                    onClick={() => void step(progress ? {} : { files: getFiles() })}
                    disabled={pending}
                    className={clsx("rounded-md px-3 py-1.5 text-xs disabled:opacity-50", palette.hover)}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => void finish()}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: STATUS_BAR_BG }}
                  >
                    Continue to submit
                  </button>
                </>
              ) : (
                progress && (
                  <>
                    {canListen() && (
                      <button
                        type="button"
                        onClick={() => (listening ? stopListening() : (stopSpeaking(), startListening()))}
                        disabled={pending}
                        title={listening ? "Stop listening" : "Answer by voice"}
                        className={clsx(
                          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs disabled:opacity-50",
                          listening ? "bg-red-500/15 text-red-400" : clsx(palette.hover, palette.textMuted),
                        )}
                      >
                        {listening ? <Square size={12} /> : <Mic size={13} />}
                        {listening ? "Listening…" : "Speak"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => sendAnswer(false)}
                      disabled={pending || answer.trim().length === 0}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: STATUS_BAR_BG }}
                    >
                      {pending ? "Thinking…" : progress.asked >= progress.total ? "Finish interview" : "Next question"}
                    </button>
                  </>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
