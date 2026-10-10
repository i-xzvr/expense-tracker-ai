"use client";
import type { Workspace } from "@/types/accounting";
import { monthlyInsights } from "@/lib/v4/insights";
import { Panel,Stat,money } from "../v3/shared";
export default function MonthlyInsights({workspace,month}:{workspace:Workspace;month:string}){
  const value=monthlyInsights(workspace,month);
  const colors=["#6366f1","#14b8a6","#f59e0b","#ec4899","#0ea5e9","#64748b"];
  const populated=value.categories.filter(c=>c.totalCents>0);
  const slices=populated.map((c,i)=>({ ...c, fraction:c.totalCents/value.totalCents, offset:populated.slice(0,i).reduce((sum,item)=>sum+item.totalCents,0)/value.totalCents, color:colors[i%colors.length] }));
  return <Panel title="Monthly Insights" description={"Verified expense records for "+month+". Every chart and total is calculated by the app."}>
    <div className="grid gap-4 sm:grid-cols-3"><Stat label="Monthly spending" value={money(value.totalCents)} detail={value.count+" expenses"}/><Stat label="Top category" value={value.top[0]?.category??"No expenses"}/><Stat label="Budget streak" value={value.streak===null?"Not established":value.streak+" days"} detail="Requires a closed month and budgets for every category."/></div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2"><div className="flex items-center gap-4"><svg viewBox="0 0 120 120" width={200} height={200} role="img" aria-label="Category spending doughnut"><title>Category spending in USD</title><circle cx="60" cy="60" r="45" fill="none" stroke="#e2e8f0" strokeWidth="18"/>{slices.map(s=><circle key={s.category} cx="60" cy="60" r="45" fill="none" stroke={s.color} strokeWidth="18" pathLength="1" strokeDasharray={s.fraction+" "+(1-s.fraction)} strokeDashoffset={-s.offset} transform="rotate(-90 60 60)"><title>{s.category+": "+money(s.totalCents)}</title></circle>)}</svg><ul className="text-sm">{slices.map(s=><li key={s.category}>{s.category}: {money(s.totalCents)}</li>)}</ul></div><div><h3 className="font-semibold">Top three categories</h3><ol className="mt-3 space-y-2">{value.top.map((s,i)=><li key={s.category}>{i+1}. {s.category} — {money(s.totalCents)}</li>)}</ol></div></div>
    <p className="mt-4 text-xs text-slate-500">Streak counts consecutive days ending on the last day of a closed month, with daily spending no higher than the floor of total monthly budget divided by calendar days. Open or incompletely budgeted months remain unknown.</p>
  </Panel>;
}
