import type { OcrBox } from "./spatial";
export type PaddleInitPayload = { cacheName: string; detUrl: string; recUrl: string; wasmPaths: string };
export type PaddleRequest = { id: number; type: "init"; payload: PaddleInitPayload } | { id: number; type: "predict"; payload: Blob } | { id: number; type: "dispose" };
export type PaddlePredictResult = { items: OcrBox[]; metrics: { detMs: number; recMs: number; totalMs: number; detectedBoxes: number; recognizedCount: number } };
export type PaddleResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };
export const PADDLE_MODELS = { det: "PP-OCRv5_mobile_det", rec: "PP-OCRv5_mobile_rec", detFile: "PP-OCRv5_mobile_det_onnx_infer.tar", recFile: "PP-OCRv5_mobile_rec_onnx_infer.tar", ortDir: "runtime/ort/" } as const;
