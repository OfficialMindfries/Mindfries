import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for GitHub user API so the frontend never hits the unauthenticated
 * public API directly. The server-side request has a much higher rate limit
 * and can also attach a token in the future without exposing it to the browser.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  if (!username || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username)) {
    return NextResponse.json({ error: "Invalid username" }, { status: 400 });
  }

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Mindfries-Candidate-App/1.0",
  };

  // Use a token if configured — dramatically raises the rate limit.
  const token = process.env.GITHUB_PAT;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers,
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (res.status === 404) {
    return NextResponse.json({ error: `No GitHub account named "${username}".` }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `GitHub didn't answer (HTTP ${res.status}). Try again in a moment.` },
      { status: 502 }
    );
  }

  const j = await res.json();
  return NextResponse.json({
    name: j.name ?? j.login,
    avatarUrl: j.avatar_url,
    publicRepos: j.public_repos,
    followers: j.followers,
    profileUrl: j.html_url ?? `https://github.com/${username}`,
  });
}
