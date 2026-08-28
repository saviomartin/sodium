import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sodium/contracts", "@sodium/runtime"],
};

export default nextConfig;
