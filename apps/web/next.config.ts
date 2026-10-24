import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@wall-a/core"],
  typescript: {
    ignoreBuildErrors: true, 
  },
  // This tells Next.js to only watch files within the monorepo, not the whole phone
  outputFileTracingRoot: path.join(process.cwd(), "../../"),
};

export default nextConfig;
