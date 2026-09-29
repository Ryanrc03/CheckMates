import { analyzeReceiptImage } from "./analyze";

self.onmessage = (event: MessageEvent<{ width: number; height: number; data: Uint8ClampedArray }>) => {
  try {
    const { width, height, data } = event.data;
    self.postMessage({ analysis: analyzeReceiptImage({ width, height, data } as ImageData) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Photo analysis failed." });
  }
};
