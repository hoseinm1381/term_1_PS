import {defineConfig} from 'vite';
const apiPort=process.env.API_PORT||'3001';
export default defineConfig({server:{
 host:process.env.LAN_TEST_IP||'127.0.0.1',port:Number(process.env.WEB_PORT||5173),strictPort:true,
 proxy:{'/api':'http://127.0.0.1:'+apiPort},
 fs:{strict:true,deny:['.env','.env.*','**/.git/**','*.{crt,pem,key,p12,pfx,cer,der}','.npmrc','.yarnrc.yml','**/data/**','**/logs/**','**/backups/**','**/*.sqlite*','**/*.jsonl','**/*.jsonl.*']}
}});
