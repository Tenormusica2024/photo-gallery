import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dhgmxn2rp/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-*",
      },
    ],
  },
  experimental: {
    // Supabase SDKのtree-shaking改善（使用モジュールのみバンドル）
    optimizePackageImports: ["@supabase/supabase-js"],
  },
};

export default nextConfig;
