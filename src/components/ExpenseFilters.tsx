"use client";

import { CATEGORIES, Category, EMPTY_FILTERS, ExpenseFilters } from "@/types/expense";

interface ExpenseFiltersProps {
  filters: ExpenseFilters;
  onChange: (filters: ExpenseFilters) => void;
}

export default function ExpenseFiltersBar({ filters, onChange }: ExpenseFiltersProps) {
  const set = <K extends keyof ExpenseFilters>(key: K, value: ExpenseFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const isActive =
    filters.search !== "" ||
    filters.category !== "All" ||
    filters.startDate !== "" ||
    filters.endDate !== "";
  const rangeInvalid =
    filters.startDate !== "" && filters.endDate !== "" && filters.startDate > filters.endDate;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="search" className="label">
            Search
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              id="search"
              type="search"
              placeholder="Search description or category…"
              value={filters.search}
              onChange={(e) => set("search", e.target.value)}
              className="input pl-9"
            />
          </div>
        </div>

        <div>
          <label htmlFor="filter-category" className="label">
            Category
          </label>
          <select
            id="filter-category"
            value={filters.category}
            onChange={(e) => set("category", e.target.value as Category | "All")}
            className="input"
          >
            <option value="All">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="start-date" className="label">
            From
          </label>
          <input
            id="start-date"
            type="date"
            value={filters.startDate}
            max={filters.endDate || undefined}
            onChange={(e) => set("startDate", e.target.value)}
            className={`input ${rangeInvalid ? "input-error" : ""}`}
          />
        </div>

        <div>
          <label htmlFor="end-date" className="label">
            To
          </label>
          <input
            id="end-date"
            type="date"
            value={filters.endDate}
            min={filters.startDate || undefined}
            onChange={(e) => set("endDate", e.target.value)}
            className={`input ${rangeInvalid ? "input-error" : ""}`}
          />
        </div>

        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={!isActive}
          className="btn-secondary sm:col-span-2 lg:col-span-1"
        >
          Clear
        </button>
      </div>
      {rangeInvalid && (
        <p className="text-xs font-medium text-rose-600" role="alert">
          The start date is after the end date, so no expenses can match.
        </p>
      )}
    </div>
  );
}
