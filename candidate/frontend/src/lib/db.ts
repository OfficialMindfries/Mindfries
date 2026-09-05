import "server-only";
import { db } from "./supabase";
import type { Assessment } from "./dashboard/data";

// Candidate-facing reads/writes against the shared product schema
// (supabase/migrations/0002_product.sql). Returns [] when unconnected so the
// dashboard falls back to mock data.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Published games authored by Mindfries ops (internal-admin) show up here as
// assessments a candidate can start.
export async function listAvailableAssessments(): Promise<Assessment[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c
    .from("game_templates")
    .select("id,name,tech_stack,duration_min,status")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  return (data ?? []).map((r: any) => ({
    id: r.id,
    role: r.name,
    company: "Mindfries",
    location: "Remote",
    tags: [...(r.tech_stack ?? []).slice(0, 2), `${r.duration_min ?? 60} min`],
    status: "invited" as const,
    due: "Open now",
  }));
}

// Candidate starts an assessment → a live session appears in the admin monitor.
export async function startSession(templateId: string, candidateName: string): Promise<void> {
  const c = db();
  if (!c) throw new Error("Supabase not configured");
  const { error } = await c.from("sessions").insert({
    template_id: templateId,
    candidate_name: candidateName,
    status: "live",
  });
  if (error) throw error;
}
