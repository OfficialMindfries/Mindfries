"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Circle, Clock, MessagesSquare, Mic, PhoneCall, Square, Volume2, VolumeX } from "lucide-react";
import { idePalette, STATUS_BAR_BG } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { canListen, canSpeak, listen, speak, stopSpeaking, type Dictation } from "@/lib/ide/speech";
import { InterviewRecorder, type ClipRecording } from "@/lib/ide/interview-recorder";
import { canHoldLiveCall, LiveCall } from "@/lib/ide/live-call";
import { confirmRecording, interviewStep, openLiveInterview, startRecordingUpload } from "@/app/ide/interview-actions";

/**
 * The follow-up interview (PRD §1.6: workspace → interview → submit).
 *
 * A few questions about the work the candidate just did, asked by the AI
 * Interviewer. It comes after the candidate has confirmed they're finished,
 * and there is no way back from it to the editor: the interviewer discusses
 * their code in specifics, so the code is frozen when the first question is
 * asked (the backend enforces this — see orchestrator.RecordSnapshot). When
 * the interview ends, the work is submitted.
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
 * Where the backend has a live voice line, the interview is one spoken call
 * instead: the interviewer talks and listens continuously, and the candidate
 * just answers aloud — see lib/ide/live-call.ts. The questions, the limits
 * and the record of it are the same; only how it's held differs. If the call
 * can't be placed, or drops, the interview carries on in the turn-based form
 * above from wherever it had got to.
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

export function InterviewDialog({ theme, sessionId, getFiles, camera, onDone }: InterviewDialogProps) {
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

  // The live voice call, when the interview is being held as one. `saying`
  // is the interviewer's current turn as it's spoken.
  const [live, setLive] = useState<"connecting" | "on" | null>(null);
  const [saying, setSaying] = useState("");
  const call = useRef<LiveCall | null>(null);
  const liveRef = useRef(false);
  const sayingRef = useRef("");
  // The interviewer's next caption starts a new turn rather than adding to the last.
  const turnOver = useRef(true);
  const clockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // In a live call the answer is whatever was said; the backend ends it.
      if (!current || pendingRef.current || liveRef.current) return;
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

  /** Leaves the live call (if any) and carries on turn by turn from wherever the interview stands. */
  const continueInText = useCallback(
    (note?: string) => {
      call.current?.close();
      call.current = null;
      liveRef.current = false;
      if (clockTimer.current) clearTimeout(clockTimer.current);
      setLive(null);
      setSaying("");
      const current = progressRef.current;
      if (current) finishClip(current.asked);
      if (note) setMicNote(note);
      setProgress(null);
      setSecondsLeft(null);
      void step({});
    },
    [finishClip, step],
  );

  /**
   * Tries to hold the interview as a live voice call. Resolves false when
   * there's no call to be had, so the caller can start the turn-based one.
   */
  const startLive = useCallback(
    async (mic: MediaStream): Promise<boolean> => {
      if (!canHoldLiveCall()) return false;
      setLive("connecting");
      const opened = await openLiveInterview(sessionId, getFiles());
      if ("unavailable" in opened) {
        setLive(null);
        return false;
      }
      const language = opened.language;
      const next = new LiveCall(
        { url: opened.url, ticket: opened.ticket, mic, inputRate: opened.inputRate, outputRate: opened.outputRate },
        {
          onReady: () => {
            setLive("on");
            setPending(false);
          },
          onCaption: (role, text) => {
            if (role === "candidate") {
              setAnswer((prev) => prev + text);
              return;
            }
            sayingRef.current = turnOver.current ? text : sayingRef.current + text;
            turnOver.current = false;
            setSaying(sayingRef.current);
          },
          onQuestion: (q) => {
            const previous = progressRef.current;
            if (previous) finishClip(previous.asked);
            turnOver.current = true;
            setAnswer("");
            setProgress({ question: sayingRef.current.trim(), asked: q.asked, total: q.total, language, answerSeconds: q.answerSeconds });
            clip.current = recorder.current?.start(cameraRef.current) ?? null;
            // The clock starts once the question has been heard, not when it
            // finished being generated.
            setSecondsLeft(null);
            if (clockTimer.current) clearTimeout(clockTimer.current);
            clockTimer.current = setTimeout(() => setSecondsLeft(q.answerSeconds), q.startsInMs);
          },
          onTimeUp: () => setSecondsLeft(0),
          onEnd: (outcome, reason) => {
            call.current = null;
            if (outcome === "done") {
              liveRef.current = false;
              const current = progressRef.current;
              if (current) finishClip(current.asked);
              void finish();
              return;
            }
            continueInText(`${reason ?? "The voice call ended."} Continuing in text.`);
          },
        },
      );
      try {
        liveRef.current = true;
        call.current = next;
        await next.start();
        return true;
      } catch {
        next.close();
        call.current = null;
        liveRef.current = false;
        setLive(null);
        return false;
      }
    },
    [sessionId, getFiles, finishClip, finish, continueInText],
  );

  // Open the interview once: ask for the microphone (for recording, and for
  // the live call), then start — as a live voice call where there is one,
  // otherwise with the first turn-based question. The ref guards React's
  // development double-mount, which would otherwise start two interviews.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const next = new InterviewRecorder();
      const opened = await next.open();
      recorder.current = opened ? next : null;
      setRecording(opened ? (cameraRef.current ? "video" : "audio") : "off");
      if (next.stream && (await startLive(next.stream))) return;
      // If the call was refused after its ticket was issued, the workspace
      // has already been recorded; sending it again is harmless.
      await step({ files: getFiles() });
    })();
  }, [step, getFiles, startLive]);

  // Each new question: read it aloud, and in conversation mode open the
  // microphone as soon as it has been read.
  useEffect(() => {
    // A live call speaks its own questions.
    if (!progress?.question || liveRef.current) return;
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
      // In a live call the backend's own clock moves the interviewer on.
      if (!liveRef.current) sendAnswer(true);
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
      if (clockTimer.current) clearTimeout(clockTimer.current);
      call.current?.close();
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
            {live === "on" && (
              <span className="flex items-center gap-1" title="Live voice call with the AI interviewer">
                <PhoneCall size={12} /> Live
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
            {canSpeak() && !live && (
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
              {pending && !live && <p>Preparing the first question…</p>}
              {live === "connecting" && <p>Connecting you to the interviewer…</p>}
              {live === "on" && (
                <p className={palette.text}>
                  {saying || "You're connected. The interviewer will speak first — just answer aloud when they've finished."}
                </p>
              )}
            </div>
          )}

          {!finishing && progress && live && (
            <>
              <p className="leading-relaxed font-medium">{saying || progress.question}</p>
              <div className={clsx("mt-3 min-h-24 rounded-lg border px-3 py-2 text-sm leading-relaxed", palette.border)}>
                {answer ? answer : <span className={palette.textMuted}>Answer aloud — what you say appears here.</span>}
              </div>
              <p className={clsx("mt-2 text-xs", palette.textMuted)}>
                This is a live call: speak naturally, and the interviewer moves on when you&apos;ve finished or the time runs out.
              </p>
            </>
          )}

          {!finishing && progress && !live && (
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
              ) : live ? (
                live === "on" && (
                  <button
                    type="button"
                    onClick={() => continueInText("You left the voice call.")}
                    className={clsx("rounded-md px-3 py-1.5 text-xs", palette.hover, palette.textMuted)}
                  >
                    Switch to typing
                  </button>
                )
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
