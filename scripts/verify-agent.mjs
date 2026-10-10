// Optional live account test: consumes normal Claude usage; creates a read-only
// source worktree and durable job. It never edits the active project or ledger.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const version=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8")).version;
const base="http://127.0.0.1:3103/api/agent/api/v1/jobs";
const created=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"Use the Read file tool to inspect package.json in this worktree. Do not read other files or make edits. Reply exactly V4_AGENT_READY followed by the package version, for example V4_AGENT_READY 0.4.1.",profile:"review",requestId:randomUUID(),confirmed:true}),signal:AbortSignal.timeout(15_000)});
assert.equal(created.status,202,"Coding job creation; check Claude installation/login if unavailable");
const job=await created.json();
console.log("Created optional live review job "+job.id);
const deadline=Date.now()+160_000;
let state;
do {
  const response=await fetch(base+"/"+job.id,{signal:AbortSignal.timeout(15_000)});
  assert.equal(response.status,200);state=await response.json();
  if(["succeeded","failed","cancelled"].includes(state.state))break;
  await new Promise(resolve=>setTimeout(resolve,1000));
}while(Date.now()<deadline);
assert.equal(state.state,"succeeded",state.error??"Live review did not finish successfully");
assert.ok(state.result.includes("V4_AGENT_READY "+version),"The committed source worktree must report this release version");
const response=await fetch(base+"/"+job.id+"/events",{signal:AbortSignal.timeout(15_000)});
assert.equal(response.status,200);
const events=await response.json();
assert.ok(events.events.some(event=>event.text==="File tool requested: Read"),"The real file tool must have run");
console.log(JSON.stringify({id:job.id,state:state.state,readToolVerified:true,activeProjectEdited:false}));
