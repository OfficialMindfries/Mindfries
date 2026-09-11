import { Sidebar } from "@/components/admin/Sidebar";
import { SetupToast } from "@/components/admin/SetupToast";
import { Toaster } from "@/components/admin/toast";

// What the backend still needs before the admin can go live. Checked here,
// once, for every admin page — it used to be a card repeated at the top of
// five of them — and surfaced as a notification in the corner.
function missingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    missing.push("RESEND_API_KEY, RESEND_FROM");
  }
  return missing;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="pl-64">
        <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
      </main>
      <Toaster />
      <SetupToast missing={missingConfig()} />
    </div>
  );
}
