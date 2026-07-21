import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` exists to throw when a client bundle pulls in a server
      // module. Vitest is neither, and resolves its browser build, so point it
      // at the no-op the server condition would have given us.
      "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Which fetch path runs must not depend on whether the developer happens
    // to have a gh-CLI token exported. Tests that want the token path stub it
    // explicitly.
    env: { GITHUB_TOKEN: "", GH_TOKEN: "" },
  },
});
