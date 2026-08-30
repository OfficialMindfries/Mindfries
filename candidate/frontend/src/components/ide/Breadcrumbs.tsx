import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

export function Breadcrumbs({ path, theme }: { path: string | null; theme: IdeTheme }) {
  const palette = idePalette(theme);
  if (!path) return <div className={clsx("h-[22px] shrink-0 border-b", palette.border, palette.breadcrumbBg)} />;

  const segments = path.split("/");

  return (
    <div
      className={clsx(
        "flex h-[22px] shrink-0 items-center gap-1 overflow-x-auto border-b px-2 text-xs",
        palette.border,
        palette.breadcrumbBg
      )}
    >
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} className={palette.breadcrumbText} />}
            <span className={isLast ? palette.breadcrumbTextActive : palette.breadcrumbText}>{seg}</span>
          </span>
        );
      })}
    </div>
  );
}
