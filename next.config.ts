import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-force-graph-2d", "force-graph"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
