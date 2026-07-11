import type { NextConfig } from "next";

/**
 * Next.js 16 configuration.
 *
 * Security headers here are the transport-level defence-in-depth layer. The
 * strict Content-Security-Policy is applied per-request in middleware with a
 * per-request nonce (see docs/security-model.md) — the static headers below are
 * the ones that do not need a nonce.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "bullmq", "ioredis", "@aws-sdk/client-s3"],
  experimental: {
    // Server Actions are used for mutations that originate from RSC forms.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
