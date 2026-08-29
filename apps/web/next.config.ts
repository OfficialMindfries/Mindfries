import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next doesn't pick up lockfiles
  // higher up the tree (the repo is a monorepo: apps/web, later apps/api).
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};

export default nextConfig;
