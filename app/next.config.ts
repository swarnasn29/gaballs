import path from "node:path";
import type { NextConfig } from "next";

// Pin the project root to app/: a stray package-lock.json higher up (e.g. in the home folder) otherwise makes
// Next guess the wrong workspace root.
const root = path.resolve(__dirname);

// DEV TEST SIGNER (src/app/api/dev-signer/route.dev.ts, src/dev/*): only when running `next dev` with DEV_SIGNER=1.
// Files ending in .dev.ts/.dev.tsx are routes/pages ONLY in that mode, so production builds never compile them.
// scripts/check-no-dev-signer.mjs runs after every `next build` (including Vercel) and fails if any trace remains.
// It also requires the dev server to be bound to 127.0.0.1 (`npm run dev:signer`), so a plain `npm run dev` — which
// listens on the whole network — never enables it, even if DEV_SIGNER=1 is set in .env.local.
const hostArg = process.argv[process.argv.indexOf("-H") + 1] ?? process.argv[process.argv.indexOf("--hostname") + 1];
const localOnly = process.argv.includes("-H") || process.argv.includes("--hostname") ? hostArg === "127.0.0.1" : false;
const devSigner = process.env.NODE_ENV === "development" && process.env.DEV_SIGNER === "1" && localOnly;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev-mode "N" badge covers content in screenshots.
  devIndicators: false,
  outputFileTracingRoot: root,
  // *.preview.tsx pages (fake-data visual previews, e.g. /dev/reveal) exist in any `next dev`, never in builds.
  pageExtensions: [
    ...(devSigner ? ["dev.tsx", "dev.ts"] : []),
    ...(process.env.NODE_ENV === "development" ? ["preview.tsx"] : []),
    "tsx",
    "ts",
  ],
  env: { NEXT_PUBLIC_DEV_SIGNER: devSigner ? "1" : "0" },
  turbopack: {
    root,
    resolveAlias: {
      // Real dev signer only in dev-signer mode; an empty stub everywhere else.
      "gaballs-dev-signer": devSigner ? "./src/dev/dev-signer-client.dev.tsx" : "./src/dev/dev-signer-stub.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
