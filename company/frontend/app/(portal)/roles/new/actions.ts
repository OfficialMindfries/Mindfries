"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompanyPermission, ForbiddenError } from "@/lib/auth/company-users";
import { createJobRole } from "@/lib/db";
import type { RoleVisibility } from "@/lib/types";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export type CreateRoleState = { error: string | null };

export async function createRole(_prev: CreateRoleState, form: FormData): Promise<CreateRoleState> {
  let companyId: string;
  try {
    companyId = (await requireCompanyPermission("role:write")).companyId;
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in." };
  }

  const title = text(form.get("title"), 200);
  if (!title) return { error: "Give the role a title." };

  const techStack = text(form.get("techStack"), 500)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const durationRaw = text(form.get("durationMin"), 10);
  const durationMin = durationRaw ? Number(durationRaw) : null;
  if (durationMin !== null && (!Number.isFinite(durationMin) || durationMin <= 0)) {
    return { error: "Duration must be a positive number of minutes." };
  }

  const visibility: RoleVisibility = form.get("visibility") === "open_pool" ? "open_pool" : "invite_only";

  const role = await createJobRole({ companyId, title, techStack, durationMin, visibility });
  revalidatePath("/roles");
  redirect(`/roles/${role.id}`);
}
