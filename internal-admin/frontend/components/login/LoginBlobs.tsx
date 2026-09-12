/**
 * The scattered curved shapes from the reference, redrawn in this app's own
 * violet/coral (the same pair .tile-violet and .tile-coral already use) —
 * a login page is a brand moment, and the reference's mixed rainbow would
 * read as a different product's screenshot, not this one's.
 *
 * Purely decorative: aria-hidden and click-through, positioned absolutely
 * around a relatively-positioned container the page supplies.
 */
export function LoginBlobs() {
  const blobs = [
    { top: "10%", left: "20%", size: 42, tint: "#ff7a5c", rotate: -20 },
    { top: "18%", right: "14%", size: 38, tint: "#7c3aed", rotate: 140 },
    { top: "46%", left: "9%", size: 32, tint: "#9b6bff", rotate: 60 },
    { bottom: "18%", left: "15%", size: 38, tint: "#e0d3ff", rotate: -30 },
    { bottom: "12%", right: "15%", size: 42, tint: "#ffb199", rotate: 100 },
  ] as const;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <span
          key={i}
          className="absolute opacity-70"
          style={{
            top: "top" in b ? b.top : undefined,
            bottom: "bottom" in b ? b.bottom : undefined,
            left: "left" in b ? b.left : undefined,
            right: "right" in b ? b.right : undefined,
            width: b.size,
            height: b.size,
            backgroundColor: b.tint,
            borderRadius: "100% 100% 100% 0%",
            transform: `rotate(${b.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
