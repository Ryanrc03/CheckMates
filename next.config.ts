import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
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
