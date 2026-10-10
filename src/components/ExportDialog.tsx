"use client";
import { useId, useMemo, useState } from "react";
import { CATEGORIES, EMPTY_FILTERS, type Expense, type ExpenseFilters } from "@/types/expense";
import { buildExpenseReport, type ExportScope } from "@/lib/export/report";
import { formatCurrency } from "@/lib/format";
import type { ExportRequest, ReportTemplate, V4Format } from "@/lib/v4/export";
import { api, downloadBlob } from "@/lib/v4/client";
import Modal from "./Modal";
const templates: ReportTemplate[] = ["Detailed expenses","Monthly Summary","Category Analysis","Tax Report"];
export default function ExportDialog({ expenses, filters, onClose }: { expenses: Expense[]; filters: ExpenseFilters; onClose: () => void }) {
  const id=useId(), [scope,setScope]=useState<ExportScope>("all"), [selection,setSelection]=useState({...filters});
  const [format,setFormat]=useState<V4Format>("csv"), [template,setTemplate]=useState<ReportTemplate>("Detailed expenses");
  const [filename,setFilename]=useState("expenses-"+new Date().toISOString().slice(0,10));
  const [generatedAt]=useState(()=>new Date().toISOString()), [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState<{error?:boolean;text:string}|null>(null);
  const [destination,setDestination]=useState<"onedrive-sync"|"onedrive"|"sheets">("onedrive-sync"),[target,setTarget]=useState("Expense Exports");
  const [confirmed,setConfirmed]=useState(false),[interval,setInterval]=useState(168);
  const [shared,setShared]=useState<{url:string;qr:string;id:string}|null>(null);
  const result=useMemo(()=>{try{return {report:buildExpenseReport(expenses,{scope,filters:selection,now:new Date(generatedAt)}),error:null};}catch(e){return {report:null,error:e instanceof Error?e.message:"Invalid selection."};}},[expenses,scope,selection,generatedAt]);
  const report=result.report;
  const request:ExportRequest={expenses,scope,filters:selection,generatedAt,format,filename,template};
  function change(key:keyof ExpenseFilters,value:string){setSelection(p=>({...p,[key]:value}));setScope("filtered");setConfirmed(false);setShared(null);}
  async function action(fn:()=>Promise<string>){if(busy||!report?.summary.count)return;setBusy(true);setFeedback(null);try{setFeedback({text:await fn()});}catch(e){setFeedback({error:true,text:e instanceof Error?e.message:"Operation failed."});}finally{setBusy(false);}}
  async function download(){
    const response=await fetch("/api/v4/export",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(120_000)});
    if(!response.ok)throw new Error((await response.json()).error||"Export failed.");
    const actual=decodeURIComponent((response.headers.get("content-disposition")??"").split("UTF-8''")[1]??filename+"."+format);
    downloadBlob(await response.blob(),actual);
    return "Download started: "+actual+". "+decodeURIComponent(response.headers.get("x-export-warnings")??"");
  }
  return <Modal title="Export expenses" onClose={onClose} size="wide"><div className="space-y-5" aria-busy={busy}>
    <p className="text-sm text-slate-600">Preview one selection for CSV, JSON or direct PDF. Local AI can explain the same records.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label" htmlFor={id+"-scope"}>Export selection<select aria-label="Export selection" id={id+"-scope"} className="input" value={scope} onChange={e=>{setScope(e.target.value as ExportScope);setConfirmed(false);}}><option value="all">All expenses</option><option value="filtered">Custom filters</option></select></label>
      <label className="label" htmlFor={id+"-template"}>Report template<select aria-label="Report template" id={id+"-template"} className="input" value={template} onChange={e=>setTemplate(e.target.value as ReportTemplate)}>{templates.map(t=><option key={t}>{t}</option>)}</select></label>
      <label className="label" htmlFor={id+"-format"}>Format<select aria-label="Format" id={id+"-format"} className="input" value={format} onChange={e=>setFormat(e.target.value as V4Format)}><option value="csv">CSV</option><option value="json">JSON</option><option value="pdf">PDF</option></select></label>
      <label className="label" htmlFor={id+"-name"}>Filename<input aria-label="Filename" id={id+"-name"} className="input" value={filename} maxLength={104} onChange={e=>setFilename(e.target.value)}/><span className="text-xs font-normal">The extension is added automatically.</span></label>
    </div>
    {scope==="filtered"&&<fieldset className="rounded-xl border p-4"><legend className="font-semibold">Independent export filters</legend><div className="grid gap-3 sm:grid-cols-2">
      <label className="label">Start date<input type="date" className="input" value={selection.startDate} onChange={e=>change("startDate",e.target.value)}/></label>
      <label className="label">End date<input type="date" className="input" value={selection.endDate} onChange={e=>change("endDate",e.target.value)}/></label>
      <label className="label">Category<select aria-label="Category" className="input" value={selection.category} onChange={e=>change("category",e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="label">Search<input className="input" value={selection.search} onChange={e=>change("search",e.target.value)}/></label>
    </div><div className="mt-3 flex gap-3"><button className="btn-secondary" onClick={()=>setSelection({...filters})}>Use dashboard filters</button><button className="btn-secondary" onClick={()=>setSelection({...EMPTY_FILTERS})}>Clear export filters</button></div></fieldset>}
    {result.error&&<p role="alert" className="text-rose-700">{result.error}</p>}
    {report&&<section aria-label="Export preview" className="rounded-xl bg-slate-50 p-4"><h3 className="font-semibold">{report.summary.count} expenses · {formatCurrency(report.summary.totalCents/100)}</h3><p className="text-xs">{report.summary.startDate??"No dates"} — {report.summary.endDate??"No dates"} · USD · newest first</p>
      <div role="region" tabIndex={0} aria-label="Selected expense rows" className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">First five selected expenses</caption><thead><tr>{["Date","Category","Description","Amount"].map(x=><th key={x} scope="col" className="p-2">{x}</th>)}</tr></thead><tbody>{report.expenses.slice(0,5).map(r=><tr key={r.id}><td className="p-2">{r.date}</td><td className="p-2">{r.category}</td><td className="p-2">{r.description}</td><td className="p-2">{formatCurrency(r.amount)}</td></tr>)}</tbody></table></div><p className="text-xs">{report.summary.count>5?"Showing 5 rows; every selected row is exported.":"Every selected row is shown."}</p></section>}
    <div className="flex flex-wrap gap-2">
      <button className="btn-primary" disabled={busy||!report?.summary.count} onClick={()=>action(download)}>{busy?"Working…":"Download "+format.toUpperCase()}</button>
      <button className="btn-secondary" disabled={busy||!report?.summary.count} onClick={()=>action(async()=>{const response=await fetch("/api/ai/query",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"Show expense summary from "+report!.summary.startDate+" to "+report!.summary.endDate+".",month:report!.summary.startDate!.slice(0,7),expenses:report!.expenses}),signal:AbortSignal.timeout(120_000)});const value=await response.json();if(!response.ok)throw new Error(value.error||"AI unavailable.");return value.answer;})}>Explain selection with local AI</button>
      <button className="btn-secondary" disabled={busy||!report?.summary.count} onClick={()=>action(async()=>{const value=await api<{id:string}>("shares",{export:request,confirmed:true});const url=location.origin+"/api/v4/shares/"+value.id;const qr=(await import("qrcode")).default;setShared({url,id:value.id,qr:await qr.toDataURL(url)});return "Local snapshot link created for 24 hours. It works only on this laptop.";})}>Create local share / QR</button>
      <button className="btn-secondary" onClick={()=>{location.href="mailto:?subject="+encodeURIComponent(template)+"&body="+encodeURIComponent("Please attach your downloaded expense report. Financial data is not included in this draft.");}}>Prepare email draft</button>
    </div>
    {shared&&<div className="rounded-xl border p-4"><a className="break-all text-sm text-indigo-700 underline" href={shared.url}>Download local shared snapshot</a>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shared.qr} alt="QR for the local snapshot link" width={160} height={160}/><button className="btn-secondary" onClick={()=>action(async()=>{await api("shares",{id:shared.id},"DELETE");setShared(null);return "Share revoked.";})}>Revoke link</button></div>}
    <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">Cloud delivery and recurring exports</summary><div className="mt-4 space-y-3">
      <p className="text-xs">Connect accounts in Integrations first. Schedules repeat this captured snapshot, while the laptop and V4 services run.</p>
      <label className="label">Destination<select aria-label="Destination" className="input" value={destination} onChange={e=>{setDestination(e.target.value as typeof destination);setTarget(e.target.value==="onedrive"?"Expense Exports":"");setConfirmed(false);}}><option value="onedrive-sync">Installed OneDrive sync folder</option><option value="onedrive">OneDrive API</option><option value="sheets">Google Sheets</option></select></label>
      {destination!=="onedrive-sync"&&<label className="label">{destination==="onedrive"?"Existing OneDrive folder":"Spreadsheet ID"}<input className="input" value={target} onChange={e=>{setTarget(e.target.value);setConfirmed(false);}}/></label>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Send this previewed selection to this destination. A saved schedule may repeat this captured snapshot.</label>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy||!confirmed||!report?.summary.count} onClick={()=>action(async()=>{const value=await api<{id:string}>("delivery",{export:request,destination,target,confirmed});return (destination==="onedrive-sync"?"Saved to OneDrive folder; cloud sync completion is unverified: ":"Cloud delivery confirmed: ")+value.id;})}>Send selected export</button>
        <label className="label">Repeat<select className="input" value={interval} onChange={e=>setInterval(Number(e.target.value))}><option value={24}>Daily</option><option value={168}>Weekly</option><option value={720}>Every 30 days</option></select></label>
        <button className="btn-secondary" disabled={busy||!confirmed||!report?.summary.count} onClick={()=>action(async()=>{await api("schedules",{export:request,destination,target,confirmed,intervalHours:interval,name:template});return "Snapshot schedule saved. Manage it in Integrations.";})}>Save export schedule</button></div>
    </div></details>
    {feedback&&<p role={feedback.error?"alert":"status"} className={"rounded-lg p-3 text-sm "+(feedback.error?"bg-rose-50 text-rose-800":"bg-emerald-50 text-emerald-800")}>{feedback.text}</p>}
    <p className="text-xs text-slate-500">Downloads stay local. OneDrive sync files receive unique names. Cloud actions send the selected report without receipt images. History records preparation/provider confirmation, not whether the browser saved a file.</p>
    <button className="btn-secondary" onClick={onClose}>Close</button>
  </div></Modal>;
}
