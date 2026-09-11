import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { sparkPaths } from "@/lib/overview";

/**
 * The admin's shared card kit — one design, used on every page, so the panel
 * reads as one product rather than nine pages each doing their own thing.
 *
 * - MetricCard: a headline figure with its icon, trend and sparkline.
 * - Panel: a titled card (count pill, subtitle, action) around a table or list.
 * - SoftPill: the bordered status pill.
 */

// ── MetricCard ──────────────────────────────────────────────────────────────

export type MetricTone = "violet" | "blue" | "green" | "red" | "amber" | "teal";

const TONES: Record<MetricTone, { tile: string; stroke: string; wash: string }> = {
  violet: { tile: "bg-[#efeafd] text-[#7c3aed]", stroke: "#8b5cf6", wash: "rgba(139,92,246,0.07)" },
  blue: { tile: "bg-[#e7f0ff] text-[#2f6fe4]", stroke: "#4f8ff0", wash: "rgba(79,143,240,0.07)" },
  green: { tile: "bg-[#e3f7ec] text-[#1b8f4e]", stroke: "#2fbf71", wash: "rgba(47,191,113,0.07)" },
  red: { tile: "bg-[#ffe9ea] text-[#e0424b]", stroke: "#f06b73", wash: "rgba(240,107,115,0.08)" },
  amber: { tile: "bg-[#fff3dc] text-[#b7791f]", stroke: "#e3a63b", wash: "rgba(227,166,59,0.08)" },
  teal: { tile: "bg-[#e0f6f4] text-[#11807a]", stroke: "#2bb3a8", wash: "rgba(43,179,168,0.07)" },
};

export interface Trend {
  text: string;
  direction: "up" | "down" | "flat";
  /** Whether the change is welcome — colours it, independently of direction. */
  good: boolean;
}

export const flat = (text: string): Trend => ({ text, direction: "flat", good: true });

/**
 * A figure, its trend, and a sparkline of how it got here.
 *
 * Laid out wider than tall: the icon and label on top, and the figure beside
 * a graph that takes the rest of the width. An earlier version pinned the
 * figure to the bottom of a tall card, which left an empty band across the
 * middle of every one.
 *
 * `series` is optional — a figure with no honest history (money that depends
 * on plan prices, say) shows no graph rather than an invented one.
 */
export function MetricCard({
  id, label, value, icon: Icon, tone, trend, series, seriesLabel, href,
}: {
  id: string;
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: MetricTone;
  trend?: Trend;
  series?: number[];
  seriesLabel?: string;
  href?: string;
}) {
  const t = TONES[tone];
  const W = 180;
  const H = 64;
  const paths = series && series.length > 1 ? sparkPaths(series, W, H) : null;
  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;
  const trendColor = !trend || trend.direction === "flat" ? "text-dim" : trend.good ? "text-[#1b8f4e]" : "text-[#e0424b]";

  const body = (
    <div
      className="hair-card flex h-full flex-col gap-4 overflow-hidden p-5 transition hover:-translate-y-0.5"
      style={{ backgroundImage: `linear-gradient(140deg, transparent 45%, ${t.wash})` }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.tile}`}>
          <Icon size={19} strokeWidth={2.1} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="shrink-0">
          <div className="text-[38px] leading-none font-extrabold tracking-tight tabular-nums">{value}</div>
          {trend && (
            <div className={`mt-2 flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${trendColor}`}>
              <TrendIcon size={14} strokeWidth={2.4} aria-hidden />
              <span>{trend.text}</span>
            </div>
          )}
        </div>
        {paths && (
          // Takes the width left beside the figure; the line keeps its weight
          // when stretched, so a narrow card gets a narrower graph, not a
          // squashed one.
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={seriesLabel}
            className="h-16 min-w-[56px] flex-1 overflow-visible"
            style={{ maxWidth: W }}
          >
            {seriesLabel && <title>{seriesLabel}</title>}
            <defs>
              <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={t.stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={paths.area} fill={`url(#spark-${id})`} />
            <path d={paths.line} fill="none" stroke={t.stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-[1.25rem] focus-visible:outline-2 focus-visible:outline-accent">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Metric cards in a row: as many columns as cards, down to two on narrow screens. */
export function MetricGrid({ children, columns }: { children: ReactNode; columns: 3 | 4 | 5 }) {
  const cols = { 3: "lg:grid-cols-3", 4: "xl:grid-cols-4", 5: "lg:grid-cols-3 2xl:grid-cols-5" }[columns];
  return <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>{children}</div>;
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function Panel({
  title, count, countTone = "violet", subtitle, action, children, className = "",
}: {
  title: string;
  count?: ReactNode;
  countTone?: PillTone;
  subtitle?: string;
  /** A link ({label, href}) or any node, on the right of the header. */
  action?: { label: string; href: string } | ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const isLink = !!action && typeof action === "object" && "href" in (action as object) && "label" in (action as object);
  return (
    <section className={`hair-card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            {count !== undefined && <SoftPill tone={countTone}>{count}</SoftPill>}
          </div>
          {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
        </div>
        {isLink ? (
          <Link
            href={(action as { href: string }).href}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline"
          >
            {(action as { label: string }).label} <ArrowRight size={15} />
          </Link>
        ) : (
          (action as ReactNode)
        )}
      </header>
      <div className="border-t border-hair">{children}</div>
    </section>
  );
}

// ── SoftPill ────────────────────────────────────────────────────────────────

export type PillTone = "red" | "green" | "gray" | "amber" | "blue" | "violet";

const PILL: Record<PillTone, string> = {
  red: "border-[#fbd0d4] bg-[#fff1f2] text-[#d93a44]",
  green: "border-[#c5ecd5] bg-[#effbf4] text-[#1b8f4e]",
  gray: "border-hair bg-surface-2 text-dim",
  amber: "border-[#f3dca6] bg-[#fff8e8] text-[#b7791f]",
  blue: "border-[#c6d8f7] bg-[#eff5ff] text-[#2f63c9]",
  violet: "border-[#d9cdfa] bg-[#f4f0ff] text-[#6d3fe0]",
};

export function SoftPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PILL[tone]}`}>
      {children}
    </span>
  );
}
