import { createServer } from "node:http";
import { spawn,execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync,mkdirSync,writeFileSync,copyFileSync } from "node:fs";
import { join,resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { openJobs,type CodingJob } from "../../src/lib/v4/jobs";
import { operations } from "../../src/lib/v4/database";
import { deliverExport } from "../../src/lib/v4/cloud";
import { saveToSyncFolder } from "../../src/lib/v4/sync-folder";
import { validateExport } from "../../src/lib/v4/export";
import { localJson,json,apiError,V4Error } from "../../src/lib/v4/http";
import { isObject } from "../../src/lib/ai/validation";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const root=resolve(process.env.V4_REPOSITORY??process.cwd());
const port=Number(process.env.V4_SERVICES_PORT??3105);
const token=readFileSync(process.env.V4_SERVICES_TOKEN_PATH??join(root,".runtime","v4-services-token"),"utf8").trim();
const store=openJobs(process.env.V4_JOBS_PATH??join(root,"data","v4-jobs.sqlite"));
store.recover();
const run=promisify(execFile);
let busy=false,stopping=false,current:{job:CodingJob;child:ReturnType<typeof spawn>}|null=null;
const safeMessage=(e:unknown)=>e instanceof Error&&e.message.includes("worktree")?"Git could not prepare the isolated worktree.":"Execution could not complete. Check local runtime and authentication.";
async function execute(job:CodingJob){
  const workspace=join(root,".runtime","agent-worktrees",job.id);
  const branch="codex/agent-"+job.id;
  mkdirSync(dirname(workspace),{recursive:true});
  await run("git",["worktree","add","-b",branch,workspace,"HEAD"],{cwd:root,windowsHide:true,timeout:30_000});
  job.workspace=workspace;store.save(job);store.event(job.id,"Isolated worktree created from committed HEAD; ignored financial data and credentials are not copied.");
  const tools=job.profile==="review"?"Read,Glob,Grep":"Read,Glob,Grep,Edit,Write";
  const binary=process.env.V4_CLAUDE_EXE??join(process.env.USERPROFILE??""," .local".trim(),"npm","node_modules","@anthropic-ai","claude-code","bin","claude.exe");
  const args=["-p",job.task,"--restricted","--tools",tools,"--allowedTools",tools,"--permission-prompts","none","--strict-mcp-config","--mcp-config",'{"mcpServers":{}}',"--disable-slash-commands","--no-session-persistence","--output-format","stream-json","--verbose","--model","sonnet","--max-budget-usd","1"];
  const childEnvironment:NodeJS.ProcessEnv={NODE_ENV:"production"};
  for(const key of ["PATH","Path","USERPROFILE","APPDATA","LOCALAPPDATA","TEMP","TMP","SystemRoot","SYSTEMROOT","WINDIR","COMSPEC","HOME","HOMEDRIVE","HOMEPATH","PROGRAMFILES","ProgramFiles","PROGRAMFILES(X86)","ProgramFiles(x86)","ProgramW6432","USERNAME"]){if(process.env[key])childEnvironment[key]=process.env[key];}
  childEnvironment.CLAUDE_CODE_GIT_BASH_PATH=process.env.CLAUDE_CODE_GIT_BASH_PATH??"C:\\Program Files\\Git\\bin\\bash.exe";
  childEnvironment.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1";
  const child=spawn(binary,args,{cwd:workspace,windowsHide:true,stdio:["ignore","pipe","pipe"],env:childEnvironment});
  current={job,child};let output="",pending="",failure="",totalBytes=0;
  const deadline=setTimeout(()=>child.kill(),120_000);let cancelled=false;
  const cancellation=setInterval(()=>{if(store.get(job.id)?.cancelRequested){cancelled=true;child.kill();}},500);
  child.stdout.on("data",(data:Buffer)=>{totalBytes+=data.length;if(totalBytes>2_000_000){failure="Agent output exceeded its limit.";child.kill();return;}pending+=data.toString("utf8");const lines=pending.split("\n");pending=lines.pop()??"";for(const line of lines){try{const event=JSON.parse(line);if(event.type==="result"){output=String(event.result??"");if(event.is_error)failure="Claude reported execution failure."; }else if(event.type==="assistant"){store.event(job.id,"Agent response received.");}}catch{/* Partial/unrecognized frames do not count as success. */}}});
  child.stderr.on("data",()=>{store.event(job.id,"Agent runtime diagnostic received (raw diagnostics omitted).");});
  const code=await new Promise<number|null>((accept,reject)=>{child.once("error",reject);child.once("close",accept);}).finally(()=>{clearTimeout(deadline);clearInterval(cancellation);current=null;});
  const tracked=await run("git",["diff","--no-ext-diff","--stat"],{cwd:workspace,windowsHide:true,maxBuffer:256_000});
  const changed=await run("git",["status","--porcelain"],{cwd:workspace,windowsHide:true,maxBuffer:256_000});
  // Include new files in review artifacts without committing generated changes.
  const diff=await run("git",["diff","--no-ext-diff"],{cwd:workspace,windowsHide:true,maxBuffer:1024_000});
  job.diff=changed.stdout+"\n"+tracked.stdout+"\n"+diff.stdout.slice(0,500_000);
  job.cancelRequested=store.get(job.id)?.cancelRequested ?? cancelled;
  cancelled ||= job.cancelRequested;
  job.result=output.slice(0,100_000);job.state=cancelled?"cancelled":code===0&&output&&!failure?"succeeded":"failed";
  job.error=job.state==="failed"?(failure||"Agent exited without a successful result, or timed out."):undefined;
  store.save(job);store.event(job.id,"Execution "+job.state+". No changes applied to the active project. Review the retained worktree.");
  writeFileSync(join(workspace,"agent-result.txt"),job.result??"");
}
function dirname(path:string){return resolve(path,"..");}
async function tick(){
  if(busy||stopping)return;busy=true;
  try{const job=store.claim();if(job?.state==="running"){try{await execute(job);}catch(e){job.state="failed";job.error=safeMessage(e);store.save(job);store.event(job.id,job.error);}}}
  finally{busy=false;}
}
let schedulesBusy=false;
async function scheduledExports(){
  if(schedulesBusy||stopping)return;schedulesBusy=true;
  try{const db=operations();for(const schedule of db.schedules()){
    if(!schedule.enabled||schedule.nextAt>Date.now())continue;
    // Advance before delivery; restart must not silently duplicate a cloud operation.
    schedule.nextAt=Date.now()+schedule.intervalHours*3600_000;schedule.lastStatus="Attempt started; delivery unconfirmed";if(!db.finishSchedule(schedule))continue;
    try{
      if(schedule.destination==="local-backup" || schedule.destination==="sync-backup"){
        const snapshot=JSON.parse(schedule.snapshot);if(!/^[a-f0-9-]{36}$/.test(snapshot.file))throw new Error("Invalid backup snapshot.");
        if(schedule.destination==="sync-backup") {
          const saved=await saveToSyncFolder(new Uint8Array(readFileSync(join(root,"data","v4-backup-snapshots",snapshot.file+".json"))),"expense-tracker-v4-complete.json","Backups");
          schedule.lastStatus="Queued for OneDrive sync: "+saved.id;
        } else {
        const folder=join(root,"data","v4-scheduled-backups");mkdirSync(folder,{recursive:true});
        copyFileSync(join(root,"data","v4-backup-snapshots",snapshot.file+".json"),join(folder,schedule.id+"-"+Date.now()+".json"));
        schedule.lastStatus="Local backup copied "+new Date().toISOString();
        }
      }else{
        const {request,report}=validateExport(JSON.parse(schedule.snapshot));const target=JSON.parse(schedule.destination);await deliverExport(request,target.provider,target.target);schedule.lastStatus=(target.provider==="onedrive-sync"?"Queued for sync ":"Delivered ")+new Date().toISOString();db.record({filename:request.filename,format:request.format,count:report.summary.count,totalCents:report.summary.totalCents,destination:target.provider,status:target.provider==="onedrive-sync"?"queued-for-sync":"delivered"});
      }
    }
    catch(e){schedule.lastStatus=e instanceof V4Error?e.message:"Delivery failed or unconfirmed; inspect destination before retrying.";
      if(!["local-backup","sync-backup"].includes(schedule.destination)){ const {request,report}=validateExport(JSON.parse(schedule.snapshot)); db.record({filename:request.filename,format:request.format,count:report.summary.count,totalCents:report.summary.totalCents,destination:JSON.parse(schedule.destination).provider,status:"failed",error:schedule.lastStatus}); }
    }
    db.finishSchedule(schedule);
  }}finally{schedulesBusy=false;}
}
const server=createServer(async(req,res)=>{
  try{
    const supplied=Buffer.from((req.headers.authorization??"").replace(/^Bearer /,""));const expected=Buffer.from(token);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new V4Error(401,"UNAUTHORIZED","Service authorization required.");
    const method=req.method??"GET",url=new URL(req.url??"/","http://127.0.0.1:"+port);
    let raw="";for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>16_384)throw new V4Error(413,"BODY_TOO_LARGE","Job request exceeds 16 KiB.");}
    const request=new Request(url,{method,headers:{...Object.fromEntries(Object.entries(req.headers).filter(([,v])=>typeof v==="string")) as Record<string,string>,host:"127.0.0.1:"+port},...(method==="GET"?{}:{body:raw})});
    const pieces=url.pathname.split("/").filter(Boolean);let response:Response;
    if(method==="POST"&&url.pathname==="/shutdown"){response=json({stopping:true});setTimeout(stop,100);}
    else if(method==="GET"&&url.pathname==="/health")response=json({ready:true,agent:!!process.env.V4_CLAUDE_EXE,worker:true});
    else if(url.pathname==="/api/v1/jobs"&&method==="GET")response=json({jobs:store.list().map(j=>({id:j.id,task:j.task,profile:j.profile,state:j.state,createdAt:j.createdAt,updatedAt:j.updatedAt,cancelRequested:j.cancelRequested,workspace:j.workspace,error:j.error}))});
    else if(url.pathname==="/api/v1/jobs"&&method==="POST"){
      const body=await localJson(request,16_384);
      if(!isObject(body)||typeof body.task!=="string"||!body.task.trim()||body.task.length>6000||!["review","edit"].includes(String(body.profile))||typeof body.requestId!=="string"||!/^[a-f0-9-]{36}$/.test(body.requestId)||body.confirmed!==true)throw new V4Error(400,"INVALID_JOB","Confirm a scoped review or edit job.");
      if(!store.byRequest(body.requestId)&&store.list().filter(j=>j.state==="queued"||j.state==="running").length>=10)throw new V4Error(429,"QUEUE_FULL","At most ten jobs may be pending.");
      response=json(store.create(body.task,body.profile as CodingJob["profile"],body.requestId),202);void tick();
    }else if(pieces.slice(0,3).join("/")==="api/v1/jobs"&&pieces[3]){
      const job=store.get(pieces[3]);if(!job)throw new V4Error(404,"NOT_FOUND","Job not found.");
      if(method==="GET"&&pieces.length===4)response=json(job);
      else if(method==="GET"&&pieces[4]==="events")response=json({events:store.events(job.id,Math.max(0,Number(url.searchParams.get("after"))||0))});
      else if(method==="GET"&&pieces[4]==="result")response=json({state:job.state,result:job.result??null,diff:job.diff??null,workspace:job.workspace??null,error:job.error??null});
      else if(method==="POST"&&pieces[4]==="cancel"){await localJson(request);response=json(store.cancel(job.id));}
      else throw new V4Error(405,"METHOD_NOT_ALLOWED","Unsupported job operation.");
    }else throw new V4Error(404,"NOT_FOUND","Unknown service route.");
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){const r=apiError(e);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}
});
server.listen(port,"127.0.0.1",()=>console.log("V4 services listening on loopback port "+port));
const jobsTimer=setInterval(()=>void tick(),1000),scheduleTimer=setInterval(()=>void scheduledExports(),15_000);
function stop(){stopping=true;clearInterval(jobsTimer);clearInterval(scheduleTimer);current?.child.kill();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),3000).unref();}
process.on("SIGINT",stop);process.on("SIGTERM",stop);void tick();
