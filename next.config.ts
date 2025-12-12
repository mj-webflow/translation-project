import type { NextConfig } from "next";

// Use base path from environment variable (for Webflow Cloud deployment)
// Leave empty for local development
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  /* config options here */
  ...(basePath && {
    basePath: basePath,
    assetPrefix: basePath,
  }),
};

export default nextConfig;
