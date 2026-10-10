import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  // Model bundle paths carry their version, so they may be cached forever; the manifest must always revalidate.
  async headers() {
    return [
      { source: "/models/manifest.json", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
      { source: "/models/:bundle/:version/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  turbopack: {
    ignoreIssue: [
      // OpenCV.js (Emscripten) only touches fs/path/crypto under ENVIRONMENT_IS_NODE, never in the browser worker.
      { path: /node_modules\/@techstark\/opencv-js\//, title: /Module not found/ },
      // The SDK's prebuilt worker-entry is referenced by its createDefaultWorker(); we never call it (worker:false inside our own worker).
      { path: /node_modules\/@paddleocr\/paddleocr-js\/dist\/assets\/worker-entry/, title: /Module not found/ },
    ],
  },
};

export default nextConfig;
