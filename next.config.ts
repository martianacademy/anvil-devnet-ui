import type { NextConfig } from "next";

/**
 * Headless control plane: no UI, so no React Compiler or Tailwind pipeline.
 * CORS stays open on the Etherscan-compatible endpoint because external tools
 * (Foundry, Hardhat, dApps) point at it directly.
 */
const nextConfig: NextConfig = {
  // Lets the Docker image ship a self-contained server instead of node_modules.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/api/explorer",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, x-apikey" },
        ],
      },
    ];
  },
};

export default nextConfig;
