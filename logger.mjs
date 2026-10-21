// Allowlisted diagnostics, never bodies/queries/headers/usernames/session tokens.
import {appendFileSync,mkdirSync,existsSync,statSync,renameSync,unlinkSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const file=process.env.LOG_FILE||resolve(root,'logs/events.jsonl');
const routes=new Set(['/api/health','/api/requests','/api/auth/register','/api/auth/login','/api/auth/logout','/api/auth/me','/api/ai/status','/api/ai/suggest']);
export function routeName(path){if(routes.has(path))return path;if(/^\/api\/requests\/[0-9a-f-]{36}\/restore$/i.test(path))return '/api/requests/:id/restore';if(/^\/api\/requests\/[0-9a-f-]{36}$/i.test(path))return '/api/requests/:id';return 'unknown'}
export function writeEvent({requestId,method,path,status,durationMs}){
 const event={time:new Date().toISOString(),event:'http.response',requestId,method:['GET','POST','PATCH','DELETE','HEAD','OPTIONS'].includes(method)?method:'OTHER',route:routeName(path),status:Number(status),durationMs:Math.max(0,Math.round(durationMs)),level:status>=500?'error':status>=400?'warn':'info'};
 const line=JSON.stringify(event)+'\n';
 try{mkdirSync(dirname(file),{recursive:true});if(existsSync(file)&&statSync(file).size>1024*1024){if(existsSync(file+'.1'))unlinkSync(file+'.1');renameSync(file,file+'.1')}appendFileSync(file,line,{mode:0o600})}catch{console.warn('Diagnostic file unavailable; response log follows.')}
 process.stdout.write(line);
}
