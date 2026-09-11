import type { MetadataRoute } from "next";
import { BRAND_COLOR } from "@/lib/constants";

// Without a manifest the storefront can't be added to a mobile home screen — a real loss for a
// mobile-first audience. The PNGs come from scripts/generate-app-icons.mjs; app/icon.svg and
// app/apple-icon.png are wired into <head> by Next's file convention and need no entry here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Without an explicit id the install identity is derived from start_url, so changing that
    // later would register a second, separate app rather than update this one.
    id: "/",
    name: "Aloe.kg — бытовая химия и косметика",
    short_name: "Aloe.kg",
    description: "Интернет-магазин бытовой химии и косметики с доставкой по Бишкеку",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: BRAND_COLOR,
    lang: "ru",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android masks the home screen icon to the launcher's shape; the "any" icons above are
      // drawn edge to edge and would lose their outer leaves to it.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Каталог", url: "/catalog" },
      { name: "Корзина", url: "/cart" },
      { name: "Избранное", url: "/favorites" },
    ],
  };
}
