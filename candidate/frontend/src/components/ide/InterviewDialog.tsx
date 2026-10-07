"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { MessagesSquare, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { idePalette, STATUS_BAR_BG } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { canListen, canSpeak, listen, speak, stopSpeaking, type Dictation } from "@/lib/ide/speech";
import { interviewStep } from "@/app/ide/actions";

/**
 * The follow-up interview (PRD §1.6: workspace → interview → submit).
 *
 * A few short questions about the work the candidate just did, asked by the
 * AI Interviewer and answered by typing or by voice. It sits between the
 * Submit button and the final confirmation: the session is still live, so
 * "Back to my work" really does go back.
 *
 * The questions come from the model, grounded in the candidate's actual
 * files, which are sent once when the interview opens. Voice is the
 * browser's own speech synthesis and recognition, turn by turn — see
 * lib/ide/speech.ts.
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
  /** Back to the workspace; the interview resumes where it left off next time. */
  onCancel: () => void;
  /** The interview finished, or couldn't be held — move on to the submit confirmation. */
  onDone: () => void;
}

interface Progress {
  question: string;
  asked: number;
  total: number;
}

export function InterviewDialog({ theme, sessionId, getFiles, onCancel, onDone }: InterviewDialogProps) {
  const palette = idePalette(theme);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | undefined>();
  const dictation = useRef<Dictation | null>(null);
  const started = useRef(false);

  const step = useCallback(
    async (reply?: string, files?: Record<string, string>) => {
      setPending(true);
      setError(undefined);
      const result = await interviewStep(sessionId, reply, files);
      setPending(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.done) {
        stopSpeaking();
        onDone();
        return;
      }
      setProgress({ question: result.question ?? "", asked: result.asked, total: result.total });
      setAnswer("");
    },
    [sessionId, onDone],
  );

  // Open the interview once. The ref guards React's development double-mount,
  // which would otherwise ask for two first questions.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void step(undefined, getFiles());
  }, [step, getFiles]);

  // Read each new question aloud while voice is on.
  useEffect(() => {
    if (progress?.question && voiceOn) speak(progress.question);
  }, [progress?.question, voiceOn]);

  useEffect(
    () => () => {
      dictation.current?.stop();
      stopSpeaking();
    },
    [],
  );

  const toggleMic = () => {
    if (listening) {
      dictation.current?.stop();
      return;
    }
    stopSpeaking();
    setMicNote(undefined);
    const session = listen(
      (text) => setAnswer((prev) => (prev ? `${prev} ${text}` : text)),
      (reason) => {
        setListening(false);
        dictation.current = null;
        if (reason === "not-allowed" || reason === "service-not-allowed") {
          setMicNote("Microphone access was refused — you can type your answer instead.");
        } else if (reason && reason !== "no-speech" && reason !== "aborted") {
          setMicNote("Couldn't hear that — try again, or type your answer.");
        }
      },
    );
    if (!session) {
      setMicNote("Voice input isn't available in this browser — type your answer instead.");
      return;
    }
    dictation.current = session;
    setListening(true);
  };

  const submitAnswer = () => {
    const text = answer.trim();
    if (!text || pending) return;
    dictation.current?.stop();
    stopSpeaking();
    void step(text);
  };

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
          {progress && (
            <span className={clsx("ml-auto text-xs tabular-nums", palette.textMuted)}>
              Question {progress.asked} of {progress.total}
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
              className={clsx("rounded-md p-1", !progress && "ml-auto", palette.hover, palette.textMuted)}
            >
              {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          {!progress && !error && (
            <p className={palette.textMuted}>
              Before you submit, the AI interviewer will ask a few short questions about what you
              built and why. Your answers are recorded with the rest of your session.
              {pending && " Preparing the first question…"}
            </p>
          )}

          {progress && (
            <>
              <p className="leading-relaxed font-medium">{progress.question}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitAnswer();
                }}
                disabled={pending}
                rows={5}
                autoFocus
                placeholder={canListen() ? "Type your answer, or use the microphone…" : "Type your answer…"}
                className={clsx(
                  "mt-3 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none disabled:opacity-60",
                  palette.border,
                )}
              />
              {micNote && <p className={clsx("mt-1.5 text-xs", palette.textMuted)}>{micNote}</p>}
            </>
          )}

          {error && (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <p className="font-medium">{error}</p>
              <p className="mt-1 opacity-90">
                You can try again, or continue to submit without the interview — your report will
                show that it didn&apos;t take place.
              </p>
            </div>
          )}
        </div>

        <div className={clsx("flex items-center gap-2 border-t px-4 py-3", palette.border)}>
          <button
            type="button"
            onClick={() => {
              dictation.current?.stop();
              stopSpeaking();
              onCancel();
            }}
            className={clsx("rounded-md px-3 py-1.5 text-xs", palette.hover, palette.textMuted)}
          >
            Back to my work
          </button>

          <div className="ml-auto flex items-center gap-2">
            {error ? (
              <>
                <button
                  type="button"
                  onClick={() => void step(undefined, progress ? undefined : getFiles())}
                  disabled={pending}
                  className={clsx("rounded-md px-3 py-1.5 text-xs disabled:opacity-50", palette.hover)}
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onDone}
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
                      onClick={toggleMic}
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
                    onClick={submitAnswer}
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
      </div>
    </div>
  );
}
