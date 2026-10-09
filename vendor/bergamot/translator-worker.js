/* CheckMates translation worker. Runs Mozilla's bergamot-translator v0.6.0 (MPL-2.0) build.
 * Protocol: main thread posts { id, name, args } and receives { id, result } or { id, error: { name, message } }.
 * Methods: initialize({ wasm: ArrayBuffer }) -> { version }
 *          loadModel({ model, lex, vocabs: [src, trg], from, to }) -> { loaded: true }
 *          translate({ texts: string[] }) -> string[]
 *          free() -> { freed: true }
 */
importScripts("./bergamot-translator.js");

var ALIGN = { model: 256, lex: 64, vocab: 64 };
var bergamot = null;
var service = null;
var model = null;

function configText(config) {
  var indent = "            ";
  var out = "\n";
  Object.keys(config).forEach(function (key) { out += indent + key + ": " + config[key] + "\n"; });
  return out + indent;
}
function aligned(buffer, alignment) {
  var memory = new bergamot.AlignedMemory(buffer.byteLength, alignment);
  memory.getByteArrayView().set(new Uint8Array(buffer));
  return memory;
}
var handlers = {
  initialize: function (args) {
    return new Promise(function (resolve, reject) {
      var M = loadBergamot({
        INITIAL_MEMORY: 41943040,
        print: function () {},
        printErr: function (line) { console.warn("[bergamot]", line); },
        onAbort: function (reason) { reject(new Error("bergamot wasm aborted: " + reason)); },
        onRuntimeInitialized: function () { Promise.resolve().then(function () { bergamot = M; service = new bergamot.BlockingService({ cacheSize: 0 }); resolve({ version: "v0.6.0" }); }); },
        wasmBinary: args.wasm,
      });
    });
  },
  loadModel: function (args) {
    if (!bergamot) throw new Error("initialize first");
    if (model) { model.delete(); model = null; }
    var memory = aligned(args.model, ALIGN.model);
    var lex = args.lex ? aligned(args.lex, ALIGN.lex) : null;
    var vocabs = new bergamot.AlignedMemoryList();
    args.vocabs.forEach(function (v) { vocabs.push_back(aligned(v, ALIGN.vocab)); });
    var config = configText({ "beam-size": "1", normalize: "1.0", "word-penalty": "0", "max-length-break": "128", "mini-batch-words": "1024", workspace: "128", "max-length-factor": "2.0", "skip-cost": "true", "cpu-threads": "0", quiet: "true", "quiet-translation": "true", "gemm-precision": "int8shiftAlphaAll", alignment: "soft" });
    model = new bergamot.TranslationModel(args.from || "en", args.to || "zh", config, memory, lex, vocabs, null);
    return { loaded: true };
  },
  translate: function (args) {
    if (!model) throw new Error("loadModel first");
    var messages = new bergamot.VectorString();
    var options = new bergamot.VectorResponseOptions();
    args.texts.forEach(function (text) { messages.push_back(text); options.push_back({ qualityScores: false, alignment: false, html: false }); });
    var responses = null;
    try {
      responses = service.translate(model, messages, options);
      return args.texts.map(function (_, i) { return responses.get(i).getTranslatedText(); });
    } finally { messages.delete(); options.delete(); if (responses) responses.delete(); }
  },
  free: function () { if (model) { model.delete(); model = null; } return { freed: true }; },
};
self.onmessage = function (event) {
  var data = event.data || {};
  Promise.resolve().then(function () {
    if (typeof handlers[data.name] !== "function") throw new TypeError("Unknown method " + data.name);
    return handlers[data.name](data.args || {});
  }).then(function (result) { self.postMessage({ id: data.id, result: result }); }, function (error) { self.postMessage({ id: data.id, error: { name: error && error.name, message: String(error && error.message || error) } }); });
};
