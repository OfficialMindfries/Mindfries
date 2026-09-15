import { redirect } from "next/navigation";

// "/" was the stock create-next-app starter page — nothing in the product
// ever pointed here. middleware.ts already sends a signed-in candidate on
// /login straight to /dashboard, so this just needs to land everyone else on
// /login; it doesn't need to know about sessions itself.
export default function Home() {
  redirect("/login");
}
