import {expect,it} from "vitest";
import {flattenLighting} from "./financial-image";
it("removes a smooth lighting gradient while retaining dark digit strokes",()=>{
 const w=80,h=24,p=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=100+x;const i=(y*w+x)*4;p[i]=p[i+1]=p[i+2]=x>=35&&x<40&&y>=5&&y<19?v-65:v;p[i+3]=255;}
 const out=flattenLighting(p,w,h,12);
 expect(out[(12*w+37)*4]).toBeLessThan(110);
 expect(Math.abs(out[(12*w+10)*4]-out[(12*w+65)*4])).toBeLessThan(12);
 expect(out[3]).toBe(255);
});
