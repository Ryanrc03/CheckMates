import {expect,it} from "vitest";
import {flattenLighting,receiptSkew} from "./financial-image";
it("estimates receipt tilt from several long printed rows and ignores short or implausible rows",()=>{
 const word=(x:number,y:number)=>({text:x===0?"Dish":"$10.00",confidence:90,bbox:{x0:x,y0:y,x1:x+30,y1:y+20}});
 const lines=[0,40,80].map(y=>({text:"Dish $10.00",confidence:90,bbox:{x0:0,y0:y,x1:430,y1:y+52},words:[word(0,y),word(400,y+32)]}));
 expect(receiptSkew({text:"",confidence:90,lines})).toBeCloseTo(Math.atan(.08));
 expect(receiptSkew({text:"",confidence:90,lines:lines.slice(0,2)})).toBe(0);
});
it("removes a smooth lighting gradient while retaining dark digit strokes",()=>{
 const w=80,h=24,p=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=100+x;const i=(y*w+x)*4;p[i]=p[i+1]=p[i+2]=x>=35&&x<40&&y>=5&&y<19?v-65:v;p[i+3]=255;}
 const out=flattenLighting(p,w,h,12);
 expect(out[(12*w+37)*4]).toBeLessThan(110);
 expect(Math.abs(out[(12*w+10)*4]-out[(12*w+65)*4])).toBeLessThan(12);
 expect(out[3]).toBe(255);
});
