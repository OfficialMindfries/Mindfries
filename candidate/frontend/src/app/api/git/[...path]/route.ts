import { NextResponse } from "next/server";
import { currentCandidate } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

/**
 * A narrow proxy for git's smart-HTTP protocol, so the workspace's
 * `git clone` / `fetch` / `pull` can reach a real remote.
 *
 * The workspace's git runs in the browser (isomorphic-git), and git hosts
 * don't send the CORS headers a browser needs to talk to them directly. So
 * the browser asks this route, same-origin, and this route asks the host.
 * isomorphic-git's `corsProxy` option calls it as
 * `/api/git/<host>/<owner>/<repo>.git/…`.
 *
 * It is deliberately not a general proxy:
 *
 * - Signed-in candidates only.
 * - A short list of git hosts, over HTTPS.
 * - Only the two requests fetching uses: the ref advertisement
 *   (`GET …/info/refs?service=git-upload-pack`) and the pack request
 *   (`POST …/git-upload-pack`).
 * - **Read-only.** `git-receive-pack` — pushing — is refused, here and in
 *   the workspace's git command. Work done in an assessment is submitted
 *   through the assessment; it isn't sent out to a remote from here, and no
 *   candidate's git credentials ever pass through this server. That also
 *   means private repositories can't be cloned.
 */

const HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org", "codeberg.org"]);
const MAX_REQUEST_BYTES = 4 * 1024 * 1024; // a fetch request is a list of wants and haves, never large
const FORWARD_REQUEST = ["content-type", "accept", "git-protocol", "user-agent"];
const FORWARD_RESPONSE = ["content-type", "cache-control"];

type Params = { params: Promise<{ path: string[] }> };

function refuse(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function target(request: Request, { params }: Params, method: "GET" | "POST"): Promise<URL | NextResponse> {
  if (!(await currentCandidate())) return refuse(401, "sign in required");

  const { path } = await params;
  const [host, ...rest] = path ?? [];
  if (!host || !HOSTS.has(host.toLowerCase())) {
    return refuse(403, `git over this workspace can reach ${[...HOSTS].join(", ")} — not ${host || "that host"}`);
  }
  if (rest.some((part) => part === ".." || part === "." || part === "")) return refuse(400, "malformed repository path");

  const repoPath = rest.join("/");
  const query = new URL(request.url).searchParams;
  const service = query.get("service");
  const refs = method === "GET" && repoPath.endsWith("/info/refs");
  const pack = method === "POST" && repoPath.endsWith("/git-upload-pack");

  if (repoPath.endsWith("/git-receive-pack") || service === "git-receive-pack") {
    return refuse(403, "pushing isn't available from the workspace — work is submitted through the assessment, not to a remote");
  }
  if (!(refs && service === "git-upload-pack") && !pack) return refuse(400, "only git fetch requests are proxied");

  const url = new URL(`https://${host.toLowerCase()}/${repoPath}`);
  if (refs) url.searchParams.set("service", "git-upload-pack");
  return url;
}

async function relay(request: Request, url: URL, method: "GET" | "POST"): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // No Authorization, no cookies: this reaches public repositories only.

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BYTES) return refuse(413, "git request too large");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { method, headers, body, redirect: "follow", cache: "no-store" });
  } catch {
    return refuse(502, `could not reach ${url.host}`);
  }
  // A host that wants credentials is a private (or missing) repository; say
  // that rather than passing on a login challenge the browser would act on.
  if (upstream.status === 401 || upstream.status === 403) {
    return refuse(404, "that repository is private or doesn't exist — the workspace can only fetch public repositories");
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(request: Request, context: Params) {
  const url = await target(request, context, "GET");
  return url instanceof URL ? relay(request, url, "GET") : url;
}

export async function POST(request: Request, context: Params) {
  const url = await target(request, context, "POST");
  return url instanceof URL ? relay(request, url, "POST") : url;
}
