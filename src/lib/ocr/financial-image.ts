/** Local illumination compensation; retains grey antialiased strokes instead of binarizing them. */
export function flattenLighting(pixels:Uint8ClampedArray,width:number,height:number,radius=60):Uint8ClampedArray{
 const stride=width+1,sums=new Float64Array(stride*(height+1)),grey=new Uint8Array(width*height);
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){const i=(y*width+x)*4;const value=Math.round(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2]);grey[y*width+x]=value;row+=value;sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row;}}
 const output=new Uint8ClampedArray(pixels.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1);const mean=(sums[y1*stride+x1]-sums[y0*stride+x1]-sums[y1*stride+x0]+sums[y0*stride+x0])/((x1-x0)*(y1-y0));const v=Math.min(255,Math.max(0,(grey[y*width+x]-mean)*3+235)),i=(y*width+x)*4;output[i]=output[i+1]=output[i+2]=v;output[i+3]=255;}
 return output;
}
export async function prepareFinancialImage(image:Blob,kind:"summary"|"tail"):Promise<Blob>{
 const bitmap=await createImageBitmap(image);
 try{
  const [left,top,width,height]=kind==="summary"?[.18,.58,.64,.42]:[.25,.88,.5,.12];
  const sx=Math.round(bitmap.width*left),sy=Math.round(bitmap.height*top),sw=Math.round(bitmap.width*width),sh=Math.max(1,Math.floor(bitmap.height*height));
  const scale=Math.min(2,Math.sqrt(6000000/(sw*sh)));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const context=canvas.getContext("2d",{willReadFrequently:true});if(!context)throw new Error("Financial image preparation unavailable");
  context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(bitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);pixels.data.set(flattenLighting(pixels.data,canvas.width,canvas.height));context.putImageData(pixels,0,0);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Financial image preparation failed")),"image/png"));
 }finally{bitmap.close();}
}
