"use client";
import { useEffect,useState } from "react";
import { api } from "@/lib/v4/client";
import type { ExportHistory,Schedule } from "@/lib/v4/database";
import { Panel,Notice,DataTable,Cell,money } from "../v3/shared";
interface Status{syncFolder:{available:boolean;root:string|null;status:string};onedrive:{configured:boolean;authorized:boolean};sheets:{configured:boolean;authorized:boolean}}
export default function Integrations(){
  const [status,setStatus]=useState<Status|null>(null),[history,setHistory]=useState<ExportHistory[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]);
  const [message,setMessage]=useState<string|null>(null),[busy,setBusy]=useState(false),[flow,setFlow]=useState<{flow:string;code:string;url:string}|null>(null);
  async function refresh(){const [s,h,j]=await Promise.all([api<Status>("integrations"),api<{history:ExportHistory[]}>("history"),api<{schedules:Schedule[]}>("schedules")]);setStatus(s);setHistory(h.history);setSchedules(j.schedules);}
  useEffect(()=>{let active=true;Promise.all([api<Status>("integrations"),api<{history:ExportHistory[]}>("history"),api<{schedules:Schedule[]}>("schedules")]).then(([s,h,j])=>{if(active){setStatus(s);setHistory(h.history);setSchedules(j.schedules);}},e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
  async function run(fn:()=>Promise<void>){setBusy(true);try{await fn();await refresh();}catch(e){setMessage(e instanceof Error?e.message:"Connection failed.");}finally{setBusy(false);}}
  return <div className="space-y-6"><Panel title="Cloud connections" description="Local AI stays on this laptop. Only explicitly selected exports go to a destination.">
    <p>Installed OneDrive folder: {status?.syncFolder.available?status.syncFolder.root:"Unavailable"}</p>
    <p className="text-sm mt-2">{status?.syncFolder.status} New reports and backups go to Expense Tracker V4, with unique names. A saved file is queued for sync; this app cannot confirm cloud arrival.</p>
    <p className="mt-4">OneDrive API: {status?(status.onedrive.authorized?"Authorization stored; delivery verifies access":status.onedrive.configured?"Configured; sign-in required":"Application ID required — docs/v4-cloud.md"):"Checking…"}</p>
    <button disabled={busy} className="btn-primary mt-3" onClick={()=>run(async()=>setFlow(await api("integrations/connect",{})))}>Connect OneDrive API</button>
    {flow&&<div className="mt-3"><p>Use code <strong>{flow.code}</strong> at <a href={flow.url} target="_blank" rel="noreferrer" className="underline">Microsoft sign-in</a>.</p><button className="btn-secondary" disabled={busy} onClick={()=>run(async()=>{const r=await api<{connected?:boolean}>("integrations/poll",{flow:flow.flow});if(r.connected){setFlow(null);setMessage("OneDrive authorization saved with Windows DPAPI.");}else setMessage("Sign-in pending. Complete Microsoft sign-in, then check again.");})}>Check sign-in</button></div>}
    <p className="mt-4">Google Sheets: {status?.sheets.configured?"OAuth configured; delivery verifies access":"Server OAuth required — docs/v4-cloud.md"}. Exports use RAW cell values.</p>
    <p className="mt-3 text-xs">Email prepares a draft with manual attachment. Local share links expire after 24 hours. Dropbox is not connected in this release.</p><button className="btn-secondary mt-3" disabled={busy} onClick={()=>run(refresh)}>Refresh connections and history</button>
  </Panel>{message&&<Notice>{message}</Notice>}
  <Panel title="Captured-snapshot schedules" description="V4 services deliver the saved snapshot while online. Later browser edits are not included."><DataTable label="Export schedules" headers={["Name","Next attempt","Status","Action"]}>{schedules.map(s=><tr key={s.id}><Cell>{s.name}</Cell><Cell>{new Date(s.nextAt).toLocaleString()}</Cell><Cell>{s.lastStatus??"Scheduled"}</Cell><Cell><button className="text-indigo-700 underline" disabled={busy} onClick={()=>run(async()=>{await api("schedules",{id:s.id},"DELETE");setMessage("Schedule removed.");})}>Remove schedule</button></Cell></tr>)}</DataTable></Panel>
  <Panel title="Export history" description="Prepared means generated. Queued-for-sync means the local OneDrive copy was verified. Delivered means API provider confirmation."><DataTable label="Export history" headers={["When","File","Records","Destination","Status"]}>{history.map(h=><tr key={h.id}><Cell>{new Date(h.at).toLocaleString()}</Cell><Cell>{h.filename}</Cell><Cell>{h.count} · {money(h.totalCents)}</Cell><Cell>{h.destination}</Cell><Cell>{h.status}{h.error&&<p>{h.error}</p>}</Cell></tr>)}</DataTable></Panel></div>;
}

