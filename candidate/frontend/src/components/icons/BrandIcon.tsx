/**
 * Real brand marks — Google, GitHub, GitLab and LinkedIn — sourced from
 * installed packages, not retyped from memory. A hand-copied SVG path is one
 * wrong digit away from a silently broken or subtly-off logo; importing the
 * path data straight from the package means whatever ships here is provably
 * the same bytes the package publishes.
 *
 * Shared rather than left under components/profile/ where this started: the
 * login page needs the same four marks the profile's linked-accounts card
 * does, and a second hand-copied set would be exactly the risk this file
 * exists to avoid.
 *
 * Google, GitHub and GitLab come from `simple-icons` (CC0). LinkedIn isn't in
 * that package (removed at some point, evidently on request), so its mark
 * comes from `@fortawesome/free-brands-svg-icons` instead — Font Awesome's
 * own official package, CC BY 4.0, specifically the "in" glyph without Font
 * Awesome's own background square, since these are drawn as a single-colour
 * glyph on a coloured tile or plain background here, the same treatment the
 * other three get.
 */
import { siGithub, siGitlab, siGoogle } from "simple-icons";
import { faLinkedinIn } from "@fortawesome/free-brands-svg-icons";

const [LINKEDIN_W, LINKEDIN_H, , , LINKEDIN_PATH] = faLinkedinIn.icon;

export function SimpleIcon({ icon, size = 15 }: { icon: { path: string; title: string }; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" role="img" aria-label={icon.title}>
      <path d={icon.path} />
    </svg>
  );
}

// Fixed to one icon each, so a caller can reference them the same way it
// would a plain lucide component — `<Icon size={15} />` — without needing to
// know what each is backed by underneath.
export const GoogleMark = ({ size }: { size?: number }) => <SimpleIcon icon={siGoogle} size={size} />;
export const GithubMark = ({ size }: { size?: number }) => <SimpleIcon icon={siGithub} size={size} />;
export const GitlabMark = ({ size }: { size?: number }) => <SimpleIcon icon={siGitlab} size={size} />;

export const LinkedinMark = ({ size = 15 }: { size?: number }) => (
  <svg viewBox={`0 0 ${LINKEDIN_W} ${LINKEDIN_H}`} width={size} height={size} fill="currentColor" role="img" aria-label="LinkedIn">
    <path d={LINKEDIN_PATH as string} />
  </svg>
);
