import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { guardLocalRequest } from "@/lib/ai/server";
import { apiError,V4Error,privateHeaders,localJson } from "@/lib/v4/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function handler(request:Request,context:{params:Promise<{path:string[]}>}){
  try{
    guardLocalRequest(request);
    if(request.method==="POST"&&request.headers.has("sec-fetch-site")&&!request.headers.has("origin"))throw new V4Error(403,"ORIGIN_REQUIRED","Open the local app.");
    const {path}=await context.params;
    const joined=path.join("/");
    if(!/^(health|api\/v1\/jobs(?:\/[a-f0-9-]{36}(?:\/(?:events|result|cancel))?)?)$/.test(joined))throw new V4Error(404,"NOT_FOUND","Unknown agent route.");
    const token=(await readFile(/*turbopackIgnore: true*/ process.env.V4_SERVICES_TOKEN_PATH??join(process.cwd(),".runtime","v4-services-token"),"utf8")).trim();
    const query=new URL(request.url).search;
    const body=request.method==="GET"?undefined:JSON.stringify(await localJson(request,16_384));
    const response=await fetch("http://127.0.0.1:3105/"+joined+query,{method:request.method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body,redirect:"error",signal:AbortSignal.timeout(15_000)});
    return new Response(await response.text(),{status:response.status,headers:{...privateHeaders,"Content-Type":"application/json"}});
  }catch(e){if(e instanceof V4Error)return apiError(e);return Response.json({error:"V4 agent services are offline. Start V4 with Start-V4.cmd.",code:"AGENT_OFFLINE"},{status:503,headers:privateHeaders});}
}
export {handler as GET,handler as POST};
