import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
const directory=process.env.PRIVATE_RECEIPTS_DIR;
for(const name of ["olive-garden","krung-thep","chinatown-supermarket"]) test(`private receipt measurement: ${name}`,async({page})=>{
 test.skip(!directory,"Private source images not supplied");
 await page.goto("/"); const start=Date.now();
 await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles(resolve(directory!,name+".jpg"));
 await expect(page.getByRole("heading",{name:"Adjust your photo"})).toBeVisible();
 if(process.env.MEASURE_ORIGINAL==="1")await page.getByRole("button",{name:"Use original photo",exact:true}).click();
 await page.getByRole("button",{name:"Use this photo"}).click();
 await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible({timeout:120000});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")??"null"));
 if(process.env.RECEIPT_MEASUREMENT_PHASE==="upgrade")expect(saved.state.receiptDraft.items.some((item:{details?:{bbox?:unknown}})=>item.details?.bbox)).toBe(true);
 const output=resolve(".private/receipt-upgrade/2026-10-06");
 await mkdir(output,{recursive:true});
 const phase=process.env.RECEIPT_MEASUREMENT_PHASE??"baseline";
 await writeFile(resolve(output,`${name}.browser-${phase}.json`),JSON.stringify({name,phase,ms:Date.now()-start,adjustment:process.env.MEASURE_ORIGINAL==="1"?"original photo, no correction":"default proposed correction, user accepted",session:saved},null,2));
 if(process.env.MEASURE_ENHANCED==="1"){
  page.on("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Enhanced scan",exact:true}).click();
  const enhancedStart=Date.now();await page.getByRole("button",{name:"Use this photo and recognize",exact:true}).click();
  await expect(page.getByRole("button",{name:"Cancel recognition",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Cancel recognition",exact:true})).toHaveCount(0,{timeout:120000});
  const enhanced=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")??"null"));
  expect(enhanced.state.receiptDraft.alternateRawText).toBeTruthy();
  await writeFile(resolve(output,`${name}.browser-enhanced.json`),JSON.stringify({name,phase:"enhanced",ms:Date.now()-enhancedStart,adjustment:"same accepted correction, user-requested enhanced candidate",session:enhanced},null,2));
 }
});
