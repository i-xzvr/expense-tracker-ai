"use client";
import { useEffect,useState } from "react";
import type { CodingJob } from "@/lib/v4/jobs";
import { Panel,Notice } from "../v3/shared";
async function agent<T>(path:string,body?:unknown):Promise<T>{
  const r=await fetch("/api/agent/"+path,{method:body===undefined?"GET":"POST",headers:body===undefined?undefined:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(20_000)});
  const v=await r.json();if(!r.ok)throw new Error(v.error||"Agent service unavailable.");return v;
}
export default function AgentJobs(){
  const [jobs,setJobs]=useState<CodingJob[]>([]),[task,setTask]=useState("Review the expense export implementation. Identify correctness and maintainability gaps. Do not edit files.");
  const [profile,setProfile]=useState<"review"|"edit">("review"),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[selected,setSelected]=useState<CodingJob|null>(null);
  async function refresh(){const v=await agent<{jobs:CodingJob[]}>("api/v1/jobs");setJobs(v.jobs);}
  useEffect(()=>{let active=true;const poll=()=>agent<{jobs:CodingJob[]}>("api/v1/jobs").then(v=>{if(active)setJobs(v.jobs);},e=>{if(active)setMessage(e.message);});poll();const timer=setInterval(poll,3000);return()=>{active=false;clearInterval(timer);};},[]);
  const selectedId=selected?.id;
  useEffect(()=>{if(!selectedId)return;let active=true;const poll=()=>agent<CodingJob>("api/v1/jobs/"+selectedId).then(j=>{if(active)setSelected(j);},e=>{if(active)setMessage(e.message);});poll();const timer=setInterval(poll,3000);return()=>{active=false;clearInterval(timer);};},[selectedId]);
  async function create(){setBusy(true);try{await agent("api/v1/jobs",{task,profile,confirmed,requestId:crypto.randomUUID()});setMessage("Job accepted. It runs in an isolated worktree; active app files are unchanged.");setConfirmed(false);await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Job failed.");}finally{setBusy(false);}}
  return <div className="space-y-5"><Panel title="Coding-agent jobs" description="Claude runs a scoped task in an isolated Git worktree from committed HEAD. Review results before applying changes.">
    <p className="text-sm">Review can read tracked code. Edit can propose file changes in the worktree. Shell commands, web access and MCP tools are unavailable to these jobs. Agent success is not proof that tests passed.</p>
    <label className="label mt-4">Task<textarea className="input min-h-28" maxLength={6000} value={task} onChange={e=>{setTask(e.target.value);setConfirmed(false);}}/></label>
    <label className="label">Execution profile<select className="input" value={profile} onChange={e=>{setProfile(e.target.value as typeof profile);setConfirmed(false);}}><option value="review">Read-only review</option><option value="edit">Propose edits in isolated worktree</option></select></label>
    <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Run this task with my Claude account. Its normal usage limits apply. The job has a two-minute timeout and API budget cap of $1.</label>
    <button className="btn-primary mt-3" disabled={busy||!confirmed||!task.trim()} onClick={create}>{busy?"Creating…":"Run coding job"}</button>
  </Panel>{message&&<Notice>{message}</Notice>}
    <Panel title="Job history" description="Jobs and result metadata persist across service restarts. Interrupted jobs fail visibly rather than pretending to continue.">
      <div className="space-y-2">{jobs.map(j=><div key={j.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><button className="text-left text-sm text-indigo-700 underline" onClick={()=>setSelected(j)}>{j.task.slice(0,90)}</button><span className="text-xs">{j.state}</span>{j.state==="running"||j.state==="queued"?<button className="btn-secondary" onClick={async()=>{try{await agent("api/v1/jobs/"+j.id+"/cancel",{});setMessage("Cancellation requested. Wait for the resulting job state.");await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Cancellation failed.");}}}>Cancel job</button>:null}</div>)}</div>
    </Panel>{selected&&<Panel title="Selected job result"><p className="break-all text-xs">{selected.id} · {selected.state}</p>{selected.error&&<Notice error>{selected.error}</Notice>}<p className="mt-3 break-all text-sm">Worktree: {selected.workspace??"Not created yet"}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{selected.result??"No result yet."}</pre><h3 className="mt-4 font-semibold">Proposed changes</h3><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{selected.diff||"No changes reported."}</pre><p className="mt-3 text-xs">No automatic merge or deployment. Retain the worktree until review is complete.</p></Panel>}
  </div>;
}
