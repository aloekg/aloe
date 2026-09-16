import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` is a marker package: its default export throws, and only the "react-server"
      // export condition resolves to the empty module. Vitest applies no such condition, so any
      // test that reaches a server-only file (lib/rate-limit, lib/mailer, lib/invoice,
      // lib/supabase-admin, lib/supabase) would throw on import. Point it at the package's own
      // empty build once here, instead of vi.mock("server-only") in every such test.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
