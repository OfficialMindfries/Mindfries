import { redirect } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { Sidebar } from "@/components/company/Sidebar";

/**
 * Wraps every signed-in page (/dashboard, /roles, /candidates, /settings/*)
 * behind the sidebar shell — mirrors internal-admin's app/admin/layout.tsx.
 * A route group ("(portal)") so none of these paths carry an extra URL
 * segment, matching IMPLEMENTATION.md §8's "no [companyId], no admin-style
 * /admin prefix either" route map.
 *
 * The middleware already turned anonymous requests away; this is the second
 * check, and the one that actually supplies the identity these pages
 * render — relying on the middleware alone would mean trusting a header
 * this app never sets.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await currentCompanyUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar user={{ name: user.name, email: user.email, role: user.role, companyName: user.companyName }} />
      <main className="pl-64">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
