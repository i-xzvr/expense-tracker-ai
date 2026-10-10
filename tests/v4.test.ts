import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { validateExport,generateExport,exportFilename,type ExportRequest } from "../src/lib/v4/export";
import { v4Route } from "../src/lib/v4/routes";
import { openOperations } from "../src/lib/v4/database";
import { openJobs } from "../src/lib/v4/jobs";
import { createPortableBackup,parsePortableBackup } from "../src/lib/v4/backup";
import { emptyWorkspace } from "../src/lib/accounting/validation";
import { monthlyInsights } from "../src/lib/v4/insights";
import { deliverExport } from "../src/lib/v4/cloud";
import { CATEGORIES,EMPTY_FILTERS } from "../src/types/expense";
import { saveToSyncFolder,syncFolderStatus } from "../src/lib/v4/sync-folder";
import { readFile } from "node:fs/promises";
const request:ExportRequest={expenses:[
 {id:"a",date:"2026-10-01",amount:12.5,category:"Food",description:"Café — lunch",createdAt:1},
 {id:"b",date:"2026-10-02",amount:5.45,category:"Transportation",description:"Bus",createdAt:2}],
 scope:"all",filters:{...EMPTY_FILTERS},generatedAt:"2026-10-10T12:00:00.000Z",format:"json",filename:"October expenses",template:"Detailed expenses"};
test("V4 selected snapshot and formats preserve exact totals, text and accounting metadata",async()=>{
 const input={...request,scope:"filtered",filters:{...EMPTY_FILTERS,category:"Food"},expenses:request.expenses.map(r=>({...r,merchant:"Store",receiptId:"receipt-a"}))};
 const {request:valid,report}=validateExport({...input,unrequestedPrivateContent:"must not persist"});
 assert.equal("unrequestedPrivateContent" in valid,false);
 assert.equal(report.summary.totalCents,1250);assert.equal(report.summary.count,1);
 const file=await generateExport(valid,report),json=JSON.parse(new TextDecoder().decode(file.bytes));
 assert.equal(json.expenses[0].description,"Café — lunch");assert.equal(json.expenses[0].receiptId,"receipt-a");
 assert.equal(json.expenses[0].merchant,"Store");assert.equal(json.summary.totalCents,1250);
});
test("V4 export rejects malformed money, reversed dates and reserved/path filenames",()=>{
 for(const name of ["../x","CON","report/other","bad?name","LPT1.txt","report."])assert.throws(()=>exportFilename(name,"pdf"));
 assert.equal(exportFilename("Résumé.csv","pdf"),"Résumé.pdf");
 assert.throws(()=>validateExport({...request,expenses:[{...request.expenses[0],amount:1.005}]}));
 assert.throws(()=>validateExport({...request,scope:"filtered",filters:{...EMPTY_FILTERS,startDate:"2026-10-03",endDate:"2026-10-01"}}));
});
test("Direct PDF is valid, embeds font, paginates long reports and preserves summary snapshot",async()=>{
 const rows=Array.from({length:130},(_,i)=>({...request.expenses[0],id:"row-"+i,description:"Café expense "+i+" "+"a".repeat(75)}));
 const {request:valid,report}=validateExport({...request,expenses:rows,format:"pdf",template:"Monthly Summary"});
 const file=await generateExport(valid,report);
 assert.equal(new TextDecoder().decode(file.bytes.slice(0,5)),"%PDF-");
 const pdf=await PDFDocument.load(file.bytes);
 assert.ok(pdf.getPageCount()>3);assert.equal(report.summary.totalCents,162500);assert.match(pdf.getTitle()??"",/Monthly Summary/);
 assert.deepEqual(file.warnings,[]);
});
test("API origin/content-type/validation failures do not create export history",async()=>{
 const folder=mkdtempSync(join(tmpdir(),"v4-api-"));process.env.V4_OPERATIONS_PATH=join(folder,"operations.sqlite");
 const req=(body:unknown,origin="http://127.0.0.1:3103")=>new Request("http://127.0.0.1:3103/api/v4/export",{method:"POST",headers:{host:"127.0.0.1:3103",origin,"content-type":"application/json"},body:JSON.stringify(body)});
 assert.equal((await v4Route(req(request,"https://example.com"),["export"])).status,403);
 assert.equal((await v4Route(req({...request,filename:"../bad"}),["export"])).status,400);
 const result=await v4Route(req(request),["export"]);assert.equal(result.status,200);
 const history=await v4Route(new Request("http://127.0.0.1:3103/api/v4/history",{headers:{host:"127.0.0.1:3103"}}),["history"]);
 assert.equal((await history.json()).history.length,1);
 // Database remains open in route cache until the test process exits.
});
test("Operational metadata survives reopen; local shares expire and revoke",()=>{
 const folder=mkdtempSync(join(tmpdir(),"v4-store-")),path=join(folder,"operations.sqlite");
 let db=openOperations(path);db.record({filename:"a.csv",format:"csv",count:2,totalCents:1795,destination:"browser",status:"prepared"});
 const share=db.share(JSON.stringify(request),24),expired=db.share("expired",-1);assert.equal(db.shared(expired.id),null);db.close();
 db=openOperations(path);assert.equal(db.history()[0].totalCents,1795);assert.ok(db.shared(share.id));db.revokeShare(share.id);assert.equal(db.shared(share.id),null);
 const schedule={id:"schedule",name:"Captured",enabled:true,intervalHours:168,nextAt:1,destination:"onedrive-sync",snapshot:JSON.stringify(request)};
 db.saveSchedule(schedule);db.removeSchedule(schedule.id);assert.equal(db.finishSchedule({...schedule,nextAt:2}),false);assert.equal(db.schedules().length,0);
 db.close();rmSync(folder,{recursive:true});
});
test("Jobs deduplicate requests, cancel queued tasks and fail interrupted runs after restart",()=>{
 const folder=mkdtempSync(join(tmpdir(),"v4-jobs-")),path=join(folder,"jobs.sqlite");let db=openJobs(path);
 const j=db.create("Review export","review","request-a");assert.equal(db.create("Review export","review","request-a").id,j.id);
 assert.throws(()=>db.create("Different task","review","request-a"));assert.equal(db.claim()?.state,"running");
 db.event(j.id,"Started");assert.equal(db.events(j.id).length,1);assert.equal(db.events(j.id,1).length,0);
 db.close();db=openJobs(path);db.recover();assert.equal(db.get(j.id)?.state,"failed");
 const q=db.create("Queued","review","request-b");assert.equal(db.cancel(q.id)?.state,"cancelled");assert.equal(db.claim(),null);
 db.close();rmSync(folder,{recursive:true});
});
test("Combined portability validates both stores without mutating originals",()=>{
 const workspace={...emptyWorkspace(),expenses:request.expenses};
 const chats={schema:1,conversations:[{id:"chat",mode:"general",title:"Test",draft:"",updatedAt:1,messages:[]}]};
 const restored=parsePortableBackup(createPortableBackup(workspace,JSON.stringify(chats)));
 assert.equal(restored.workspace.expenses.length,2);assert.equal(restored.chats.conversations.length,1);
 restored.workspace.expenses[0].amount=99;assert.equal(workspace.expenses[0].amount,12.5);
 assert.throws(()=>parsePortableBackup(JSON.stringify({...restored,chats:{schema:1,conversations:[{}]}})));
});
test("Budget streak stays unknown until records are closed and every category has a budget",()=>{
 const w={...emptyWorkspace(),expenses:request.expenses};
 assert.equal(monthlyInsights(w,"2026-10").streak,null);
 w.closedMonths=["2026-10"];w.budgets=CATEGORIES.map(category=>({month:"2026-10",category,amountCents:3100}));
 const insight=monthlyInsights(w,"2026-10");assert.equal(insight.totalCents,1795);assert.equal(insight.streak,30);assert.equal(insight.top[0].category,"Food");
});
test("Cloud adapters require provider confirmation, use RAW cells, and reject unsafe targets",async()=>{
 const calls:{url:string;body:unknown}[]=[];
 const fake:typeof fetch=async(url,init)=>{calls.push({url:String(url),body:init?.body});return Response.json(calls.length===1?{replies:[{}]}:{updatedRows:3});};
 const result=await deliverExport(request,"sheets","testSpreadsheetID",fake,"test-token");
 assert.equal(result.provider,"sheets");assert.match(calls[1].url,/valueInputOption=RAW/);
 assert.equal(JSON.parse(calls[1].body as string).values.length,3);
 await assert.rejects(()=>deliverExport(request,"onedrive","../unsafe",fake,"test-token"));
 const rejected:typeof fetch=async()=>Response.json({},{status:401});
 await assert.rejects(()=>deliverExport(request,"onedrive","Expense Exports",rejected,"test-token"));
});
test("OneDrive sync copies verify bytes, preserve earlier files and reject path injection",async()=>{
 const folder=mkdtempSync(join(tmpdir(),"v4-sync-"));const prior=process.env.V4_ONEDRIVE_ROOT;process.env.V4_ONEDRIVE_ROOT=folder;
 try {
  assert.equal((await syncFolderStatus()).available,true);
  const bytes=new TextEncoder().encode("Synthetic report only");
  const a=await saveToSyncFolder(bytes,"report.json","Reports"),b=await saveToSyncFolder(bytes,"report.json","Reports");
  assert.notEqual(a.path,b.path);assert.equal(a.cloudConfirmed,false);assert.equal(a.status,"queued-for-sync");
  assert.deepEqual(new Uint8Array(await readFile(a.path)),bytes);
  await assert.rejects(()=>saveToSyncFolder(bytes,"../bad.json","Reports"));
 } finally {if(prior===undefined)delete process.env.V4_ONEDRIVE_ROOT;else process.env.V4_ONEDRIVE_ROOT=prior;rmSync(folder,{recursive:true});}
});
