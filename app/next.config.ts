import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root to app/: a stray package-lock.json higher up (e.g. in the home folder) otherwise makes
// Next guess the wrong workspace root.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev-mode "N" badge covers content in screenshots.
  devIndicators: false,
  outputFileTracingRoot: root,
  turbopack: {
    root,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
