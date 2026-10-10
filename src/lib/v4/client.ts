export async function api<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch("/api/v4/" + path, { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The operation failed.");
  return value as T;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

