import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  root: "src",
  build: {
    outDir: "../public",
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
  },
});
