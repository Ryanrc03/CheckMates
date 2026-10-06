import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {parseReceiptText} from "../../src/lib/ocr/parseReceipt";
import {parseReceiptEvidence} from "../../src/lib/ocr/retry";
async function draft(page:Page,text:string,alternate?:string){
 const state={bill:{items:[],people:[],taxCents:0,tipCents:0},step:"receipt",source:"photo",fileName:"private.jpg",receiptDraft:alternate?parseReceiptEvidence({text,confidence:85,alternate:{text:alternate,confidence:85}}):parseReceiptText(text),receiptConfirmed:false,addedTipCents:0,reviewNote:"",receiptEdit:null,allocationEdits:{}};
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

test("unassigned whole-bill discount requires manual correction and survives refresh",async({page},info)=>{
 await draft(page,"Soup $10.00\nTea $5.00\nSubtotal $15.00\nCoupon -$3.00\nTax $0.00\nTotal $12.00");
 await expect(page.getByRole("button",{name:"Subtract listed discount"})).toHaveCount(0);
 await page.getByLabel("I checked the photo, amounts, and all review notes.").check();
 await page.getByLabel("Reason for the difference").fill("Whole-bill coupon must be allocated manually.");
 await page.getByRole("button",{name:"Add friends"}).click();await expect(page.getByText("Correct the item totals and review the unassigned discounts.",{exact:true})).toBeVisible();
 await page.getByLabel("Price for Soup",{exact:true}).fill("8.00");await page.getByLabel("Price for Tea",{exact:true}).fill("4.00");
 await page.getByLabel("I corrected the item totals for these unassigned discounts.").check();
 await page.reload();await expect(page.getByLabel("I corrected the item totals for these unassigned discounts.")).toBeChecked();
 await page.screenshot({path:info.outputPath("discount-review-375.png"),fullPage:true});
 await page.getByLabel("I checked the photo, amounts, and all review notes.").check();await page.getByRole("button",{name:"Add friends"}).click();
 await expect(page.getByRole("heading",{name:"Who's in?"})).toBeVisible();await page.reload();await expect(page.getByRole("heading",{name:"Who's in?"})).toBeVisible();
});
test("discount choice cannot revive a conflicted printed price",async({page})=>{
 await draft(page,"Soup $10.00\nDisc. -$1.00\nSubtotal $9.00\nTax $0.00\nTotal $9.00","Soup $12.00\nDisc. -$1.00\nSubtotal $11.00\nTax $0.00\nTotal $11.00");
 await page.getByRole("button",{name:"Subtract listed discount",exact:true}).click();await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("");
 await page.getByLabel("Price for Soup",{exact:true}).fill("12.00");await page.getByRole("button",{name:"Subtract listed discount",exact:true}).click();
 await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("11.00");await page.reload();await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("11.00");
});
