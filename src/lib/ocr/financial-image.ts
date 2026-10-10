import type {OcrEvidence} from "@/types/ocr";
/** Estimate the baseline from words that OCR grouped into the same printed row. */
export function receiptSkew(evidence?:OcrEvidence):number{
 const slopes:number[]=[];
 for(const line of evidence?.lines??[]){
  const words=line.words.filter(w=>w.confidence>=75).sort((a,b)=>a.bbox.x0-b.bbox.x0);
  const first=words.find(w=>/^[a-z]{2,}/i.test(w.text));
  const last=words.filter(w=>/^\$?\d+\.\d{2}$/.test(w.text)).at(-1);if(!first||!last)continue;
  const dx=(last.bbox.x0+last.bbox.x1-first.bbox.x0-first.bbox.x1)/2;
  if(dx<200)continue;
  const slope=(last.bbox.y0+last.bbox.y1-first.bbox.y0-first.bbox.y1)/(2*dx);
  if(Math.abs(slope)<.2)slopes.push(slope);
 }
 slopes.sort((a,b)=>a-b);const angle=slopes.length>=3?Math.atan(slopes[Math.floor(slopes.length/2)]):0;
 return Math.abs(angle)>.03?angle:0;
}
/** Local illumination compensation; retains grey antialiased strokes instead of binarizing them. */
export function flattenLighting(pixels:Uint8ClampedArray,width:number,height:number,radius=60):Uint8ClampedArray{
 const stride=width+1,sums=new Float64Array(stride*(height+1)),grey=new Uint8Array(width*height);
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){const i=(y*width+x)*4;const value=Math.round(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2]);grey[y*width+x]=value;row+=value;sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row;}}
 const output=new Uint8ClampedArray(pixels.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1);const mean=(sums[y1*stride+x1]-sums[y0*stride+x1]-sums[y1*stride+x0]+sums[y0*stride+x0])/((x1-x0)*(y1-y0));const v=Math.min(255,Math.max(0,(grey[y*width+x]-mean)*3+235)),i=(y*width+x)*4;output[i]=output[i+1]=output[i+2]=v;output[i+3]=255;}
 return output;
}
export async function prepareFinancialImage(image:Blob,kind:"summary"|"tail",evidence?:OcrEvidence):Promise<Blob>{
 const bitmap=await createImageBitmap(image);
 try{
  // A corrected receipt can touch either edge. Keep the entire price column.
  const angle=receiptSkew(evidence),cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
  const rotatedWidth=Math.ceil(bitmap.width*cos+bitmap.height*sin),rotatedHeight=Math.ceil(bitmap.height*cos+bitmap.width*sin);
  const top=kind==="summary"?.58:angle===0?.88:.80;
  let sx=0,sw=rotatedWidth;
  if(kind==="tail"&&angle===0){
   const labels=(evidence?.lines??[]).flatMap(l=>l.words).filter(w=>w.confidence>=75&&/^(?:subtotal|tax|taxes|total)$/i.test(w.text));
   const prices=(evidence?.lines??[]).flatMap(l=>l.words).filter(w=>w.confidence>=75&&/^\$?\d+\.\d{2}$/.test(w.text));
   if(labels.length>=2&&prices.length>=3){
    sx=Math.max(0,Math.floor(Math.min(...labels.map(w=>w.bbox.x0))-bitmap.width*.1));
    const right=Math.min(rotatedWidth,Math.ceil(Math.max(...prices.map(w=>w.bbox.x1))+bitmap.width*.1));
    sw=right-sx;
   }
  }
  const sy=Math.floor(rotatedHeight*top),sh=rotatedHeight-sy;
  const scale=Math.min(2,Math.sqrt(6000000/(sw*sh)));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Financial image preparation unavailable");
  context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);
  context.scale(scale,scale);context.translate(-sx,-sy);
  context.translate(rotatedWidth/2,rotatedHeight/2);context.rotate(-angle);context.translate(-bitmap.width/2,-bitmap.height/2);
  context.drawImage(bitmap,0,0);context.resetTransform();
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);pixels.data.set(flattenLighting(pixels.data,canvas.width,canvas.height));context.putImageData(pixels,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Financial image preparation failed")),"image/png"));
 }finally{bitmap.close();}
}
