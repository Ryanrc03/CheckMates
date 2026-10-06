import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {parseReceiptText} from "../../src/lib/ocr/parseReceipt";
async function draft(page:Page,text:string){
 const state={bill:{items:[],people:[],taxCents:0,tipCents:0},step:"receipt",source:"photo",fileName:"private.jpg",receiptDraft:parseReceiptText(text),receiptConfirmed:false,addedTipCents:0,reviewNote:"",receiptEdit:null,allocationEdits:{}};
 await page.addInitScript(({state})=>{if(!localStorage.getItem("bitesplit-session"))localStorage.setItem("bitesplit-session",JSON.stringify({version:2,state}));},{state});
 await page.goto("/");await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible();
}
test("structured grocery review keeps included discounts and net totals",async({page})=>{
 const text=readFileSync("tests/fixtures/receipts/chinatown-supermarket.transcription.txt","utf8");await draft(page,text);
 await expect(page.getByText("Discount already included",{exact:true}).first()).toBeVisible();
 await expect(page.getByText("$74.48",{exact:true}).first()).toBeVisible();
 await page.getByLabel("Price for RED BULL BLUE EXTRA",{exact:true}).first().fill("3.50");
 await page.reload();await expect(page.getByLabel("Price for RED BULL BLUE EXTRA",{exact:true}).first()).toHaveValue("3.50");
 await page.getByRole("button",{name:"Add friends"}).click();await expect(page.getByRole("heading",{name:"Who's in?"})).toBeVisible();
});
test("unresolved discounts require a choice and subtraction is never applied twice",async({page})=>{
 await draft(page,"Soup $10.00\nDisc. -$1.00\nTax $0.00");
 await page.getByRole("button",{name:"Add friends"}).click();await expect(page.getByRole("heading",{name:"Check the receipt"})).toBeVisible();
 await expect(page.getByText("Resolve the discount for Soup before continuing.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Subtract listed discount",exact:true}).click();await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("9.00");
 await page.getByRole("button",{name:"Subtract listed discount",exact:true}).click();await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("9.00");
 await page.reload();await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("9.00");
 await page.getByRole("checkbox").check();await page.getByRole("button",{name:"Add friends"}).click();await expect(page.getByRole("heading",{name:"Who's in?"})).toBeVisible();
});
