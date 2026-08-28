import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: [
    "@sodium/analyzer",
    "@sodium/contracts",
    "@sodium/runtime",
    "@sodium/worker",
  ],
};

export default nextConfig;
