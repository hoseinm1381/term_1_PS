import assert from 'node:assert/strict';
import {configureProduction as config} from '../production-config.mjs';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import net from 'node:net';
let checks=0;const check=x=>{assert.ok(x);checks++;};
for(const key of ['PUBLIC_ORIGIN','APP_URL','COOLIFY_FQDN','COOLIFY_URL']){
 const env={NODE_ENV:'production',[key]:'https://class.example/'};
 check(config(env)==='https://class.example');check(env.DB_FILE==='/data/requests.sqlite'&&env.COOKIE_SECURE==='1');
}
for(const v of [undefined,'http://class.example','https://class.example/page','https://u:p@class.example','https://class.example/?x=1','bad']){
 assert.throws(()=>config({NODE_ENV:'production',PUBLIC_ORIGIN:v}));checks++;
}
assert.throws(()=>config({NODE_ENV:'production',PUBLIC_ORIGIN:'https://class.example',COOKIE_SECURE:'0'}));checks++;
check(config({NODE_ENV:'production',APP_URL:'bad',COOLIFY_FQDN:'https://class.example,https://other.example'})==='https://class.example');
check(config({})===undefined);
const dir=mkdtempSync(join(tmpdir(),'poulstar-'));let child,logs='';
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const origin='https://class.example';
async function start(){
 const env={...process.env,NODE_ENV:'production',PORT:String(port),DB_FILE:join(dir,'db.sqlite'),LOG_FILE:join(dir,'events.jsonl'),APP_URL:origin+'/',AI_MODE:'off'};
 for(const k of ['PUBLIC_ORIGIN','COOKIE_SECURE','COOLIFY_FQDN','COOLIFY_URL'])delete env[k];
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await call('/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(logs);
}
async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}}
async function call(path,method='GET',body,cookie,site=origin){return fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{Origin:site,'x-poulstar-action':'1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});}
try{
 await start();for(const [path,status] of [['/',200],['/api/health',200],['/.env',404],['/api/requests',401]])check((await call(path)).status===status);
 const password='Classroom-test-123';const cookies=[];
 for(const username of ['student_a','student_b']){
  check((await call('/api/auth/register','POST',{username,password})).status===201);
  const r=await call('/api/auth/login','POST',{username,password});check(r.status===200);const c=r.headers.get('set-cookie');check(c.includes('Secure')&&c.includes('HttpOnly'));cookies.push(c.split(';')[0]);
 }
 check((await call('/api/requests','POST',{name:'درخواست آزمایشی'},cookies[0],'https://evil.example')).status===403);
 check((await call('/api/requests','POST',{name:'درخواست آزمایشی'},cookies[0])).status===201);
 for(let i=0;i<2;i++)check((await(await call('/api/requests','GET',undefined,cookies[i])).json()).requests.length===1-i);
 await stop();await start();check((await(await call('/api/requests','GET',undefined,cookies[0])).json()).requests.length===1);check(existsSync(join(dir,'events.jsonl')));
 console.log(`PASS: ${checks} checks; config, production startup, auth, secure cookies, origin guard, ownership, restart persistence.`);
}finally{await stop();rmSync(dir,{recursive:true,force:true});}
