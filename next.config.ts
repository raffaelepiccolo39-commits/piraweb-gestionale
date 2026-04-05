import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'queboudvijstvpjuacix.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },
};

export default nextConfig;
