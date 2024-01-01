import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "tsconfig.build.json",
  splitting: false,
  clean: true, // clean up the dist folder
  dts: false, // generate dts files
  format: ["cjs", "esm"], // generate cjs and esm files
  minify: true,
  bundle: true,
  entry: {
    "client.bundle": "src/index.ts",
  },
  outDir: "dist",
});
