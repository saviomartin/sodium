import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@sodium/analyzer",
    "@sodium/contracts",
    "@sodium/runtime",
    "@sodium/worker",
  ],
};

export default nextConfig;
