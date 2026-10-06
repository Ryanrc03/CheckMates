export type Bbox = { x0:number; y0:number; x1:number; y1:number };
export type OcrLine = { text:string; confidence:number; bbox:Bbox; words:{text:string;confidence:number;bbox:Bbox}[] };
export type OcrEvidence = {text:string;confidence:number;lines?:OcrLine[];
 alternate?: {text:string;confidence:number;lines?:OcrLine[]}; enhancementError?:string};
