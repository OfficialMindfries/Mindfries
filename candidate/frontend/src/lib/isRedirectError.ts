/**
 * next/navigation's redirect() works by throwing an error carrying a
 * "NEXT_REDIRECT" digest that the framework catches further up the stack —
 * a server action wrapping its own backend call in try/catch has to let
 * that throw keep propagating instead of reporting it as a failure. This
 * version of Next.js doesn't export a public `isRedirectError` helper
 * (checked: not in `next/navigation`), so this is the same duck-typed check
 * Next's own internals use, factored out once both onboarding's and the
 * IDE's submit actions needed it.
 */
export function isRedirectError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
