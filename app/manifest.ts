import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Makes Pillar installable as an app on desktop (Chrome, Edge) and on
 * phones (Android, and iOS via Add to Home Screen). It opens straight into
 * the dashboard in its own window; the website stays at "/".
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#15152a",
    theme_color: "#15152a",
    categories: ["lifestyle", "productivity", "health"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
