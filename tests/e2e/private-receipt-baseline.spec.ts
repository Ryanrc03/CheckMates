import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
const directory=process.env.PRIVATE_RECEIPTS_DIR;
for(const name of ["olive-garden","krung-thep","chinatown-supermarket"]) test(`private receipt measurement: ${name}`,async({page})=>{
 test.skip(!directory,"Private source images not supplied");
 await page.goto("/"); const start=Date.now();
 await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles(resolve(directory!,name+".jpg"));
 await expect(page.getByRole("heading",{name:"Adjust your photo"})).toBeVisible();
 await page.getByRole("button",{name:"Use this photo"}).click();
 await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible({timeout:120000});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")??"null"));
 const output=resolve(".private/receipt-upgrade/2026-10-06");
 await mkdir(output,{recursive:true});
 const phase=process.env.RECEIPT_MEASUREMENT_PHASE??"baseline";
 await writeFile(resolve(output,`${name}.browser-${phase}.json`),JSON.stringify({name,phase,ms:Date.now()-start,adjustment:"default proposed correction, user accepted",session:saved},null,2));
});
