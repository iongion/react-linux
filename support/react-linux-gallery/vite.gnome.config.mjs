import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.REACT_LINUX_GALLERY_OUT_DIR ?? path.join(dirname, ".gnome-build");

function isGnomeShellImport(id) {
  return id.startsWith("gi://") || id.startsWith("resource:///");
}

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: false,
    minify: false,
    outDir,
    rollupOptions: {
      external: isGnomeShellImport,
      output: {
        entryFileNames: "extension.js",
        format: "es",
        generatedCode: {
          preset: "es2015",
        },
      },
    },
    sourcemap: true,
    ssr: path.join(dirname, "src/gnomeExtension.tsx"),
    target: "es2022",
  },
  ssr: {
    noExternal: true,
  },
});
