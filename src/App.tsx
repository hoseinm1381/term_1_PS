import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { requestApi, ApiError, authApi, aiApi, faultReference } from './api';
import type { RequestItem, User, AiUsage, Suggestion } from './api';
type Store = { requests: RequestItem[]; lastDeleted: { item: RequestItem; index: number } | null };
type View = 'home' | 'create' | 'manage';
type StatusFilter = 'all' | 'pending' | 'done';
type Editing = { id: string; name: string; error: string } | null;
const fa = (n: number) => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const validateRequestName = (raw: string) => raw.trim();

export default function App() {
  const [user,setUser]=useState<User|null>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [authBusy,setAuthBusy]=useState(false);
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [authMessage,setAuthMessage]=useState('');
  const [registerMode,setRegisterMode]=useState(false);
  const [draft,setDraft]=useState('');
  const [suggestion,setSuggestion]=useState<Suggestion|null>(null);
  const [aiUsage,setAiUsage]=useState<AiUsage|null>(null);
  const [aiBusy,setAiBusy]=useState(false);
  const [aiStatusBusy,setAiStatusBusy]=useState(false);
  const [aiStatusError,setAiStatusError]=useState(false);
  const aiStatusFlight=useRef(false);
  const accountGeneration=useRef(0);
  const [aiMessage,setAiMessage]=useState('');
  const aiFlight=useRef(false);
  const [store, setStore] = useState<Store>({ requests: [], lastDeleted: null });
  const [view, setView] = useState<View>('home');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);
  const { requests, lastDeleted } = store;
  const doneCount = requests.filter(item => item.done).length;
  // Derived display: filtering never removes data from the requests State.
  const visibleRequests = requests.filter(item =>
    item.name.toLocaleLowerCase('fa').includes(query.trim().toLocaleLowerCase('fa')) &&
    (statusFilter === 'all' || (statusFilter === 'done' ? item.done : !item.done))
  );
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    document.getElementById('heading-' + view)?.focus();
  }, [view]);
  useEffect(() => {
    if (editing) document.getElementById('edit-' + editing.id)?.focus();
  }, [editing?.id]);
  useEffect(() => {
    if (confirmId) document.getElementById('cancel-delete-' + confirmId)?.focus();
  }, [confirmId]);

  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [listRefreshed, setListRefreshed] = useState(false);
  const inFlight = useRef(false);
  async function loadRequests() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setListRefreshed(false);
    try { const rows = await requestApi('/requests'); setStore(previous => ({...previous, requests: rows})); setHasLoaded(true); setReady(true); setConnectionError(''); setListRefreshed(true); }
    catch(e) { if(e instanceof ApiError&&e.status===401){clearAccount();setAuthMessage('نشست تمام شد؛ دوباره وارد شو.');return;} setReady(false); setConnectionError('ارتباط با سرور برقرار نشد. پس از بررسی ارتباط، دوباره دریافت کن.'+faultReference(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function clearAccount(){accountGeneration.current++;setAiStatusError(false);setDraft('');setSuggestion(null);setAiUsage(null);setAiMessage('');setUser(null);setUsername('');setPassword('');setRegisterMode(false);setStore({requests:[],lastDeleted:null});setName('');setEditing(null);setConfirmId(null);setQuery('');setStatusFilter('all');setSuccess('');setFeedback('');setReady(false);setHasLoaded(false);setListRefreshed(false);setConnectionError('');setView('home');}
  useEffect(()=>{authApi('me').then(p=>setUser(p.user!)).catch(e=>{if(!(e instanceof ApiError&&e.status===401))setAuthMessage('ارتباط با سرور برقرار نشد؛ ورود را دوباره امتحان کن.');}).finally(()=>setAuthLoading(false));},[]);
  useEffect(()=>{if(user)void loadRequests();},[user?.id]);
  async function submitAuth(e:FormEvent){e.preventDefault();if(authBusy)return;setAuthBusy(true);setAuthMessage('');
   try {const p=await authApi(registerMode?'register':'login','POST',{username,password});setPassword('');if(registerMode){setRegisterMode(false);setAuthMessage('حساب ساخته شد؛ اکنون وارد شو.');}else {setUser(p.user!);setAuthMessage('');}}
   catch(e){setAuthMessage(e instanceof ApiError?e.message:'ارتباط برقرار نشد؛ نتیجه را بررسی و دوباره امتحان کن.');}finally{setAuthBusy(false);}
  }
  async function logout(){if(busy||authBusy||aiFlight.current||aiStatusFlight.current)return;setAuthBusy(true);try{await authApi('logout','POST',{});clearAccount();setPassword('');setAuthMessage('از حساب خارج شدی.');}catch{setConnectionError('خروج تأیید نشد؛ دوباره تلاش کن.');}finally{setAuthBusy(false);}}

  async function loadAiStatus(silent=false){
   if(aiStatusFlight.current)return;const generation=accountGeneration.current;
   aiStatusFlight.current=true;setAiStatusBusy(true);
   try{const data=await aiApi('status');if(generation!==accountGeneration.current)return;setAiUsage(data as AiUsage);setAiStatusError(false);if(!silent)setAiMessage('وضعیت کمک هوشمند دریافت شد؛ متن نیازت محفوظ است.');}
   catch(e){if(generation!==accountGeneration.current)return;if(e instanceof ApiError&&e.status===401){clearAccount();setAuthMessage('نشست تمام شد؛ دوباره وارد شو.');}else{setAiStatusError(true);if(!silent){setAiUsage(null);setAiMessage('اطلاعات کمک هوشمند دریافت نشد؛ بررسی دوباره را بزن یا نام را خودت بنویس.'+faultReference(e));}}}
   finally{aiStatusFlight.current=false;setAiStatusBusy(false);}
  }
  useEffect(()=>{if(user)void loadAiStatus();},[user?.id]);
  async function suggestName(){
   if(aiFlight.current||aiStatusFlight.current||!user)return;
   if(!draft.trim()||draft.length>300){setAiMessage('نیاز را در ۱ تا ۳۰۰ نویسه بنویس.');return;}
   aiFlight.current=true;setAiBusy(true);setSuggestion(null);setAiMessage('');
   try{const data=await aiApi('suggest','POST',{text:draft});setSuggestion(data.suggestion!);setAiUsage(data.usage!);setAiMessage('پیشنهاد را با نیاز اصلی مقایسه کن؛ هنوز چیزی ثبت نشده است.');}
   catch(e){if(e instanceof ApiError&&e.status===401){clearAccount();setAuthMessage('نشست تمام شد؛ دوباره وارد شو.');}else{setAiMessage(e instanceof ApiError?e.message:'پاسخ پیشنهاد نرسید؛ نام درخواست را خودت بنویس.');void loadAiStatus(true);}}
   finally{aiFlight.current=false;setAiBusy(false);}
  }
  async function change(path: string, method: string, data: unknown, success: (rows: RequestItem[]) => void) {
    if (inFlight.current || !ready) return;
    inFlight.current = true; setBusy(true);
    try { const rows = await requestApi(path, method, data); success(rows); setConnectionError(''); }
    catch (e) {
      if(e instanceof ApiError&&e.status===401){clearAccount();setAuthMessage('نشست تمام شد؛ دوباره وارد شو.');return;}
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setConnectionError(e.message);
      } else {
        setReady(false);
        setConnectionError('پاسخ ذخیره دریافت نشد؛ نتیجه قطعی نیست. ابتدا دوباره فهرست را دریافت و وضعیت درخواست را بررسی کن.'+faultReference(e));
      }
    } finally { inFlight.current = false; setBusy(false); }
  }
  function register(event: FormEvent) {
    event.preventDefault(); setSuccess('');
    const cleaned = validateRequestName(name);
    if (!cleaned || cleaned.length > 80) { setError('نام وسیله را بنویس؛ حداکثر ۸۰ نویسه.'); inputRef.current?.focus(); return; }
    setError('');
    void change('/requests', 'POST', {name: cleaned}, rows => {
      setStore(previous => ({...previous, requests: rows}));
      setName(''); setSuccess('درخواست «' + cleaned + '» در سرور ذخیره شد.'); inputRef.current?.focus();
    });
  }
  function toggleRequest(id: string) {
    const item = requests.find(row => row.id === id); if (!item) return;
    void change('/requests/' + id, 'PATCH', {done: !item.done}, rows => setStore(previous => ({...previous, requests: rows})));
  }
  function saveName(id: string) {
    if (!editing || editing.id !== id) return;
    const cleaned = validateRequestName(editing.name);
    if (!cleaned || cleaned.length > 80) { setEditing({...editing, error: 'نام درخواست را بنویس؛ حداکثر ۸۰ نویسه.'}); return; }
    void change('/requests/' + id, 'PATCH', {name: cleaned}, rows => {
      setStore(previous => ({...previous, requests: rows})); setEditing(null); searchRef.current?.focus();
    });
  }
  function removeRequest(id: string) {
    const index = requests.findIndex(item => item.id === id); if (index < 0) return;
    const item = requests[index];
    void change('/requests/' + id, 'DELETE', undefined, rows => {
      setStore({requests: rows, lastDeleted: {item, index}});
      setConfirmId(null); setEditing(null); setFeedback('حذف در سرور انجام شد؛ آخرین حذف این نوبت قابل بازگردانی است.'); searchRef.current?.focus();
    });
  }
  function undoDelete() {
    if (!lastDeleted) return;
    void change('/requests/' + lastDeleted.item.id + '/restore', 'POST', {}, rows => {
      setStore({requests: rows, lastDeleted: null}); setFeedback('درخواست در سرور بازگردانده شد.'); searchRef.current?.focus();
    });
  }
  const labels: Record<View, string> = { home: 'خانه', create: 'ثبت درخواست', manage: 'مدیریت درخواست‌ها' };
  if(authLoading)return <main><h1>درخواست وسایل کلاس</h1><p role="status">در حال بررسی حساب…</p></main>;
  if(!user)return <main><header><h1>درخواست وسایل کلاس</h1><p>هر درخواست یک صاحب دارد.</p></header><section><h2>{registerMode?'ساخت حساب':'ورود'}</h2>
   <form onSubmit={submitAuth}><fieldset disabled={authBusy}><label htmlFor="username">نام کاربری</label><input id="username" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required pattern="[a-z][a-z0-9_]{2,23}"/><p>۳ تا ۲۴ حرف کوچک انگلیسی، عدد یا زیرخط؛ شروع با حرف.</p><label htmlFor="password">گذرواژه</label><input id="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={registerMode?'new-password':'current-password'} required minLength={12} maxLength={128}/><p>۱۲ تا ۱۲۸ نویسه؛ برای تمرین از گذرواژه تازه استفاده کن.</p><button type="submit">{registerMode?'ساخت حساب':'ورود به حساب'}</button></fieldset></form>
   <p role="status">{authBusy?'در حال ارتباط…':authMessage}</p><button disabled={authBusy} onClick={()=>{setRegisterMode(!registerMode);setPassword('');setAuthMessage('');}}>{registerMode?'حساب دارم؛ ورود':'حساب تازه بساز'}</button></section></main>;
  return <main>
    <header><h1>درخواست وسایل کلاس</h1><p>اینجا می‌توانیم درخواست وسایل کلاس را ثبت کنیم.</p></header>
    <p>حساب: <b>{user.username}</b> • نقش: {user.role==='manager'?'مسئول':'هنرجو'} <button disabled={busy||authBusy||aiBusy||aiStatusBusy} onClick={()=>void logout()}>خروج از حساب</button></p>
    <div className="connection" aria-live="polite">
      {busy && <p role="status">در حال ارتباط با سرور…</p>}
      {connectionError && <p role="alert">{connectionError}</p>}
      {(!ready || connectionError) && <button type="button" disabled={busy} onClick={() => void loadRequests()}>دریافت دوباره فهرست</button>}
    </div>
    <nav aria-label="صفحه‌های برنامه">{(['home', 'create', 'manage'] as View[]).map(key =>
      <button key={key} type="button" aria-controls={'view-' + key} aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>{labels[key]}</button>
    )}</nav>
    <section id="view-home" hidden={view !== 'home'} className="app-view" aria-labelledby="heading-home">
      <h2 id="heading-home" tabIndex={-1}>از اینجا شروع کن</h2><p>{user.role==='manager'?'درخواست‌ها را در مدیریت بررسی کن و وضعیتشان را تغییر بده.':'یک درخواست ثبت کن؛ بعد در مدیریت، پیدایش کن و وضعیت تازه‌اش را ببین.'}</p>
      <div className="summary-cards"><div>کل درخواست‌ها<strong id="total-count">{hasLoaded ? fa(requests.length) : '-'}</strong></div><div>انجام‌شده<strong id="done-count">{hasLoaded ? fa(doneCount) : '-'}</strong></div></div>
      <button type="button" onClick={() => setView('create')}>شروع ثبت درخواست</button><button type="button" onClick={() => setView('manage')}>رفتن به مدیریت</button>
    </section>
    <section id="view-create" hidden={view !== 'create'} className="app-view" aria-labelledby="heading-create">
      <h2 id="heading-create" tabIndex={-1}>ثبت درخواست</h2><p>نام وسیله را بنویس؛ بعد درخواستت را در مدیریت پیدا کن.</p>
      <div className="ai-panel" aria-labelledby="ai-heading"><h3 id="ai-heading">کمک به نوشتن نام درخواست</h3>
       <p>فقط نیاز مربوط به وسیله را بنویس؛ اطلاعات شخصی لازم نیست. پیشنهاد بدون تأیید تو ثبت نمی‌شود.</p>
       <p id="ai-mode">{aiUsage?.mode==='fixture'?'حالت تمرینی: پاسخ ثابت برای آزمون؛ AI واقعی نیست.':aiUsage?.mode==='live'?'کمک هوشمند از API واقعی':'کمک هوشمند آماده نیست؛ ثبت دستی در دسترس است.'}</p>
       <button id="retry-ai-status" type="button" disabled={aiBusy||aiStatusBusy} onClick={()=>void loadAiStatus()}>{aiStatusBusy?'در حال بررسی کمک هوشمند…':'بررسی دوباره کمک هوشمند'}</button>
       {aiStatusError&&<p role="alert">دریافت وضعیت کامل نشد؛ بررسی دوباره فقط وضعیت را می‌خواند و پیشنهاد پولی نمی‌سازد.</p>}
       {aiUsage&&<p>سهم باقی‌مانده امروز: {fa(aiUsage.remaining)}؛ سقف این پروژه: ۵۰ تلاش در روز.</p>}
       <label htmlFor="ai-draft">توضیح نیاز برای پیشنهاد</label><textarea id="ai-draft" value={draft} maxLength={300} disabled={aiBusy} onChange={e=>{setDraft(e.target.value);setSuggestion(null);setAiMessage('');}} placeholder="مثل: برای نمایش فیلم یک کابل HDMI می‌خواهم"/>
       <button type="button" disabled={aiBusy||aiStatusBusy||aiStatusError||!aiUsage?.enabled||aiUsage.remaining<1||aiUsage.globalRemaining<1} onClick={()=>void suggestName()}>پیشنهاد نام با کمک هوشمند</button>
       <p aria-live="polite" role="status">{aiBusy?'در حال دریافت پیشنهاد…':aiMessage}</p>
       {suggestion&&<div className="ai-result"><p>نام پیشنهادی: <strong id="suggested-name">{suggestion.suggestedName}</strong></p>{suggestion.question&&<p>{suggestion.question}</p>}
        <button type="button" disabled={busy||aiBusy} onClick={()=>{setName(suggestion.suggestedName);setSuggestion(null);setSuccess('');setError('');setAiMessage('پیشنهاد در ورودی نام قرار گرفت؛ بررسی کن، سپس خودت ثبت کن.');inputRef.current?.focus();}}>استفاده از پیشنهاد</button>
        <button type="button" onClick={()=>{setSuggestion(null);setAiMessage('پیشنهاد کنار گذاشته شد؛ نام را خودت بنویس.');}}>کنار گذاشتن پیشنهاد</button></div>}
      </div>
      <form onSubmit={register} noValidate><fieldset disabled={busy || !ready}><label htmlFor="item-name">نام وسیله</label>
        <input id="item-name" ref={inputRef} value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="مثل: کابل برای کلاس" aria-required="true" aria-invalid={Boolean(error)} aria-describedby="error-message" />
        <p id="error-message" className="error" role="alert">{error}</p><button type="submit">ثبت درخواست</button>
      </fieldset></form>
      <p id="registered-message" role="status">{success}</p><button type="button" onClick={() => setView('manage')}>مشاهده درخواست‌ها</button>
    </section>
    <section id="view-manage" hidden={view !== 'manage'} className="app-view" aria-labelledby="heading-manage">
      <h2 id="heading-manage" tabIndex={-1}>درخواست‌ها</h2>
      <button id="refresh-requests" type="button" disabled={busy||authBusy||aiBusy||aiStatusBusy} onClick={()=>void loadRequests()}>{busy?'در حال دریافت فهرست…':'دریافت تازه‌ترین وضعیت'}</button>
      <p id="list-freshness" role="status">{listRefreshed&&ready?'فهرست در آخرین دریافت به‌روز شد؛ تغییر بعدیِ مسئول را با دریافت تازه بررسی کن.':''}</p>
      <label htmlFor="search-name">جست‌وجوی درخواست</label>
      <input id="search-name" ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="بخشی از نام را بنویس" />
      <label htmlFor="status-filter" className="filter-label">نمایش وضعیت</label>
      <select id="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
        <option value="all">همه</option><option value="pending">در انتظار</option><option value="done">انجام‌شده</option>
      </select>
      {(query!==''||statusFilter!=='all')&&<div className="filter-summary"><p id="filter-count" role="status">{hasLoaded?'نمایش '+fa(visibleRequests.length)+' از '+fa(requests.length)+' درخواست؛ فیلتر فعال است.':'فیلتر فعال است؛ فهرست هنوز دریافت نشده است.'}</p><button id="clear-filters" type="button" onClick={()=>{setQuery('');setStatusFilter('all');searchRef.current?.focus();}}>پاک‌کردن جست‌وجو و فیلتر</button></div>}
      {!hasLoaded ? <p>فهرست هنوز از سرور دریافت نشده است.</p> : requests.length === 0 ? <><p id="empty-message" className="empty">هنوز درخواستی نداریم؛ از ثبت درخواست شروع کن.</p><button type="button" onClick={() => setView('create')}>اولین درخواست را ثبت کن</button></> :
        visibleRequests.length === 0 && <p id="no-results" className="empty" role="status">درخواستی با این جست‌وجو و وضعیت پیدا نشد؛ عبارت را پاک کن یا وضعیت را روی همه بگذار.</p>}
      <button id="undo-delete" type="button" disabled={!lastDeleted || busy || !ready} onClick={undoDelete}>بازگرداندن آخرین حذف</button><p id="delete-feedback" role="status">{feedback}</p>
      <ul id="requests">{visibleRequests.map(item =>
        <li key={item.id} className={item.done ? 'done' : ''}>
          <span className="request-title">{item.name}</span><span>مالک: {item.ownerName||'بدون مالک؛ از جلسه ششم'}</span><span className="status" aria-live="polite">{item.done ? 'انجام شد' : 'ثبت شد'}</span>
          {user.role==='manager' && <button className="toggle" type="button" disabled={busy || !ready} aria-label={(item.done ? 'بازگردان: ' : 'انجام شد: ') + item.name} aria-pressed={item.done} onClick={() => toggleRequest(item.id)}>{item.done ? 'بازگردان' : 'انجام شد'}</button>}
          {item.owner_id===user.id && <button className="edit-button" type="button" disabled={editing?.id === item.id || busy || !ready} aria-label={'ویرایش: ' + item.name} onClick={() => { setConfirmId(null); setEditing({ id: item.id, name: item.name, error: '' }); }}>ویرایش</button>}
          {item.owner_id===user.id && <button className="delete-button" type="button" disabled={busy || !ready} aria-label={'حذف: ' + item.name} onClick={() => { setEditing(null); setConfirmId(item.id); }}>حذف</button>}
          {editing?.id === item.id && <div className="edit-panel"><label htmlFor={'edit-' + item.id}>نام جدید درخواست</label>
            <input id={'edit-' + item.id} className="edit-input" disabled={busy} aria-label={'نام جدید درخواست: ' + item.name} aria-invalid={Boolean(editing.error)} aria-describedby={'edit-error-' + item.id} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={80} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveName(item.id); } if (e.key === 'Escape') { setEditing(null); searchRef.current?.focus(); } }} />
            <p id={'edit-error-' + item.id} className="error" role="alert">{editing.error}</p>
            <button type="button" disabled={busy || !ready} onClick={() => saveName(item.id)}>ذخیره</button><button type="button" disabled={busy} onClick={() => { setEditing(null); searchRef.current?.focus(); }}>انصراف</button>
          </div>}
          {confirmId === item.id && <div className="confirm-delete"><p>این درخواست حذف شود؟</p><button type="button" disabled={busy || !ready} onClick={() => removeRequest(item.id)}>تأیید حذف</button><button id={'cancel-delete-' + item.id} type="button" disabled={busy} onClick={() => { setConfirmId(null); searchRef.current?.focus(); }}>لغو حذف</button></div>}
        </li>
      )}</ul>
    </section>
    <p className="note">هنرجو درخواست‌های خودش را می‌بیند و نام آن‌ها را ویرایش یا حذف می‌کند؛ مسئول همه را می‌بیند و وضعیت را تغییر می‌دهد. داده قدیمیِ بدون مالک فقط برای مسئول دیده می‌شود. فرصت بازگردانی آخرین حذفِ این نوبت با بازکردن دوباره صفحه پاک می‌شود.</p>
  </main>;
}
