import Link from "next/link";
import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { sparkPaths } from "@/lib/overview";

/**
 * A headline number with its trend: icon tile, label, the figure, what changed
 * recently, and a sparkline of how it got here.
 *
 * `good` says whether the change is welcome, separately from its direction —
 * more active companies is good news, more sessions needing attention isn't —
 * so the trend is coloured by what it means, not by which way it points.
 */

export type MetricTone = "violet" | "blue" | "green" | "red";

const TONES: Record<MetricTone, { tile: string; stroke: string; fill: string; wash: string }> = {
  violet: { tile: "bg-[#efeafd] text-[#7c3aed]", stroke: "#8b5cf6", fill: "#8b5cf6", wash: "rgba(139,92,246,0.07)" },
  blue: { tile: "bg-[#e7f0ff] text-[#2f6fe4]", stroke: "#4f8ff0", fill: "#4f8ff0", wash: "rgba(79,143,240,0.07)" },
  green: { tile: "bg-[#e3f7ec] text-[#1b8f4e]", stroke: "#2fbf71", fill: "#2fbf71", wash: "rgba(47,191,113,0.07)" },
  red: { tile: "bg-[#ffe9ea] text-[#e0424b]", stroke: "#f06b73", fill: "#f06b73", wash: "rgba(240,107,115,0.08)" },
};

export interface Trend {
  text: string;
  direction: "up" | "down" | "flat";
  good: boolean;
}

export function MetricCard({
  id, label, value, icon: Icon, tone, trend, series, seriesLabel, href,
}: {
  /** Unique on the page — names the sparkline's gradient. */
  id: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tone: MetricTone;
  trend: Trend;
  series: number[];
  /** What the sparkline shows, for the tooltip and screen readers. */
  seriesLabel: string;
  href?: string;
}) {
  const t = TONES[tone];
  const W = 132;
  const H = 64;
  const { line, area } = sparkPaths(series, W, H);
  const TrendIcon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  const trendColor = trend.direction === "flat" ? "text-dim" : trend.good ? "text-[#1b8f4e]" : "text-[#e0424b]";

  const body = (
    <div
      className="hair-card relative flex h-full min-h-[190px] flex-col overflow-hidden p-6 transition hover:-translate-y-0.5"
      style={{ backgroundImage: `linear-gradient(140deg, transparent 45%, ${t.wash})` }}
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.tile}`}>
          <Icon size={19} strokeWidth={2.1} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-ink">{label}</span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="shrink-0">
          <div className="text-[44px] leading-none font-extrabold tracking-tight tabular-nums">{value}</div>
          <div className={`mt-2 flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${trendColor}`}>
            <TrendIcon size={14} strokeWidth={2.4} aria-hidden />
            <span>{trend.text}</span>
          </div>
        </div>
        {/* Takes whatever width is left beside the figure, up to W. The line
            keeps its thickness when stretched (non-scaling-stroke), so a
            narrow card gets a narrower graph, not a squashed one. */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={seriesLabel}
          className="h-[64px] min-w-[64px] flex-1 overflow-visible"
          style={{ maxWidth: W }}
        >
          <title>{seriesLabel}</title>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.fill} stopOpacity="0.28" />
              <stop offset="100%" stopColor={t.fill} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-${id})`} />
          <path d={line} fill="none" stroke={t.stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block rounded-[1.25rem] focus-visible:outline-2 focus-visible:outline-accent" aria-label={`${label}: ${value}. ${trend.text}`}>
      {body}
    </Link>
  ) : (
    body
  );
}
