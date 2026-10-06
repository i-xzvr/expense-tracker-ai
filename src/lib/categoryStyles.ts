import { Category } from "@/types/expense";

export const CATEGORY_STYLES: Record<Category, { bar: string; badge: string }> = {
  Food: { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  Transportation: { bar: "bg-sky-500", badge: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  Entertainment: {
    bar: "bg-fuchsia-500",
    badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20",
  },
  Shopping: { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  Bills: { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  Other: { bar: "bg-slate-500", badge: "bg-slate-100 text-slate-700 ring-slate-600/20" },
};
