import { listTemplates } from "@/lib/db";
import { templates as mockTemplates } from "@/lib/mock-data";
import { supabaseReady } from "@/lib/supabase";
import { LibraryView } from "@/components/admin/LibraryView";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // Real data once connected; mock preview while the backend is unwired.
  const initial = supabaseReady() ? await listTemplates() : mockTemplates;
  return (
    <div className="space-y-6">
      <LibraryView initial={initial} />
    </div>
  );
}
