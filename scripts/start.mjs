import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const api=spawn(process.execPath,['server.mjs'],{cwd:root,stdio:'inherit'});
let web;
async function start(){
 const port=process.env.API_PORT||3001;
 for(let i=0;i<80;i++){
  if(api.exitCode!==null)throw Error('API did not start');
  try{if((await fetch('http://127.0.0.1:'+port+'/api/health')).ok){
   web=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{cwd:root,stdio:'inherit'});
   web.on('exit',code=>{api.kill();process.exit(code||0)});return;
  }}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('API readiness timeout');
}
api.on('exit',code=>{if(web)web.kill();process.exit(code||0)});
function stop(){web?.kill();api.kill()}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
start().catch(e=>{console.error(e.message);stop();process.exit(1)});
