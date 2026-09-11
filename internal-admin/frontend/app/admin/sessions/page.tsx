import { listSessions } from "@/lib/db";
import { sessions as mockSessions } from "@/lib/mock-data";
import { SAMPLE_AS_OF } from "@/lib/mock-data";
import { supabaseReady } from "@/lib/supabase";
import { SessionsView } from "@/components/admin/SessionsView";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  // Real sessions (written by the candidate app) once connected; mock preview otherwise.
  const live = supabaseReady();
  const initial = supabaseReady() ? await listSessions() : mockSessions;
  return (
    <div className="space-y-6">
      <SessionsView initial={initial} sample={!live} asOfIso={live ? new Date().toISOString() : SAMPLE_AS_OF} />
    </div>
  );
}
