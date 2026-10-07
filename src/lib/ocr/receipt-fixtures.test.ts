import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
for (const [name,rows,subtotal,tax,total] of [["olive-garden",11,24727,1466,26193],["krung-thep",6,8750,525,9275],["chinatown-supermarket",15,7448,224,7672]] as const) {
  it(`independent annotation balances: ${name}`,()=>{
    const v=JSON.parse(readFileSync(new URL(`../../../tests/fixtures/receipts/${name}.expected.json`,import.meta.url),"utf8"));
    expect(v.items).toHaveLength(rows);
    expect(v.items.reduce((s:number,i:{priceCents:number})=>s+i.priceCents,0)).toBe(subtotal);
    expect([v.subtotalCents,v.taxCents,v.totalCents]).toEqual([subtotal,tax,total]);
    expect(new Set(v.items.map((i:{sourceRowId:string})=>i.sourceRowId)).size).toBe(rows);
    if(name==="krung-thep")expect(v.items.reduce((s:number,i:{quantity:number})=>s+i.quantity,0)).toBe(9);
    if(name==="chinatown-supermarket")expect(v.discountsAlreadyIncluded.reduce((a:number,b:number)=>a+b,0)).toBe(347);
  });
}
