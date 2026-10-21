import {writeEvent} from './logger.mjs';
import {existsSync,readFileSync,statSync} from 'node:fs';
const envPath=new URL('./.env',import.meta.url);if(existsSync(envPath))process.loadEnvFile(envPath);
import {createAssistant} from './ai.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
import {mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const production=process.env.NODE_ENV==='production';
import {configureProduction,allowedWriteOrigin} from './production-config.mjs';
const publicOrigin=configureProduction(process.env);
const dist=resolve(root,'dist');
if(production&&!existsSync(resolve(dist,'index.html')))throw new Error('Build output missing');
const dbPath=process.env.DB_FILE||resolve(root,'data/requests.sqlite');
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, name TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)), deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)), position INTEGER NOT NULL)');
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','manager')));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);`);
if(!db.prepare('PRAGMA table_info(requests)').all().some(c=>c.name==='owner_id'))db.exec('ALTER TABLE requests ADD COLUMN owner_id TEXT');
const assistant=createAssistant(db);
const one=db.prepare('SELECT * FROM requests WHERE id=?');
const list=(user)=>db.prepare(`SELECT r.id,r.name,r.done,r.owner_id,u.username AS ownerName FROM requests r LEFT JOIN users u ON u.id=r.owner_id WHERE r.deleted=0 ${user.role==='manager'?'':'AND r.owner_id=?'} ORDER BY r.position`).all(...(user.role==='manager'?[]:[user.id])).map(row=>({...row,done:Boolean(row.done)}));
const hash=token=>createHash('sha256').update(token).digest('hex');
const publicUser=user=>({id:user.id,username:user.username,role:user.role});
function authenticated(req){
 const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('poulstar_session='))?.slice(17);
 if(!token)fail(401,'برای ادامه وارد حساب خود شو.');
 const user=db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(hash(token),Date.now());
 if(!user)fail(401,'نشست پایان یافته است؛ دوباره وارد شو.');
 return user;
}
function cookie(res,token,age){res.setHeader('Set-Cookie',`poulstar_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`)}
function guard(req){
 if(req.headers['x-poulstar-action']!=='1')fail(403,'درخواست نوشتن معتبر نیست.');
 const allowed=['http://127.0.0.1:'+(process.env.WEB_PORT||5173),'http://localhost:'+(process.env.WEB_PORT||5173)];
 if(process.env.LAN_TEST_IP)allowed.push('http://'+process.env.LAN_TEST_IP+':'+(process.env.WEB_PORT||5173));
 if(production){
  if(!allowedWriteOrigin(req.headers.origin,req.headers.host,publicOrigin))fail(403,'مبدأ درخواست مجاز نیست.');
 }else if(req.headers.origin&&!allowed.includes(req.headers.origin))fail(403,'مبدأ درخواست مجاز نیست.');
}
const attempts=new Map();
function rate(req){
 const key=req.socket.remoteAddress;const now=Date.now();let item=attempts.get(key);
 if(!item||now-item.start>60000){item={start:now,count:0};attempts.set(key,item)}
 if(++item.count>20)fail(429,'تلاش‌های زیادی انجام شده؛ یک دقیقه صبر کن.');
}
function usernameOf(raw){if(typeof raw!=='string'||! /^[a-z][a-z0-9_]{2,23}$/.test(raw))fail(400,'نام کاربری: ۳ تا ۲۴ حرف کوچک انگلیسی، عدد یا زیرخط؛ شروع با حرف.');return raw}
function passwordOf(raw){if(typeof raw!=='string'||raw.length<12||raw.length>128)fail(400,'گذرواژه باید ۱۲ تا ۱۲۸ نویسه باشد.');return raw}
function fail(status,message){const error=new Error(message);error.status=status;throw error}
async function body(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'داده باید JSON باشد.');
 let text='',size=0;
 for await(const chunk of req){size+=chunk.length;if(size>16384)fail(413,'داده بیش از اندازه بزرگ است.');text+=chunk.toString()}
 let value;try{value=JSON.parse(text)}catch{fail(400,'JSON معتبر نیست.')}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'ساختار داده معتبر نیست.');
 return value;
}
function nameOf(raw){
 if(typeof raw!=='string')fail(400,'نام درخواست باید متن باشد.');
 const value=raw.trim();
 if(!value||value.length>80)fail(400,'نام درخواست باید بین ۱ تا ۸۰ نویسه باشد.');
 return value;
}
function fields(data,allowed){if(Object.keys(data).some(key=>!allowed.includes(key)))fail(400,'فیلد ناشناخته در داده وجود دارد.')}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
const server=http.createServer(async(req,res)=>{
 const requestId=randomUUID(),started=performance.now();let path='';
 res.setHeader('X-Request-ID',requestId);
 res.once('finish',()=>writeEvent({requestId,method:req.method,path,status:res.statusCode,durationMs:performance.now()-started}));
 try{
  path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&path==='/api/health'){
   db.prepare('SELECT 1').get();
   return send(res,200,{ok:true,release:process.env.RELEASE_ID||'local'});
  }
  if(production&&!path.startsWith('/api/')){
   if(!['GET','HEAD'].includes(req.method))return send(res,405,{error:'Method not allowed',requestId});
   let decoded;try{decoded=decodeURIComponent(path)}catch{fail(400,'Invalid URL')}
   const segments=decoded.split('/');
   if(segments.some(x=>x.startsWith('.')||['data','logs','backups','scripts','src','node_modules'].includes(x))||/\.(?:sqlite|db|mjs|toml|jsonl)(?:-|$)/i.test(decoded))fail(404,'Not found');
   let target=resolve(dist,'.'+decoded);
   if(target!==dist&&!target.startsWith(dist+'/'))fail(404,'Not found');
   if(!existsSync(target)||!statSync(target).isFile()){
    if(decoded.includes('.'))fail(404,'Not found');
    target=resolve(dist,'index.html');
   }
   const ext=target.split('.').pop();
   const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',ico:'image/x-icon',woff2:'font/woff2'}[ext]||'application/octet-stream';
   res.writeHead(200,{'Content-Type':mime,'Cache-Control':ext==='html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
   return res.end(req.method==='HEAD'?undefined:readFileSync(target));
  }
  if(!['GET','HEAD'].includes(req.method))guard(req);
  if(req.method==='POST'&&['/api/auth/register','/api/auth/login'].includes(path)){
   rate(req);const data=await body(req);fields(data,['username','password']);const username=usernameOf(data.username),password=passwordOf(data.password);
   let user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
   if(path.endsWith('register')){
    if(user)fail(409,'این نام کاربری قبلاً ثبت شده است.');
    const salt=randomBytes(16).toString('hex'),digest=(await derive(password,salt,64)).toString('hex');
    const id=randomUUID();db.prepare('INSERT INTO users(id,username,password_hash,salt) VALUES(?,?,?,?)').run(id,username,digest,salt);
    return send(res,201,{registered:true});
   }
   const digest=await derive(password,user?.salt||'invalid-account-salt',64);
   if(!user||!timingSafeEqual(digest,Buffer.from(user.password_hash,'hex')))fail(401,'نام کاربری یا گذرواژه درست نیست.');
   const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
   db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,Date.now()+8*60*60*1000);cookie(res,token,8*60*60);
   return send(res,200,{user:publicUser(user)});
  }
  if(req.method==='POST'&&path==='/api/auth/logout'){
   const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('poulstar_session='))?.slice(17);
   if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));cookie(res,'',0);return send(res,200,{ok:true});
  }
  const user=authenticated(req);
  if(req.method==='GET'&&path==='/api/auth/me')return send(res,200,{user:publicUser(user)});
  if(req.method==='GET'&&path==='/api/ai/status')return send(res,200,assistant.status(user.id));
  if(req.method==='POST'&&path==='/api/ai/suggest'){
   const data=await body(req);fields(data,['text']);return send(res,200,await assistant.suggest(user.id,data.text));
  }
  if(req.method==='GET'&&path==='/api/requests')return send(res,200,{requests:list(user)});
  if(req.method==='POST'&&path==='/api/requests'){
   const data=await body(req);fields(data,['name']);const name=nameOf(data.name);
   const id=randomUUID(),position=Number(db.prepare('SELECT COALESCE(MAX(position),0)+1 AS value FROM requests').get().value);
   db.prepare('INSERT INTO requests(id,name,position,owner_id) VALUES(?,?,?,?)').run(id,name,position,user.id);
   return send(res,201,{requests:list(user),item:{id,name,done:false}});
  }
  const match=path.match(/^\/api\/requests\/([0-9a-f-]{36})(\/restore)?$/i);
  if(!match)fail(404,'مسیر پیدا نشد.');
  const id=match[1],row=one.get(id);if(!row||(user.role!=='manager'&&row.owner_id!==user.id))fail(404,'درخواست پیدا نشد.');
  const isOwner=row.owner_id===user.id;
  if(req.method==='POST'&&match[2]){
   if(!isOwner)fail(403,'فقط مالک می‌تواند درخواست خود را بازگرداند.');
   const data=await body(req);fields(data,[]);
   if(!row.deleted)fail(409,'این درخواست حذف نشده است.');
   db.prepare('UPDATE requests SET deleted=0 WHERE id=?').run(id);
   return send(res,200,{requests:list(user)});
  }
  if(match[2])fail(405,'این روش برای مسیر مجاز نیست.');
  if(row.deleted)fail(404,'درخواست فعال پیدا نشد.');
  if(req.method==='PATCH'){
   const data=await body(req);fields(data,['name','done']);if(!Object.keys(data).length)fail(400,'تغییری ارسال نشده است.');
   if(Object.hasOwn(data,'name')&&!isOwner)fail(403,'ویرایش نام فقط برای مالک مجاز است.');
   if(Object.hasOwn(data,'done')&&user.role!=='manager')fail(403,'تغییر وضعیت فقط برای مسئول مجاز است.');
   const name=Object.hasOwn(data,'name')?nameOf(data.name):row.name;
   if(Object.hasOwn(data,'done')&&typeof data.done!=='boolean')fail(400,'وضعیت باید درست یا نادرست باشد.');
   const done=Object.hasOwn(data,'done')?Number(data.done):row.done;
   db.prepare('UPDATE requests SET name=?,done=? WHERE id=?').run(name,done,id);
   return send(res,200,{requests:list(user)});
  }
  if(req.method==='DELETE'){
   if(!isOwner)fail(403,'حذف فقط برای مالک مجاز است.');
   db.prepare('UPDATE requests SET deleted=1 WHERE id=?').run(id);
   return send(res,200,{requests:list(user)});
  }
  fail(405,'این روش برای مسیر مجاز نیست.');
 }catch(error){send(res,error.status||500,{error:error.status?error.message:'خطای سرور؛ دوباره ارتباط را بررسی کنید.',requestId})}
});
const port=Number(production?(process.env.PORT||3000):(process.env.API_PORT||3001));
server.listen(port,production?'0.0.0.0':'127.0.0.1',()=>console.log('Server listening on port '+port));
function close(){server.close(()=>{db.close();process.exit(0)})}
process.on('SIGTERM',close);process.on('SIGINT',close);
