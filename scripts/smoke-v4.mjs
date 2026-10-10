// Read-only ledger checks plus one clearly named synthetic export-history row.
// No cloud delivery, browser ledger writes, or paid Claude execution.
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
const base="http://127.0.0.1:3103";
async function json(path) {
  const response=await fetch(base+path,{signal:AbortSignal.timeout(15_000)});
  assert.equal(response.status,200,path);
  return response.json();
}
assert.equal((await fetch(base,{signal:AbortSignal.timeout(15_000)})).status,200);
const ai=await json("/api/ai/status");
const service=await json("/api/agent/health");
assert.equal(service.ready,true);assert.equal(service.worker,true);
await json("/api/chats");await json("/api/v4/integrations");
const exportRequest={expenses:[{id:"v4-installation-smoke",date:"2026-01-01",amount:12.5,category:"Food",description:"Synthetic installation test",createdAt:1}],scope:"all",filters:{search:"",category:"All",startDate:"",endDate:""},generatedAt:new Date().toISOString(),format:"pdf",filename:"V4 installation smoke - synthetic",template:"Detailed expenses"};
const response=await fetch(base+"/api/v4/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(exportRequest),signal:AbortSignal.timeout(30_000)});
assert.equal(response.status,200,"Direct PDF generation");
assert.ok(response.headers.get("content-type")?.includes("application/pdf"));
const bytes=new Uint8Array(await response.arrayBuffer());
assert.equal(new TextDecoder().decode(bytes.slice(0,5)),"%PDF-");
assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);
const history=await json("/api/v4/history");
assert.ok(history.history.some(row=>row.id===response.headers.get("x-export-id")&&row.totalCents===1250));
console.log(JSON.stringify({app:true,service:true,directPdf:true,pdfBytes:bytes.length,localAIReady:ai.modelReady,agentConnected:service.agent,synthetic:true}));
