import {test,expect} from "@playwright/test";
import {resolve} from "node:path";
import {mkdir,writeFile} from "node:fs/promises";
for(const [name,subtotal,tax,total] of [["olive-garden",24727,1466,26193],["krung-thep",8750,525,9275],["chinatown-supermarket",7448,224,7672]] as const){
 test(`actual photo financial amounts: ${name}`,async({page})=>{
  const directory=process.env.PRIVATE_RECEIPTS_DIR;test.skip(!directory,"Private original images required");
  await page.goto("/");await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles(resolve(directory!,name+".jpg"));
  await page.getByRole("button",{name:"Use this photo and recognize",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible({timeout:120000});
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")!).state.receiptDraft);
  await mkdir(".private/financial-validation",{recursive:true});await writeFile(resolve(".private/financial-validation",name+".json"),JSON.stringify(draft,null,2));
  expect([draft.printedSubtotalCents,draft.taxCents,draft.printedTotalCents]).toEqual([subtotal,tax,total]);
  await expect(page.getByLabel("Tax",{exact:true})).toHaveValue((tax/100).toFixed(2));
 });
}
