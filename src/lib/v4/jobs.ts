import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { V4Error } from "./http";
import { randomUUID } from "node:crypto";
export type JobState="queued"|"running"|"succeeded"|"failed"|"cancelled";
export interface CodingJob{id:string;task:string;profile:"review"|"edit";state:JobState;createdAt:number;updatedAt:number;cancelRequested:boolean;workspace?:string;result?:string;diff?:string;error?:string}
export function openJobs(path:string){
  if(path!==":memory:")mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path,{timeout:5000});
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,request_key TEXT UNIQUE,payload TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,payload TEXT NOT NULL) STRICT;");
  function get(id:string):CodingJob|null{const row=db.prepare("SELECT payload FROM jobs WHERE id=?").get(id);return row?JSON.parse(row.payload as string):null;}
  function save(job:CodingJob){job.updatedAt=Date.now();db.prepare("UPDATE jobs SET payload=? WHERE id=?").run(JSON.stringify(job),job.id);}
  return {
    get,save,
    byRequest(key:string):CodingJob|null{const row=db.prepare("SELECT payload FROM jobs WHERE request_key=?").get(key);return row?JSON.parse(row.payload as string):null;},
    list:():CodingJob[]=>db.prepare("SELECT payload FROM jobs ORDER BY rowid DESC LIMIT 100").all().map(r=>JSON.parse(r.payload as string)),
    create(task:string,profile:CodingJob["profile"],key:string){
      const prior=db.prepare("SELECT payload FROM jobs WHERE request_key=?").get(key);
      if(prior){const job=JSON.parse(prior.payload as string) as CodingJob;if(job.task!==task||job.profile!==profile)throw new V4Error(409,"REQUEST_CONFLICT","This request ID already belongs to another task.");return job;}
      const job:CodingJob={id:randomUUID(),task,profile,state:"queued",createdAt:Date.now(),updatedAt:Date.now(),cancelRequested:false};
      db.prepare("INSERT INTO jobs VALUES(?,?,?)").run(job.id,key,JSON.stringify(job));return job;
    },
    event(id:string,text:string){db.prepare("INSERT INTO events(job_id,payload) VALUES(?,?)").run(id,JSON.stringify({at:Date.now(),text:text.slice(0,2000)}));},
    events(id:string,after=0){return db.prepare("SELECT seq,payload FROM events WHERE job_id=? AND seq>? ORDER BY seq LIMIT 200").all(id,after).map(r=>({seq:Number(r.seq),...JSON.parse(r.payload as string)}));},
    claim():CodingJob|null{
      db.exec("BEGIN IMMEDIATE");try{const row=db.prepare("SELECT payload FROM jobs WHERE json_extract(payload,'$.state')='queued' ORDER BY rowid LIMIT 1").get();if(!row){db.exec("COMMIT");return null;}const job=JSON.parse(row.payload as string) as CodingJob;job.state=job.cancelRequested?"cancelled":"running";save(job);db.exec("COMMIT");return job;}catch(e){db.exec("ROLLBACK");throw e;}
    },
    cancel(id:string){const job=get(id);if(!job)return null;if(job.state==="running"||job.state==="queued")job.cancelRequested=true;if(job.state==="queued")job.state="cancelled";save(job);return job;},
    recover(){for(const row of db.prepare("SELECT payload FROM jobs WHERE json_extract(payload,'$.state')='running'").all()){const job=JSON.parse(row.payload as string) as CodingJob;job.state="failed";job.error="Service restarted. The earlier execution is not assumed to be running; inspect its worktree before retrying.";save(job);}},
    close(){db.close();}
  };
}
