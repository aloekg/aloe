import { ImageResponse } from "next/og";

export const alt = "Aloe.kg — бытовая химия и косметика с доставкой по Бишкеку";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: "linear-gradient(135deg, #16a34a 0%, #0d7a37 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 128, fontWeight: 700, letterSpacing: -4 }}>Aloe.kg</div>
      <div style={{ fontSize: 40, opacity: 0.92, textAlign: "center", padding: "0 80px" }}>
        Бытовая химия и косметика
      </div>
      <div style={{ fontSize: 30, opacity: 0.75 }}>Доставка по Бишкеку в день заказа</div>
    </div>,
    size,
  );
}
