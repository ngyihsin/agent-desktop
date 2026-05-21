import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const extensionBuild = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
};

const webviewBuild = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  sourcemap: true,
  logLevel: "info",
  entryPoints: ["src/webview-main.ts"],
  outfile: "out/webview.js",
};

async function build() {
  if (isWatch) {
    const [extCtx, wvCtx] = await Promise.all([
      esbuild.context(extensionBuild),
      esbuild.context(webviewBuild),
    ]);
    await Promise.all([extCtx.watch(), wvCtx.watch()]);
    console.log("[esbuild] watching extension + webview...");
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(webviewBuild),
    ]);
    console.log("[esbuild] built → out/extension.js + out/webview.js");
  }
}

build().catch((err) => {
  console.error("[esbuild] failed:", err);
  process.exit(1);
});
