import { DatabaseZap } from "lucide-react";

// Shown when Supabase is configured but 0003_targets.sql was never applied to
// it. The panel is read-only on purpose: there is no "set it up for me"
// button, because creating tables in a live project is the owner's call, and a
// button that quietly ran DDL would be the wrong kind of helpful.
export function SchemaNotice({ detail }: { detail?: string }) {
  return (
    <div className="hair-card p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff1e3] text-[#c26410]">
          <DatabaseZap size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-[17px] font-semibold text-ink">Targets needs its database tables</h2>
            <p className="max-w-2xl text-sm text-dim">
              This Supabase project is connected, but the Targets migration has never been applied to it — so{" "}
              <span className="mono text-[13px]">target_companies</span>,{" "}
              <span className="mono text-[13px]">target_contacts</span> and{" "}
              <span className="mono text-[13px]">target_activities</span> don&rsquo;t exist yet.
            </p>
          </div>

          <ol className="max-w-2xl list-decimal space-y-1.5 pl-5 text-sm text-dim marker:text-faint">
            <li>
              Open your project&rsquo;s <span className="font-medium text-ink">SQL Editor</span> in the Supabase dashboard.
            </li>
            <li>
              Paste and run <span className="mono text-[13px] text-ink">supabase/migrations/0003_targets.sql</span> from this repo.
            </li>
            <li>Reload this page.</li>
          </ol>

          <p className="max-w-2xl text-[13px] text-faint">
            If the other admin panels are empty too, the earlier migrations
            (<span className="mono">0001_tracker.sql</span>, <span className="mono">0002_product.sql</span>) haven&rsquo;t been
            applied either — run them first, in order.
          </p>

          {detail && (
            <p className="mono max-w-2xl rounded-lg bg-[#fafafc] px-3 py-2 text-[12px] leading-relaxed text-faint">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
