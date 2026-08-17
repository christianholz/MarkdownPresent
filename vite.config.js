import { defineConfig } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const exampleSource = fileURLToPath(new URL("./examples/layout-test", import.meta.url));

function copyExampleAssets() {
  return {
    name: "copy-example-assets",
    apply: "build",
    async generateBundle() {
      const emitDirectory = async (directory, relative = "") => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const relativePath = join(relative, entry.name);
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await emitDirectory(path, relativePath);
          else this.emitFile({
            type: "asset",
            fileName: `examples/layout-test/${relativePath.replaceAll("\\", "/")}`,
            source: await readFile(path),
          });
        }
      };
      await emitDirectory(exampleSource);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [copyExampleAssets()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
