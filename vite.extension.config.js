import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const extensionRoot = fileURLToPath(new URL("./extension", import.meta.url));
const outputDirectory = fileURLToPath(new URL("./dist/extension", import.meta.url));

export default defineConfig({
  root: extensionRoot,
  base: "./",
  publicDir: fileURLToPath(new URL("./extension/public", import.meta.url)),
  build: {
    target: "es2022",
    sourcemap: true,
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./extension/present.html", import.meta.url)),
    },
  },
});
