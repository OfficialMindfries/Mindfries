/* eslint-disable @next/next/no-img-element -- signed, short-lived storage URLs; next/image would cache and proxy them */
import { clock } from "@/lib/moments";
import type { CameraRecord } from "@/lib/types";

/**
 * The proctoring camera's record of the session: stills taken every half
 * minute while the candidate worked, sampled evenly across it.
 *
 * It is here so that "the session was proctored" is something a reviewer can
 * look at rather than take on trust — was the candidate there throughout,
 * and alone. It is deliberately not analysed: nothing here counts faces or
 * judges attention. A person looks, and decides what it means.
 */
export function CameraTimeline({ camera }: { camera: CameraRecord }) {
  if (camera.total === 0) return null;

  return (
    <div className="hair-card px-6 py-4">
      <div className="eyebrow">Camera</div>
      <p className="mt-1 text-[13px] text-dim">
        {camera.total} still{camera.total === 1 ? "" : "s"} taken through the session, one every half minute.
        {camera.stills.length > 0 && camera.stills.length < camera.total - camera.expired && ` Showing ${camera.stills.length}, evenly spread.`}
        {camera.expired > 0 && ` ${camera.expired} ${camera.expired === 1 ? "has" : "have"} been deleted at the end of the 90-day retention.`}
      </p>
      {camera.stills.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {camera.stills.map((still) => (
            <li key={still.url}>
              <a href={still.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-hair">
                <img src={still.url} alt={`The candidate's camera ${clock(still.offsetSeconds)} into the session`} loading="lazy" className="aspect-[4/3] w-full bg-black object-cover" />
              </a>
              <div className="mono mt-1 text-center text-[11px] text-faint">{clock(still.offsetSeconds)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
