import type { MetadataRoute } from "next";
import { BRAND_COLOR } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // Explicit id: otherwise derived from start_url, and changing that would register a second app.
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
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Каталог", url: "/catalog" },
      { name: "Корзина", url: "/cart" },
      { name: "Избранное", url: "/favorites" },
    ],
  };
}
