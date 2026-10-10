import { expect, it } from "vitest";
import { normalizeOcrLines } from "./normalizeLines";
it("retains line and word evidence and discards malformed coordinates",()=>{
 const bbox={x0:10,y0:20,x1:200,y1:40};
 const line={text:"Soup $8.00",confidence:91,bbox,words:[{text:"Soup",confidence:90,bbox},{text:"$8.00",confidence:92,bbox}]};
 expect(normalizeOcrLines([{paragraphs:[{lines:[line]}]}])).toEqual([line]);
 expect(normalizeOcrLines(null)).toEqual([]);
 expect(normalizeOcrLines([{paragraphs:[{lines:[{...line,bbox:{...bbox,x1:NaN}}]}]}])).toEqual([]);
});
