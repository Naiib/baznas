import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Keep module resolution inside the frontend package when the repository
    // also contains a parent-level lockfile.
    root: path.resolve(__dirname),
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
