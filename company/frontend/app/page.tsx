import { redirect } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";

export default async function RootPage() {
  const user = await currentCompanyUser();
  redirect(user ? "/dashboard" : "/login");
}
