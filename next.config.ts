import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phones on the LAN open the dev server by this machine's 10.0.0.x address. Next 16 answers the HMR socket and dev fonts with 403 for any host not listed here, and the page then never hydrates (it stays on "Getting your table ready…").
  allowedDevOrigins: ["127.0.0.1", "10.0.0.*"],
  devIndicators: false,
  // Model bundle paths carry their version, so they may be cached forever; the manifest must always revalidate.
  async headers() {
    return [
      { source: "/models/manifest.json", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/models/:bundle/:version/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    // The SDK imports the default onnxruntime-web entry, whose WebGPU-capable ("jsep", 25 MB) wasm makes JavaScriptCore grow past 3 GB after creating
    // the OCR sessions and gets the tab killed on iOS. We only ever run the wasm backend, so resolve it to the wasm-only entry (12 MB, flat memory).
    resolveAlias: { "onnxruntime-web": "onnxruntime-web/wasm" },
    ignoreIssue: [
      // OpenCV.js (Emscripten) only touches fs/path/crypto under ENVIRONMENT_IS_NODE, never in the browser worker.
      { path: /node_modules\/@techstark\/opencv-js\//, title: /Module not found/ },
      // The SDK's prebuilt worker-entry is referenced by its createDefaultWorker(); we never call it (worker:false inside our own worker).
      { path: /node_modules\/@paddleocr\/paddleocr-js\/dist\/assets\/worker-entry/, title: /Module not found/ },
    ],
  },
};

export default nextConfig;
