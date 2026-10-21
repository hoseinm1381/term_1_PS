export type RequestItem={id:string;name:string;done:boolean;owner_id:string|null;ownerName:string|null};
export class ApiError extends Error{
 constructor(message:string,public status:number,public requestId?:string){super(message+(requestId?' (کد پیگیری: '+requestId+')':''));}
}
export function faultReference(error:unknown){return error instanceof ApiError&&error.requestId?' کد پیگیری: '+error.requestId:'';}
async function jsonApi(path:string,method='GET',data?:unknown,timeout=8000){
 let response:Response;
 try{response=await fetch('/api'+path,{method,signal:AbortSignal.timeout(timeout),headers:{...(method==='GET'?{}:{'X-Poulstar-Action':'1'}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)})}
 catch{throw new ApiError('ارتباط برقرار نشد؛ دوباره ارتباط را بررسی کن.',0)}
 const rawId=response.headers.get('X-Request-ID')||'',id=/^[0-9a-f-]{36}$/i.test(rawId)?rawId:undefined;
 let payload;try{payload=await response.json()}catch{throw new ApiError('پاسخ سرور JSON معتبر نیست.',502,id)}
 if(!response.ok)throw new ApiError(typeof payload?.error==='string'?payload.error:'پاسخ سرور معتبر نیست.',response.status,id);
 return {payload,id};
}
export async function requestApi(path:string,method='GET',data?:unknown):Promise<RequestItem[]>{
 const {payload:p,id}=await jsonApi(path,method,data);
 if(!Array.isArray(p?.requests)||p.requests.some((x:RequestItem)=>!x||typeof x.id!=='string'||typeof x.name!=='string'||typeof x.done!=='boolean'||!(x.owner_id===null||typeof x.owner_id==='string')||!(x.ownerName===null||typeof x.ownerName==='string')))throw new ApiError('ساختار فهرست معتبر نیست.',502,id);
 if(new Set(p.requests.map((x:RequestItem)=>x.id)).size!==p.requests.length)throw new ApiError('شناسه تکراری در پاسخ.',502,id);return p.requests;
}
export type User={id:string;username:string;role:'student'|'manager'};
export async function authApi(path:string,method='GET',data?:unknown):Promise<{user?:User}>{
 const {payload:p,id}=await jsonApi('/auth/'+path,method,data);
 if(['me','login'].includes(path)&&(!p?.user||typeof p.user.id!=='string'||typeof p.user.username!=='string'||!['student','manager'].includes(p.user.role)))throw new ApiError('حساب معتبر دریافت نشد.',502,id);return p;
}
export type AiUsage={mode:'live'|'fixture'|'off';enabled:boolean;used:number;remaining:number;globalRemaining:number;reservedUsd:number;budgetUsd:number};
export type Suggestion={suggestedName:string;question:string};
export async function aiApi(path:string,method='GET',data?:unknown):Promise<{suggestion?:Suggestion;mode?:string;usage?:AiUsage}&Partial<AiUsage>>{
 const {payload:p,id}=await jsonApi('/ai/'+path,method,data,15000),u=path==='status'?p:p?.usage;
 if(!u||!['live','fixture','off'].includes(u.mode)||typeof u.enabled!=='boolean'||!Number.isFinite(u.used)||!Number.isFinite(u.remaining)||!Number.isFinite(u.globalRemaining)||!Number.isFinite(u.reservedUsd)||!Number.isFinite(u.budgetUsd))throw new ApiError('ساختار مصرف معتبر نیست.',502,id);
 if(path==='suggest'&&(!p.suggestion||typeof p.suggestion.suggestedName!=='string'||!p.suggestion.suggestedName.trim()||p.suggestion.suggestedName.length>80||typeof p.suggestion.question!=='string'||p.suggestion.question.length>120))throw new ApiError('پیشنهاد معتبر نیست.',502,id);return p;
}
