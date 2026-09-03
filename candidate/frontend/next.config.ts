import type { NextConfig } from "next";

/**
 * `output: "standalone"` produces .next/standalone — a minimal server the
 * Dockerfile copies instead of shipping the whole node_modules tree.
 *
 * It must NOT be set when building on Vercel. Vercel runs its own output
 * file tracing and expects the default build layout; with standalone on, its
 * post-build step fails looking for a trace file that the standalone layout
 * doesn't leave where it expects:
 *
 *   Error: ENOENT: no such file or directory, open
 *   '/vercel/path0/candidate/frontend/.next/next-server.js.nft.json'
 *
 * Vercel sets VERCEL=1 in the build environment, so Docker/local builds keep
 * standalone output and Vercel deployments get the default.
 */
const nextConfig: NextConfig = {
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;
