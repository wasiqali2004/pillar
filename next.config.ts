import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The dev server already binds 0.0.0.0 by default, but Next still blocks
   * cross-origin requests to dev-only assets unless the requesting origin is
   * listed here — without this, the dashboard loads on your phone but every
   * asset/data request silently 403s. Wildcarding the home LAN's /24 means
   * this survives your router handing the machine a different .x address.
   */
  allowedDevOrigins: ["10.0.0.*"],
  // Dev mode prints every server action's arguments, and connectAction's
  // arguments are the API keys people paste in. Keep them out of the terminal.
  logging: { serverFunctions: false },
  poweredByHeader: false,
  // The signed-in app must never load inside someone else's frame, and browsers
  // shouldn't guess content types or leak full URLs to other sites.
  async headers() {
    return [
      // Browsers should always check for a new service worker.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
