import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sodium/runtime"],
};

export default nextConfig;
