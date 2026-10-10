import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const cacheDir = new URL(".model-assets-cache/", root);
const publicDir = new URL("public/models/", root);
const MOZ = "https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/";
const PADDLE = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/";
// Not require.resolve: onnxruntime-web's "exports" map hides ./package.json.
const pkg = async (name) => { const dir = new URL(`node_modules/${name}/`, root); return { dir, meta: JSON.parse(await readFile(new URL("package.json", dir), "utf8")) }; };
const BUNDLES = [
  { id: "translate-enzh", version: "2.2-b0.6.0", license: "MPL-2.0 (Mozilla translations-models en->zh-Hans v2.2; bergamot-translator v0.6.0)", extraBytes: 0, files: [
    { path: "model.enzh.intgemm.alphas.bin", role: "model", cache: "cache-api", bytes: 43849787, sha256: "4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c", url: MOZ + "translations-models/a7ff7d5e-e67e-406c-a34b-a7edea35b10e.bin" },
    { path: "srcvocab.enzh.spm", role: "model", cache: "cache-api", bytes: 806952, sha256: "bd9b65504acc6d9726dd281f7defc2adb7c2c22d0688fe2f84697de25197c8c5", url: MOZ + "translations-models/ea98c52c-58dc-45d5-af23-38f2b029d020.spm" },
    { path: "trgvocab.enzh.spm", role: "model", cache: "cache-api", bytes: 772004, sha256: "aded6993c36e440284d11cec3f6b8aef9c0e43188a772d80be342a713adf223d", url: MOZ + "translations-models/bddbda68-d4d2-4317-a0a1-119caa47525e.spm" },
    { path: "lex.50.50.enzh.s2t.bin", role: "model", cache: "cache-api", bytes: 6506248, sha256: "4a5e5827788060f1d718a8132b69440929387514a045796e9b77f935db68c055", url: MOZ + "translations-models/da8fccc0-31df-4665-9703-96d36606e019.bin" },
    { path: "runtime/bergamot-translator-v0.6.0.wasm", role: "runtime", cache: "cache-api", bytes: 4960506, sha256: "a3a89d9ad0a4ed8f27bf3e403701b23f5709816f6376438503f2fa5b0182c2dc", url: MOZ + "translations-wasm/05082c31-aee8-4249-9e01-c1865afd7520.wasm" },
    { path: "runtime/bergamot-translator.js", role: "runtime", cache: "http", from: "vendor/bergamot/bergamot-translator.js" },
    { path: "runtime/translator-worker.js", role: "runtime", cache: "http", from: "vendor/bergamot/translator-worker.js" },
    { path: "LICENSE.txt", role: "runtime", cache: "http", from: "vendor/bergamot/LICENSE" },
  ] },
  { id: "ocr-precise", version: "ppocrv5m-ort1.24.3", license: "Apache-2.0 (PaddleOCR models, @paddleocr/paddleocr-js); MIT (onnxruntime-web)", extraBytes: 11500000, files: [
    { path: "PP-OCRv5_mobile_det_onnx_infer.tar", role: "model", cache: "cache-api", bytes: 4843520, sha256: "781056046c9ed77a15c94681605db6a0f62317c2e9cce6931c71da2478d4bc30", url: PADDLE + "PP-OCRv5_mobile_det_onnx_infer.tar" },
    { path: "PP-OCRv5_mobile_rec_onnx_infer.tar", role: "model", cache: "cache-api", bytes: 16701440, sha256: "f7e792bc836f36e7ef895ad47c426d75b0b75b1650caa6d63fe9418441ffba8c", url: PADDLE + "PP-OCRv5_mobile_rec_onnx_infer.tar" },
    { path: "runtime/ort/ort-wasm-simd-threaded.jsep.wasm", role: "runtime", cache: "http", package: "onnxruntime-web", version: "1.24.3", file: "dist/ort-wasm-simd-threaded.jsep.wasm" },
    { path: "runtime/ort/ort-wasm-simd-threaded.jsep.mjs", role: "runtime", cache: "http", package: "onnxruntime-web", version: "1.24.3", file: "dist/ort-wasm-simd-threaded.jsep.mjs" },
    // Neither npm tarball ships license text (onnxruntime-web's README only links upstream; paddleocr-js ships README + dist only), so a notice is generated from each package.json.
    { path: "runtime/ort/NOTICE.txt", role: "runtime", cache: "http", package: "onnxruntime-web", version: "1.24.3", notice: true },
    { path: "runtime/paddleocr-js/NOTICE.txt", role: "runtime", cache: "http", package: "@paddleocr/paddleocr-js", version: "0.4.2", notice: true },
  ] },
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function exists(url) { try { await stat(url); return true; } catch { return false; } }
async function obtain(file) {
  if (file.url) {
    const cached = new URL(file.sha256, cacheDir);
    if (await exists(cached)) { const bytes = await readFile(cached); if (sha256(bytes) === file.sha256) return bytes; }
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${file.url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== file.bytes) throw new Error(`${file.path}: expected ${file.bytes} bytes, got ${bytes.length}`);
    if (sha256(bytes) !== file.sha256) throw new Error(`${file.path}: SHA-256 mismatch`);
    await mkdir(cacheDir, { recursive: true }); await writeFile(cached, bytes); return bytes;
  }
  if (file.package) {
    const { dir, meta } = await pkg(file.package);
    if (meta.version !== file.version) throw new Error(`${file.package} is ${meta.version}; expected ${file.version}`);
    if (file.notice) return Buffer.from(`${meta.name} ${meta.version}\nLicense: ${meta.license} (as declared in the package's package.json; the npm tarball ships no license text file)\nSource: ${meta.repository?.url ?? meta.homepage}\n`);
    return readFile(new URL(file.file, dir));
  }
  return readFile(new URL(file.from, root));
}
const manifest = { version: 1, generatedAt: new Date().toISOString(), bundles: {} };
await rm(publicDir, { recursive: true, force: true });
for (const bundle of BUNDLES) {
  const files = []; const sources = [];
  for (const file of bundle.files) {
    const bytes = await obtain(file);
    const target = new URL(`${bundle.id}/${bundle.version}/${file.path}`, publicDir);
    await mkdir(new URL("./", target), { recursive: true }); await writeFile(target, bytes);
    files.push({ path: file.path, bytes: bytes.length, sha256: sha256(bytes), role: file.role, cache: file.cache });
    sources.push({ file: file.path, url: file.url ?? (file.package ? `npm:${file.package}@${file.version}/${file.file ?? "package.json"}` : `repo:${file.from}`) });
  }
  const totalBytes = files.filter(f => f.cache === "cache-api").reduce((s, f) => s + f.bytes, 0);
  const downloadBytes = files.reduce((s, f) => s + f.bytes, 0) + bundle.extraBytes;
  manifest.bundles[bundle.id] = { id: bundle.id, version: bundle.version, license: bundle.license, totalBytes, downloadBytes, extraBytes: bundle.extraBytes, files, sources };
}
await writeFile(new URL("manifest.json", publicDir), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(new URL("docs/model-assets-manifest.json", root), JSON.stringify({ version: manifest.version, bundles: manifest.bundles }, null, 2) + "\n");
console.log(`Prepared ${Object.keys(manifest.bundles).length} model bundles in public/models (same-origin).`);
