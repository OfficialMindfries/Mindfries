import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal standalone server (.next/standalone) that the
  // Docker image copies, instead of shipping the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
