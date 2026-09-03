import { defineConfig } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const exampleSource = fileURLToPath(new URL("./examples/layout-test", import.meta.url));
const packageMetadata = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const defaultDisplayVersion = `v${packageMetadata.version.replace(/\.0$/, "")}`;
const displayVersion = process.env.MDPRESENT_DISPLAY_VERSION || defaultDisplayVersion;

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
  define: {
    __MDPRESENT_DISPLAY_VERSION__: JSON.stringify(displayVersion),
  },
  plugins: [copyExampleAssets()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
