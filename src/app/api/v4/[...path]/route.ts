import { v4Route } from "@/lib/v4/routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(request: Request, context: { params: Promise<{ path: string[] }> }) { return v4Route(request, (await context.params).path); }
export { handler as GET, handler as POST, handler as DELETE };
