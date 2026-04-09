import type { NextConfig } from "next";

const cloudinaryRemotePatterns = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  ? [
      {
        protocol: "https" as const,
        hostname: "res.cloudinary.com",
        pathname: `/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/**`,
      },
    ]
  : [];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...cloudinaryRemotePatterns,
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-*",
      },
    ],
  },
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Supabase SDKのtree-shaking改善（使用モジュールのみバンドル）
    optimizePackageImports: ["@supabase/supabase-js"],
  },
};

export default nextConfig;
