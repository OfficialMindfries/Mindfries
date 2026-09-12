import { listCompanies, listTemplates } from "@/lib/db";
import { companies as mockCompanies, templates as mockTemplates, SAMPLE_AS_OF } from "@/lib/mock-data";
import { supabaseReady } from "@/lib/supabase";
import { CompaniesView } from "@/components/admin/CompaniesView";

export const dynamic = "force-dynamic";

/**
 * Real data once connected; mock preview while the backend is unwired —
 * same shape as Library and Sessions. Previously a client component with
 * its own `useState` seeded from mock data and nowhere real to write to
 * (ADMIN_BACKEND_PLAN.md §3, confirmed by grep: no listCompanies/createCompany
 * anywhere in lib/db.ts) — the one page that looked done and wasn't.
 */
export default async function CompaniesPage() {
  const live = supabaseReady();
  const [companies, templates] = live
    ? await Promise.all([listCompanies(), listTemplates()])
    : [mockCompanies, mockTemplates];

  return (
    <div className="space-y-6">
      <CompaniesView
        initial={companies}
        publishedTemplates={templates.filter((t) => t.status === "published")}
        sample={!live}
        asOfIso={live ? new Date().toISOString() : SAMPLE_AS_OF}
      />
    </div>
  );
}
