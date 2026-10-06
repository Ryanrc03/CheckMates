import { expect, it } from "vitest";
import { createBrowserWorker } from "./worker";
it("requests layout evidence and initializes only once across scans", async () => {
  const actions:string[]=[];const outputs:unknown[]=[];
  const bbox={x0:0,y0:0,x1:100,y1:20};
  const transport={onmessage:null as ((e:MessageEvent)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,
    postMessage(message:unknown){const p=message as {action:string;jobId:string;payload:{output?:unknown}};actions.push(p.action);if(p.action==="recognize")outputs.push(p.payload.output);queueMicrotask(()=>transport.onmessage?.({data:{jobId:p.jobId,status:"resolve",data:p.action==="recognize"?{text:"Soup $8.00",confidence:90,blocks:[{paragraphs:[{lines:[{text:"Soup $8.00",confidence:90,bbox,words:[]}]}]}]}:{}}} as MessageEvent));},terminate(){}};
  const w=createBrowserWorker(()=>{},transport,"http://localhost");
  expect((await w.recognize(new Blob())).data.lines?.[0].text).toBe("Soup $8.00");
  await w.recognize(new Blob(),{pageSegMode:4});
  expect(actions.filter(a=>a==="initialize")).toHaveLength(1);
  expect(outputs).toEqual([{text:true,blocks:true},{text:true,blocks:true}]);await w.terminate();
});
it("rejects model initialization failures and terminates the owned worker", async () => {
  let stopped = false;
  const transport = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage(message: unknown) { const packet = message as { action: string; jobId: string }; queueMicrotask(() => transport.onmessage?.({ data: { ...packet, status: packet.action === "loadLanguage" ? "reject" : "resolve", data: packet.action === "loadLanguage" ? "model unavailable" : {} } } as MessageEvent)); },
    terminate() { stopped = true; } };
  const worker = createBrowserWorker(() => {}, transport, "http://localhost:3100");
  await expect(worker.recognize(new Blob())).rejects.toThrow("model unavailable"); await worker.terminate(); expect(stopped).toBe(true);
});
it("termination interrupts resource initialization without waiting for a late result", async () => {
  const transport = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
  const worker = createBrowserWorker(() => {}, transport, "http://localhost:3100"); const recognition = worker.recognize(new Blob()); const rejected = expect(recognition).rejects.toMatchObject({ name: "AbortError" }); await worker.terminate(); await rejected;
});
