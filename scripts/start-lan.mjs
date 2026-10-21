// A short private-network classroom test, not public deployment.
import {networkInterfaces} from 'node:os';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const isPrivate=ip=>{const p=ip.split('.').map(Number);return p.length===4&&p.every(x=>Number.isInteger(x)&&x>=0&&x<=255)&&(p[0]===10||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168))};
let interfaces=[];try{interfaces=Object.values(networkInterfaces()).flat()}catch{console.error('Cannot inspect network interfaces; instructor must verify a private IPv4.')}
const available=interfaces.filter(x=>x&&x.family==='IPv4'&&!x.internal&&isPrivate(x.address)).map(x=>x.address);
const chosen=process.argv[2]||(available.length===1?available[0]:undefined);
if(!chosen||!isPrivate(chosen)||(available.length>0&&!available.includes(chosen))){console.error('Choose one private IPv4 belonging to this computer: '+available.join(', '));process.exit(1)}
const port=process.env.WEB_PORT||5173;
console.log('Classroom URL: http://'+chosen+':'+port+' | test accounts only; stop when test ends.');
const child=spawn(process.execPath,['scripts/start.mjs'],{cwd:root,env:{...process.env,LAN_TEST_IP:chosen},stdio:'inherit'});
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>child.kill(sig));child.on('exit',code=>process.exit(code||0));
