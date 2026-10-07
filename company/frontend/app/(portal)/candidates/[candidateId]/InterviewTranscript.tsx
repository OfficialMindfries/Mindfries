import type { InterviewExchange } from "@/lib/types";

/**
 * The follow-up interview as it happened: each question the AI interviewer
 * asked, what the candidate answered, how long they took, and — when their
 * answer was recorded — the recording itself, to listen to or watch.
 *
 * This is the raw exchange, shown beside the report's own "interview"
 * evidence rather than instead of it: the report is an agent's reading of
 * this conversation, and a hiring team should be able to check that reading
 * against what was actually said.
 *
 * Recording links are signed for an hour when the page is rendered (see
 * getInterviewExchanges); reloading the page mints fresh ones.
 */
export function InterviewTranscript({ exchanges }: { exchanges: InterviewExchange[] }) {
  if (exchanges.length === 0) return null;

  return (
    <div className="hair-card divide-y divide-hair">
      <div className="px-6 py-3.5">
        <div className="eyebrow">Interview</div>
        <p className="mt-1 text-[13px] text-dim">
          {exchanges.length} question{exchanges.length === 1 ? "" : "s"} asked by the AI interviewer about the candidate&apos;s own work.
        </p>
      </div>
      {exchanges.map((x) => (
        <div key={x.number} className="space-y-2 px-6 py-4">
          <p className="text-sm font-semibold">
            <span className="mono mr-2 text-faint">Q{x.number}</span>
            {x.question}
          </p>
          {x.answer === null ? (
            <p className="text-sm text-dim italic">Not answered — the interview ended before this question was answered.</p>
          ) : (
            <p className={x.unanswered ? "text-sm text-dim italic" : "text-sm"}>{x.answer}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
            {x.seconds !== null && !x.unanswered && <span>Answered in {x.seconds}s</span>}
            {x.timedOut && !x.unanswered && <span className="font-semibold text-[#a6203c]">Over the time limit</span>}
            {x.unanswered && <span className="font-semibold text-[#a6203c]">Ran out of time</span>}
          </div>
          {x.recording &&
            (x.recording.kind === "video" ? (
              <video controls preload="none" src={x.recording.url} className="mt-1 w-full max-w-md rounded-xl bg-black" />
            ) : (
              <audio controls preload="none" src={x.recording.url} className="mt-1 w-full max-w-md" />
            ))}
        </div>
      ))}
    </div>
  );
}
