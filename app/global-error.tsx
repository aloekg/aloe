"use client";

import { useEffect } from "react";

// Replaces the root layout, so it renders its own <html>/<body> and cannot rely on globals.css.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#171717",
          fontFamily: "system-ui, -apple-system, Arial, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem" }}>Сайт временно недоступен</h1>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: "0 0 1.75rem", lineHeight: 1.6 }}>
            Мы уже знаем о проблеме. Попробуйте обновить страницу через минуту.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.625rem 1.25rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: "0.75rem", color: "#9ca3af" }}>Код ошибки: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
