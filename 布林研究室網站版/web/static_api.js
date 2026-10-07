/* 布林研究室 · 網站版轉接層
 * 原程式向本機 Python 伺服器呼叫 /api/*；網站版沒有伺服器，
 * 這支程式攔截那些呼叫，改讀每天收盤後自動產生的 api/*.json。
 * 需要伺服器運算的按鈕（盤中快照、全市場掃描、5 年資料）改為說明訊息。
 */
(function(){
  'use strict';
  const ROOT=new URL('.',document.currentScript?.src||location.href).href;
  const realFetch=window.fetch.bind(window);
  const SITE_NOTE='網站版每個交易日收盤後自動更新資料';
  let statusCache=null,statusAt=0,radarCache=null,radarAt=0,dataPromise=null,dataStamp=null;

  const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
  async function file(name,mode='no-cache'){
    const res=await realFetch(ROOT+'api/'+name+'.json',{cache:mode});
    if(!res.ok)throw new Error('HTTP '+res.status);
    return res.json();
  }
  async function status(){
    if(!statusCache||Date.now()-statusAt>60000){statusCache=await file('status');statusAt=Date.now();}
    return statusCache;
  }
  async function stocks(){
    // 主畫面已載入的 RAW（同一份資料）優先，避免手機上重複解析大檔
    try{if(typeof RAW!=='undefined'&&Array.isArray(RAW)&&RAW.length)return RAW;}catch(_e){}
    const s=await status();
    if(!dataPromise||dataStamp!==s.updated_ts){dataStamp=s.updated_ts;dataPromise=file('data','default').then(j=>j.stocks||[]);}
    return dataPromise;
  }
  const copyStock=s=>{const x={...s};for(const k of ['d','o','h','l','cl','v'])x[k]=Array.isArray(s[k])?s[k].slice():[];return x;};

  async function singleStock(q){
    q=String(q||'').trim();
    if(!q)return json({error:'請輸入股票名稱或代號'},400);
    let base=q.toUpperCase(),forced=null;
    if(base.endsWith('.TWO')){base=base.slice(0,-4);forced='TWO';}else if(base.endsWith('.TW')){base=base.slice(0,-3);forced='TW';}
    let list=await stocks();
    if(forced)list=list.filter(s=>s.m===forced);
    const lower=q.toLowerCase();
    let hit=list.filter(s=>s.c===base||String(s.n||'').toLowerCase()===lower);
    if(!hit.length){
      const fuzzy=list.filter(s=>String(s.c).toLowerCase().includes(base.toLowerCase())||String(s.n||'').toLowerCase().includes(lower));
      if(fuzzy.length>1)return json({matches:fuzzy.slice(0,20).map(s=>({c:s.c,n:s.n,m:s.m,i:s.i})),source:'網站版上市／上櫃股票清單'});
      hit=fuzzy;
    }
    if(hit.length>1)return json({matches:hit.slice(0,20).map(s=>({c:s.c,n:s.n,m:s.m,i:s.i})),source:'網站版上市／上櫃股票清單'});
    if(!hit.length)return json({error:'網站資料中查無這檔上市／上櫃股票（可能新上市或歷史不足 30 根日K）'},404);
    const st=await status(),q2=st.quality||{},stock=copyStock(hit[0]),last=stock.d.at(-1);
    return json({stock,source:`網站每日更新 · Yahoo 日K ${last||'—'}`,
      refreshed_at:stock.history_fetched_at||stock.fetched_at||st.updated,
      response_at:new Date().toISOString(),fresh:last===q2.expected_weekday,provisional:false,
      calendar:q2.calendar,cache_reused:true,latest_trade_date:last,requested_trade_date:q2.expected_weekday,
      all_industries:true,stale_fallback:last<q2.expected_weekday});
  }

  // ---- 追蹤驗證：原本存在電腦的 cache，網站版改存在這台裝置的瀏覽器
  const TV_KEY='bb_web_tracking_validation';
  const tvStore=()=>{try{const j=JSON.parse(localStorage.getItem(TV_KEY)||'{}');return j&&typeof j.snapshots==='object'?j:{version:1,snapshots:{}};}catch(_e){return {version:1,snapshots:{}};}};
  function tvView(date){
    const snaps=tvStore().snapshots,dates=Object.keys(snaps).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const older=date?dates.filter(d=>d<date):dates;
    return {version:1,current_date:date||null,current:date?snaps[date]||null:null,previous:older.length?snaps[older.at(-1)]:null,dates:dates.slice(-30)};
  }
  function tvSave(body){
    if(!body||!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||!Array.isArray(body.items))throw new Error('追蹤快照格式錯誤');
    const store=tvStore();
    const snapshot={date:body.date,saved_at:new Date().toISOString(),mode:String(body.mode||'auto').slice(0,24),
      items:body.items.slice(0,20).filter(x=>x&&x.code).map((x,i)=>({...x,rank:i+1,reasons:(x.reasons||[]).slice(0,4),risks:(x.risks||[]).slice(0,4)}))};
    store.snapshots[body.date]=snapshot;
    for(const old of Object.keys(store.snapshots).sort().slice(0,-90))delete store.snapshots[old];
    try{localStorage.setItem(TV_KEY,JSON.stringify(store));}catch(_e){}
    return {...tvView(body.date),ok:true,saved:snapshot};
  }

  async function handle(url,method,body){
    const u=new URL(url,location.href),path=u.pathname.replace(/^.*\/api\//,'/api/');
    if(method==='GET'){
      switch(path){
        case '/api/status':return json(await status());
        case '/api/data':{const s=await status();statusCache=s;return realFetch(ROOT+'api/data.json?u='+encodeURIComponent(s.updated_ts||''),{cache:'default'});}
        case '/api/strong_radar':
          if(!radarCache||Date.now()-radarAt>60000){radarCache=await file('strong_radar');radarAt=Date.now();}
          return json(radarCache);
        case '/api/live_patch':case '/api/failures':case '/api/radar_failures':case '/api/marketdata_config':
          return json(await file(path.slice(5)));
        case '/api/research_status':return json({state:'idle',available:false,stock_count:0,msg:'網站版未提供 5 年長期資料，回測使用目前畫面的日K'});
        case '/api/research_data':return json({error:'網站版未提供 5 年長期資料'},404);
        case '/api/tracking_validation':return json(tvView(u.searchParams.get('date')));
        case '/api/single_stock':return singleStock(u.searchParams.get('q'));
      }
      return json({error:'not found'},404);
    }
    let payload={};try{payload=body?JSON.parse(body):{};}catch(_e){}
    const st=await status().catch(()=>({}));
    switch(path){
      case '/api/refresh':statusAt=0;notice('已重新讀取網站上的最新資料。'+SITE_NOTE+'。');return json({started:false});
      case '/api/live_refresh':case '/api/live_watchdog':
        return json({ok:false,watchdog:'disabled',reason:'網站版不提供盤中即時快照；'+SITE_NOTE,quality:st.quality||{},live_market:{},auto_live:st.auto_live||{}});
      case '/api/priority_refresh':return json({ok:false,meta:{reason:'網站版不提供盤中快速刷新'},live_revision:0});
      case '/api/radar_refresh':radarAt=0;notice('已重新讀取雷達。網站版強勢雷達於每個交易日收盤後自動掃描全市場。');return json({ok:true,meta:{reason:'網站版的強勢雷達會在每個交易日收盤後自動掃描全市場'},radar:await file('strong_radar')});
      case '/api/marketdata_config':return json({ok:false,error:'網站版不能設定行情來源'},400);
      case '/api/research_refresh':return json({started:false});
      case '/api/tracking_validation':try{return json(tvSave(payload));}catch(e){return json({ok:false,error:e.message},400);}
      case '/api/quit':return json({ok:true});
    }
    return json({error:'not found'},404);
  }

  window.fetch=function(input,init={}){
    const url=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
    if(typeof url==='string'&&/^(?:\/|\.\/)?api\/|\/api\//.test(url)&&new URL(url,location.href).origin===location.origin){
      const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      return handle(url,method,init?.body);
    }
    return realFetch(input,init);
  };

  // ---- 小提示
  function notice(text){
    let el=document.getElementById('webNotice');
    if(!el){el=document.createElement('div');el.id='webNotice';el.setAttribute('role','status');document.body.appendChild(el);}
    el.textContent=text;el.classList.add('show');clearTimeout(notice.t);notice.t=setTimeout(()=>el.classList.remove('show'),4200);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    document.documentElement.classList.add('web-edition');
    const refresh=document.getElementById('btnRefresh');
    if(refresh){refresh.textContent='重新載入';refresh.title=SITE_NOTE;}
    document.querySelectorAll('a[href$="/api/failures"],a[href="/api/failures"]').forEach(a=>a.href=ROOT+'api/failures.json');
    const header=document.querySelector('header');
    if(header){
      const tag=document.createElement('div');tag.id='webBadge';
      tag.innerHTML='<b>網站版</b><span>每個交易日收盤後自動更新</span>';
      header.querySelector('h1')?.after(tag);
      status().then(s=>{if(s.site_build)tag.title='網站更新於 '+s.site_build.replace('T',' ').slice(0,16);}).catch(()=>{});
    }
    // 動態產生的連結與按鈕
    new MutationObserver(()=>{
      document.querySelectorAll('a.radarFailures[href^="/api/"]').forEach(a=>a.href=ROOT+'api/radar_failures.json');
      const rb=document.getElementById('radarRefresh');if(rb&&rb.textContent.includes('一鍵掃描')){rb.textContent='↻ 重新讀取雷達';rb.title='網站版強勢雷達於每個交易日收盤後自動掃描全市場';}
    }).observe(document.body,{childList:true,subtree:true});
  });
})();
