/**
 * Renders one glyph from `simple-icons` — the real GitHub/GitLab marks,
 * sourced from the installed package (CC0) rather than retyped from memory.
 * A hand-copied SVG path is one wrong digit away from a silently broken or
 * subtly-off logo; importing `.path` from the package means whatever ships
 * here is provably the same bytes the package publishes.
 *
 * There's no `SimpleIcon` for LinkedIn — simple-icons doesn't carry one, and
 * that's respected rather than routed around by hand-drawing one; see
 * lib/profile/links.ts for what LinkedIn uses instead and why.
 */
import { siGithub, siGitlab } from "simple-icons";

export function SimpleIcon({ icon, size = 15 }: { icon: { path: string; title: string }; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" role="img" aria-label={icon.title}>
      <path d={icon.path} />
    </svg>
  );
}

// Fixed to one icon each, so lib/profile/links.ts can reference them the same
// way it references a plain lucide component — `<Icon size={15} />` — without
// needing to know these two are backed by simple-icons underneath.
export const GithubMark = ({ size }: { size?: number }) => <SimpleIcon icon={siGithub} size={size} />;
export const GitlabMark = ({ size }: { size?: number }) => <SimpleIcon icon={siGitlab} size={size} />;
