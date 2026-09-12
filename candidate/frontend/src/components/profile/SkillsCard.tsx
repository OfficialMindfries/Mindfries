import { skills } from "@/lib/profile/data";

/**
 * Skills, grouped and shown as tags rather than a bare list — the grouping
 * (Languages / Frameworks / Tools) is the useful signal; a flat bag of nine
 * words would read as a keyword dump.
 */
export function SkillsCard() {
  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
      <h2 className="text-sm font-semibold text-[#0A1931]">Skills</h2>

      <div className="mt-4 space-y-4">
        {skills.map((group) => (
          <div key={group.label}>
            <h3 className="text-xs font-medium tracking-wide text-[#4A7FA7] uppercase">{group.label}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[#B3CFE5] bg-[#B3CFE5]/15 px-3 py-1 text-xs font-medium text-[#1A3D63]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
