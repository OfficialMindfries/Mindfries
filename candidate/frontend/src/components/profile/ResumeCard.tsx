import { FileText } from "lucide-react";
import { resume } from "@/lib/profile/data";

/**
 * Honest, not decorative: there's no storage wired up for a resume upload
 * yet, so this says that plainly instead of drawing a dropzone that would
 * accept a file and do nothing with it. Becomes an upload control the day
 * there's somewhere for the file to go.
 */
export function ResumeCard() {
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-[#B3CFE5] bg-white p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B3CFE5]/40 text-[#1A3D63]">
        <FileText size={18} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#0A1931]">Resume</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-[#4A7FA7]">
          {resume.uploaded
            ? "Uploaded."
            : "Not uploaded yet — this isn't wired up in the current preview."}
        </p>
      </div>
    </section>
  );
}
