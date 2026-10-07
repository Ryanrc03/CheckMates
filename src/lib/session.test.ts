import { expect, it } from "vitest";
import { migrateSession, restoreSession, availableStep } from "./session";
import { createBillStore } from "@/store/useBillStore";
import { createMockBill } from "./receipt";
const legacy = () => ({version:1,state:{bill:{items:[{id:"x",name:"Wings",priceCents:1200,personIds:["a","b"]}],people:[{id:"a",name:"A"},{id:"b",name:"B"}],taxCents:0,tipCents:0},step:"result",source:"demo",fileName:null,receiptDraft:null,receiptConfirmed:true,receiptEdit:{items:[{id:"x",name:"Wings",price:"12.",personIds:["a","b"]}],tax:"0",chargedTip:"0",addedTip:"0",note:""}}});
it("migrates v1 equal allocations and unfinished receipt input", () => {
  const migrated = migrateSession(legacy());
  expect(migrated?.bill.items[0].allocation).toEqual({mode:"equal",personIds:["a","b"]});
  expect(migrated?.receiptEdit?.items[0].price).toBe("12."); expect(migrated?.step).toBe("result");
  expect(migrateSession({version:99,state:legacy().state})).toBeNull();
});
it("restores unfinished quantities without discarding the bill", () => {
  const s = migrateSession(legacy())!;
  s.bill.items[0].allocation = {mode:"quantity",totalUnits:6,unitLabel:"pieces",shares:[{personId:"a",units:2},{personId:"b",units:3}]};
  expect(restoreSession(s)?.step).toBe("split");
  s.allocationEdits = {x:{mode:"quantity",totalUnits:"",unitLabel:"pieces",entries:[{personId:"a",value:"2"}]}};
  expect(restoreSession(s)?.allocationEdits?.x.totalUnits).toBe(""); expect(availableStep(s,"result")).toBe("split");
});
it("removes deleted people from shares and pending inputs without renormalizing quantities", async () => {
  const data=new Map<string,string>(); const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
  const store=createBillStore(storage); await store.getState().hydrate(); store.getState().startBill("demo");
  store.getState().confirmReceipt(createMockBill()); store.getState().addPerson("A");store.getState().addPerson("B");
  const s=store.getState();const [a,b]=s.bill.people; const item=s.bill.items[0];
  s.applyAllocation(item.id,{mode:"quantity",totalUnits:6,unitLabel:"pieces",shares:[{personId:a.id,units:2},{personId:b.id,units:4}]});
  s.saveAllocationEdit(item.id,{mode:"quantity",totalUnits:"6",unitLabel:"pieces",entries:[{personId:a.id,value:"2"},{personId:b.id,value:"4"}]});
  s.removePerson(b.id);expect(store.getState().bill.items[0].allocation).toEqual({mode:"quantity",totalUnits:6,unitLabel:"pieces",shares:[{personId:a.id,units:2}]});
  expect(store.getState().allocationEdits?.[item.id].entries).toEqual([{personId:a.id,value:"2"}]);
  const next=createBillStore(storage);await next.getState().hydrate();expect(next.getState().bill.items[0].allocation).toEqual(store.getState().bill.items[0].allocation);
});
it("clears pending allocations for items removed in the receipt editor",async()=>{
 const store=createBillStore({getItem:()=>null,setItem:()=>{},removeItem:()=>{}});await store.getState().hydrate();store.getState().startBill("demo");
 store.getState().addPerson("A");const state=store.getState();const id=state.bill.items[0].id;
 state.saveAllocationEdit(id,{mode:"ratio",totalUnits:"",unitLabel:"pieces",entries:[{personId:state.bill.people[0].id,value:"1"}]});
 state.confirmReceipt({...state.bill,items:state.bill.items.slice(1)});
 expect(store.getState().allocationEdits).toEqual({});
});
