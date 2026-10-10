import type { Workspace } from "../../types/accounting";
import { CATEGORIES } from "../../types/expense";
export function monthlyInsights(workspace:Workspace,month:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error("Invalid month.");
  const rows=workspace.expenses.filter(r=>r.date.startsWith(month+"-"));
  const categories=CATEGORIES.map(category=>({category,totalCents:rows.filter(r=>r.category===category).reduce((s,r)=>s+Math.round(r.amount*100),0)}));
  const totalCents=categories.reduce((s,c)=>s+c.totalCents,0);
  const budget=workspace.budgets.filter(b=>b.month===month);
  const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
  const complete=workspace.closedMonths.includes(month)&&CATEGORIES.every(c=>budget.some(b=>b.category===c));
  let streak:number|null=null;
  if(complete){
    const totalBudget=budget.reduce((s,b)=>s+b.amountCents,0);
    const allowance=Math.floor(totalBudget/days);
    streak=0;
    for(let day=days;day>=1;day--){const date=month+"-"+String(day).padStart(2,"0");const spent=rows.filter(r=>r.date===date).reduce((s,r)=>s+Math.round(r.amount*100),0);if(spent>allowance)break;streak++;}
  }
  return {totalCents,count:rows.length,categories,top:categories.filter(c=>c.totalCents>0).sort((a,b)=>b.totalCents-a.totalCents).slice(0,3),streak};
}
