// Smallest wasm module using SIMD ops (i32.const 0; i8x16.splat; i8x16.popcnt), as in wasm-feature-detect; validate() is false where SIMD is unsupported
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function hasWasmSimd(): boolean { try { return typeof WebAssembly === "object" && WebAssembly.validate(SIMD_PROBE); } catch { return false; } }
export function hasWorkers(): boolean { return typeof Worker === "function"; }
