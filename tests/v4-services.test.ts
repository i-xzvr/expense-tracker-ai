import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
import { openOperations } from "../src/lib/v4/database";
import { EMPTY_FILTERS } from "../src/types/expense";

test("Real scheduling service protects its API, copies due snapshots and survives damaged schedules",{timeout:40_000},async()=>{
  const root=resolve("work/v4-service-tests",randomUUID());mkdirSync(join(root,"data/v4-backup-snapshots"),{recursive:true});mkdirSync(join(root,"sync-root"));
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,"127.0.0.1",r));const port=(probe.address() as {port:number}).port;await new Promise<void>(r=>probe.close(()=>r()));
  const token=randomUUID()+randomUUID(),tokenPath=join(root,"token");writeFileSync(tokenPath,token);
  const dbPath=join(root,"operations.sqlite"),captureId=randomUUID();writeFileSync(join(root,"data/v4-backup-snapshots",captureId+".json"),'synthetic captured backup');
  const request={expenses:[{id:"scheduled-synthetic",date:"2026-10-01",amount:12.5,category:"Food",description:"Synthetic scheduled export",createdAt:1}],scope:"all",filters:EMPTY_FILTERS,generatedAt:new Date().toISOString(),format:"json",filename:"scheduled-report",template:"Detailed expenses"};
  const db=openOperations(dbPath);
  for(const [id,destination,snapshot] of [["local","local-backup",JSON.stringify({file:captureId})],["sync",JSON.stringify({provider:"onedrive-sync",target:""}),JSON.stringify(request)],["damaged","malformed destination","broken snapshot"]])db.saveSchedule({id,name:id,enabled:true,intervalHours:168,nextAt:0,destination,snapshot});
  db.close();
  const child=spawn(process.execPath,["--import","tsx","scripts/v4/services.ts"],{cwd:process.cwd(),windowsHide:true,stdio:["ignore","pipe","pipe"],env:{...process.env,V4_REPOSITORY:root,V4_SERVICES_PORT:String(port),V4_SERVICES_TOKEN_PATH:tokenPath,V4_OPERATIONS_PATH:dbPath,V4_JOBS_PATH:join(root,"jobs.sqlite"),V4_ONEDRIVE_ROOT:join(root,"sync-root"),V4_CLAUDE_EXE:""}});
  let logs="";child.stdout.on("data",b=>logs+=String(b));child.stderr.on("data",b=>logs+=String(b));
  const exited=new Promise<void>(r=>child.once("close",()=>r()));
  const base="http://127.0.0.1:"+port,headers={Authorization:"Bearer "+token};
  try {
    const deadline=Date.now()+10_000;
    while(!logs.includes("V4 services listening")){if(child.exitCode!==null)throw new Error("Test service exited before readiness.");if(Date.now()>deadline)throw new Error("Test service readiness timed out.");await new Promise(r=>setTimeout(r,100));}
    assert.equal((await fetch(base+"/health")).status,401);
    assert.equal((await fetch(base+"/health",{headers})).status,200);
    const finished=Date.now()+22_000;
    while(!readdirSync(join(root,"data")).includes("v4-scheduled-backups")){if(Date.now()>finished)throw new Error("Due backup did not execute.");await new Promise(r=>setTimeout(r,200));}
    let complete=false;
    while(!complete&&Date.now()<finished){const state=openOperations(dbPath);const schedules=state.schedules();complete=schedules.every(s=>s.nextAt>0&&!!s.lastStatus&&!s.lastStatus.startsWith("Attempt started"));state.close();if(!complete)await new Promise(r=>setTimeout(r,100));}
    assert.equal(complete,true);
    const state=openOperations(dbPath);assert.equal(state.history()[0].status,"queued-for-sync");assert.equal(state.history()[0].totalCents,1250);state.close();
    const files=readdirSync(join(root,"sync-root/Expense Tracker V4/Reports"));assert.equal(files.length,1);assert.equal(JSON.parse(readFileSync(join(root,"sync-root/Expense Tracker V4/Reports",files[0]),"utf8")).summary.totalCents,1250);
    const backups=readdirSync(join(root,"data/v4-scheduled-backups"));assert.equal(readFileSync(join(root,"data/v4-scheduled-backups",backups[0]),"utf8"),"synthetic captured backup");
    assert.equal((await fetch(base+"/health",{headers})).status,200);
    assert.equal((await fetch(base+"/shutdown",{method:"POST",headers})).status,200);await exited;
  } finally {
    if(child.exitCode===null){child.kill();await exited;}
    // This exact UUID test directory was created above under ignored work/.
    assert.ok(root.startsWith(resolve("work/v4-service-tests")+"\\")||root.startsWith(resolve("work/v4-service-tests")+"/"));
    rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
