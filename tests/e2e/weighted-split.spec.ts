import { test, expect, type Page } from "@playwright/test";
async function setup(page:Page,tax="0",tip="0"){
 await page.goto("/");await page.getByRole("button",{name:"Try a sample bill"}).click();
 await page.getByRole("button",{name:"Remove Fries",exact:true}).click();await page.getByRole("button",{name:"Remove Lemonade",exact:true}).click();
 await page.getByLabel("Item 1 name",{exact:true}).fill("Wings");await page.getByLabel("Price for Wings",{exact:true}).fill("12.00");
 await page.getByLabel("Tax",{exact:true}).fill(tax);await page.getByLabel("Added tip").fill(tip);
 await page.getByRole("button",{name:"Add friends"}).click();
 for(const name of ["A","B","C","D"]){await page.getByLabel("Friend's name").fill(name);await page.getByLabel("Friend's name").press("Enter");}
 await page.getByRole("button",{name:"Assign items"}).click();
}
async function quantity(page:Page,counts=["2","2","1","1"]){
 const group=page.getByRole("group",{name:"Assign Wings"});await group.getByLabel("Split method").selectOption("quantity");
 await group.getByLabel("Total units").fill("6");
 for(const [i,name] of ["A","B","C","D"].entries())await group.getByLabel(`Units for ${name}`,{exact:true}).fill(counts[i]);
 return group;
}
test("quantity previews exact shares and fee totals",async({page})=>{
 await setup(page,"1.20","2.40");const group=await quantity(page);await expect(group.getByText("A: 2/6 pieces · $4.00",{exact:true})).toBeVisible();
 await group.getByRole("button",{name:"Apply shares"}).click();await page.getByRole("button",{name:"See the split"}).click();
 for(const [i,name] of ["A","B","C","D"].entries())await expect(page.getByTestId(`share-${name}`).locator("summary")).toContainText(i<2?"$5.20":"$2.60");
 await expect(page.getByTestId("bill-total")).toContainText("$15.60");await page.reload();await expect(page.getByTestId("share-A").locator("summary")).toContainText("$5.20");
});
test("incomplete overallocated and pending quantities block results",async({page})=>{
 await setup(page);const group=await quantity(page,["2","2","1","0"]);await expect(group.getByText(/Assigned 5 of 6/)).toBeVisible();
 await page.getByRole("button",{name:"See the split"}).click();await expect(page.getByRole("heading",{name:"Who had what?"})).toBeVisible();
 await group.getByLabel("Units for D",{exact:true}).fill("2");await expect(group.getByText(/Assigned 7 of 6/)).toBeVisible();
 await group.getByLabel("Units for D",{exact:true}).fill("1");await page.getByRole("button",{name:"See the split"}).click();await expect(page.locator("main").getByRole("alert")).toContainText("Apply the pending shares");
 await page.reload();await expect(group.getByLabel("Total units")).toHaveValue("6");await group.getByRole("button",{name:"Apply shares"}).click();
 await page.getByRole("button",{name:"See the split"}).click();await expect(page.getByTestId("bill-total")).toContainText("$12.00");
});
test("receipt edits preserve quantities and exact weighted pennies",async({page})=>{
 await setup(page);const group=await quantity(page);await group.getByRole("button",{name:"Apply shares"}).click();
 await page.getByRole("button",{name:"Back to friends"}).click();await page.getByRole("button",{name:"Back to receipt"}).click();
 await page.getByLabel("Price for Wings",{exact:true}).fill("10.01");await page.getByRole("button",{name:"Add friends"}).click();await page.getByRole("button",{name:"Assign items"}).click();
 await expect(group.getByLabel("Total units")).toHaveValue("6");await page.getByRole("button",{name:"See the split"}).click();
 for(const [i,name] of ["A","B","C","D"].entries())await expect(page.getByTestId(`share-${name}`).locator("summary")).toContainText(["$3.34","$3.33","$1.67","$1.67"][i]);
});
for(const width of [375,1280])test(`ratio keyboard and layout at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:900});await setup(page);const group=page.getByRole("group",{name:"Assign Wings"});
 await group.getByLabel("Split method").selectOption("ratio");for(const [i,name] of ["A","B","C","D"].entries())await group.getByLabel(`Weight for ${name}`,{exact:true}).fill(i<2?"2":"1");
 await group.getByRole("button",{name:"Apply shares"}).focus();await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`weighted-${width}.png`),fullPage:true});await page.getByRole("button",{name:"See the split"}).click();await expect(page.getByTestId("share-A").locator("summary")).toContainText("$4.00");
});
