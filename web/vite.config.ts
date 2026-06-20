import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The app imports the engine straight from ../src (TypeScript). Vite compiles
// those sources on the fly and resolves their `.js` ESM specifiers to the `.ts`
// files. The engine's own deps (@pkmn/dex, @smogon/calc) resolve from the repo
// root node_modules, so only the repo root needs them installed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The app imports engine sources and data from the repo root (one level up).
    fs: { allow: [".."] },
  },
});
