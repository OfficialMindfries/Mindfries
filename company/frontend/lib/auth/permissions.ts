import type { CompanyRole } from "@/lib/types";

// The permission matrix from IMPLEMENTATION.md §10 — a draft, not yet
// confirmed. One shared `can()` checked in every write path (Server Action
// or route handler), so Phase 2/3 screens thread this through from the
// start instead of it being retrofitted later (§14's stated risk).

export type Action =
  | "role:write" // create/edit/close a job role
  | "candidate:invite"
  | "candidate:stage" // shortlist/reject/hire, change a candidate's stage
  | "team:manage" // invite/remove teammates, change their role
  | "billing:manage";

const MATRIX: Record<Action, CompanyRole[]> = {
  "role:write": ["admin", "recruiter"],
  "candidate:invite": ["admin", "recruiter"],
  "candidate:stage": ["admin", "recruiter"],
  "team:manage": ["admin"],
  "billing:manage": ["admin"],
};

export function can(action: Action, role: CompanyRole): boolean {
  return MATRIX[action].includes(role);
}
