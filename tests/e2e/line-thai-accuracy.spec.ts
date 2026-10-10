import {test,expect} from "@playwright/test";
import {mkdir,writeFile} from "node:fs/promises";
for(const original of [false,true])test(`Line Thai ${original?"uncorrected":"default correction"}: exact six charged rows and all financial amounts without edits`,async({page})=>{
 await page.goto("/");await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles("tests/fixtures/receipts/line-thai-cafe-2026-09-05-redacted.png");
 if(original)await page.getByRole("button",{name:"Use original photo",exact:true}).click();
 await page.getByRole("button",{name:"Use this photo and recognize",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible({timeout:120000});
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")!).state.receiptDraft);
 await mkdir(".private/line-thai",{recursive:true});await writeFile(`.private/line-thai/browser-${original?"original":"corrected"}.json`,JSON.stringify(draft,null,2));
 expect(draft.items.map((i:{priceCents:number|null})=>i.priceCents)).toEqual([1390,790,400,2580,1290,800]);
 expect([draft.printedSubtotalCents,draft.taxCents,draft.printedTotalCents]).toEqual([7250,598,7848]);
 expect(draft.items[5].details.quantity).toBe(2);
 expect(draft.items[5].details.unitPriceCents).toBe(400);
 await expect(page.getByLabel("Tax",{exact:true})).toHaveValue("5.98");
});
