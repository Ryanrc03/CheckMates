import {test,expect,type Page} from "@playwright/test";
async function expectFresh(page:Page){
 await expect(page.getByRole("button",{name:"Try a sample bill"})).toBeVisible();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("bitesplit-session")!).state);
 expect(state).toMatchObject({step:"home",source:null,fileName:null,bill:{items:[],people:[],taxCents:0,tipCents:0},receiptDraft:null,receiptEdit:null,allocationEdits:{},receiptConfirmed:false,addedTipCents:0,reviewNote:""});
}
for(const width of [375,1280])test(`header reset clears saved bill and pending edits at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.goto("/");
 await page.getByRole("button",{name:"Try a sample bill"}).click();await page.getByLabel("Price for Burger").fill("99.99");await page.getByLabel("Added tip").fill("3.00");
 await page.getByRole("button",{name:"Add friends"}).click();await page.getByLabel("Friend's name").fill("Old friend");await page.getByLabel("Friend's name").press("Enter");
 await page.getByRole("button",{name:"Assign items"}).click();const group=page.getByRole("group",{name:"Assign Burger"});await group.getByLabel("Split method").selectOption("quantity");await group.getByLabel("Total units").fill("6");
 const reset=page.getByRole("button",{name:"Reset bill",exact:true});await expect(reset).toBeVisible({timeout:2000});await reset.focus();await page.keyboard.press("Enter");await expectFresh(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`reset-${width}.png`),fullPage:true});
 await page.reload();await expectFresh(page);
 await page.getByRole("button",{name:"Try a sample bill"}).click();await expect(page.getByLabel("Price for Burger")).toHaveValue("14.95");
 await page.getByRole("button",{name:"Add friends"}).click();await expect(page.getByRole("button",{name:"Remove Old friend",exact:true})).toHaveCount(0);
});
test("reset cancels a pending photo scan and the next receipt starts fresh",async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let first=true;
 await page.route("**/ocr/worker.min.js",async route=>{if(first){first=false;await gate;}await route.continue().catch(()=>{});});
 await page.goto("/");await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles("tests/fixtures/receipts/clear-diner.png");
 await page.getByRole("button",{name:"Use this photo and recognize",exact:true}).click();await expect(page.getByRole("button",{name:"Cancel recognition",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Reset bill",exact:true}).click();await expectFresh(page);release();
 await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles("tests/fixtures/receipts/clear-cafe.png");await page.getByRole("button",{name:"Use this photo and recognize",exact:true}).click();
 await expect(page.getByLabel("Price for Soup",{exact:true})).toHaveValue("8.25",{timeout:120000});await expect(page.getByLabel("Price for Burger",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Reset bill",exact:true}).click();await page.reload();await expectFresh(page);
});
test("reset is available during photo adjustment",async({page})=>{
 await page.goto("/");await page.getByLabel("Upload a receipt",{exact:true}).setInputFiles("tests/fixtures/receipts/clear-diner.png");
 await expect(page.getByRole("heading",{name:"Adjust your photo"})).toBeVisible();await page.getByRole("button",{name:"Reset bill",exact:true}).click();
 await expectFresh(page);await expect(page.getByRole("heading",{name:"Adjust your photo"})).toHaveCount(0);
});
