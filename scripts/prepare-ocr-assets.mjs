import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const target = new URL("public/ocr/", root);
await mkdir(target, { recursive: true });
const sources = [
  { package: "tesseract.js", version: "6.0.1", files: ["dist/worker.min.js", "LICENSE.md"], license: "Apache-2.0" },
  { package: "tesseract.js-core", version: "6.1.2", files: null, license: "Apache-2.0" },
  { package: "@tesseract.js-data/eng", version: "1.0.0", files: ["4.0.0_best_int/eng.traineddata.gz"], license: "MIT (package); Apache-2.0 (upstream tessdata)" },
];
const manifest = [];
for (const source of sources) {
  const pkgPath = require.resolve(`${source.package}/package.json`);
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  if (pkg.version !== source.version) throw new Error(`Unexpected ${source.package} version ${pkg.version}; expected ${source.version}`);
  const directory = dirname(pkgPath);
  const files = source.files ?? (await readdir(directory)).filter(f => /\.wasm(?:\.js)?$/.test(f));
  if (!files.length) throw new Error(`OCR assets missing in ${source.package}`);
  for (const file of files) {
    const name = file.split("/").at(-1);
    const destination = name === "LICENSE.md" ? "TESSERACT-LICENSE.txt" : name;
    const bytes = await readFile(join(directory, file));
    await copyFile(join(directory, file), new URL(destination, target));
    manifest.push({ file: destination, package: source.package, version: pkg.version, source: `https://registry.npmjs.org/${source.package}`, license: source.license, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  }
}
await writeFile(new URL("manifest.json", target), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared ${manifest.length} pinned OCR assets in public/ocr (same-origin).`);
