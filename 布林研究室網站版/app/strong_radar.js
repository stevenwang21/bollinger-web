// v6.8 — Asynchronous one-click full-market scan in every supported session.
(()=>{
 'use strict';
 const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');
 panel.id='strongRadarPanel'; panel.className='radarPanel';
 panel.innerHTML=`
  <div class="radarNotice"><b id="radarNoticeTitle">🚀 全市場強勢／漲停雷達</b><span id="radarNoticeText">盤中找正在加速；盤後重新以收盤位置分級。雷達只代表研究優先度，不等於買點。</span><em id="radarModePill" class="radarModePill">準備中</em></div>
  <div class="radarToolbar">
   <div class="radarSegment" role="group" aria-label="雷達掃描範圍">
    <button type="button" data-scope="all" class="on">全上市櫃</button><button type="button" data-scope="core">電子科技</button>
   </div>
   <select id="radarLevel" aria-label="雷達等級"><option value="ALL">全部 L1～L4</option><option value="NEXT">★ 明日續強候選</option><option value="L4">L4 漲停／近漲停</option><option value="L3">L3 急拉攻擊</option><option value="L2">L2 強勢突破</option><option value="L1">L1 啟動預警</option></select>
   <input id="radarQ" type="text" placeholder="搜尋代號或名稱">
   <button class="btn" id="radarRefresh" type="button">▶ 一鍵掃描全市場</button>
  </div>
  <div id="radarScanStatus" class="radarScanStatus" role="status" aria-live="polite"></div>
  <a class="radarFailures" href="/api/radar_failures" target="_blank" rel="noopener">查看本輪缺報價清單</a>
  <div id="radarStats" class="radarStats"></div>
  <div class="radarLegend">
   <span class="radarBadge L4">L4</span><span>漲停／近漲停</span>
   <span class="radarBadge L3">L3</span><span>急拉攻擊</span>
   <span class="radarBadge L2">L2</span><span>強勢突破</span>
   <span class="radarBadge L1">L1</span><span>啟動預警</span>
   <span class="radarLegendNote" id="radarLegendNote">L1→L2→L3 的升級比「已經漲停」更值得提早注意。</span>
  </div>
  <div class="radarTableWrap">
   <table class="radarTable"><thead><tr>
    <th data-sort="level">等級</th><th data-sort="code" class="l">股票</th><th data-sort="price" id="radarPriceHead">現價</th><th data-sort="change_pct">漲幅%</th><th data-sort="dist_high_pct">距日高%</th><th data-sort="dist_limit_pct">距漲停%</th><th data-sort="volume">成交量</th><th data-sort="volume_per_min" id="radarVolHead">量速/分</th><th class="l">操作提醒</th>
   </tr></thead><tbody id="radarBody"></tbody></table>
   <div id="radarEmpty" class="radarEmpty">正在準備全市場雷達…</div>
  </div>`;
 document.body.append(panel);
 const $=id=>document.getElementById(id);
 let data={items:[],counts:{},coverage:0,universe_count:0,universe_complete:false,universe_status:'正在建立全市場清單',market_counts:{},rotation:{},mode:'intraday'}, scope='all', sortKey='level', sortDir=-1, busy=false, actionError='';
 const levelWeight={L4:4,L3:3,L2:2,L1:1};
 function fmt(v,d=2){const n=Number(v);return v!=null&&v!==""&&Number.isFinite(n)?n.toFixed(d):'—';}
 function intfmt(v){const n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():'—';}
 function isPost(){return data.mode==='postclose';}
 function filtered(){
  const lv=$('radarLevel')?.value||'ALL', q=($('radarQ')?.value||'').trim().toLowerCase();
  let rows=(data.items||[]).filter(x=>(scope==='all'||x.is_core)&&(lv==='ALL'||(lv==='NEXT'?x.next_day_candidate:x.level===lv))&&(!q||String(x.code).includes(q)||String(x.name||'').toLowerCase().includes(q)));
  rows.sort((a,b)=>{
   let av,bv;
   if(sortKey==='level'){av=levelWeight[a.level]||0;bv=levelWeight[b.level]||0;}
   else if(sortKey==='code'){av=String(a.code);bv=String(b.code);}
   else if(sortKey==='volume_per_min'&&isPost()){av=Number(a.volume_ratio20);bv=Number(b.volume_ratio20);}
   else {av=Number(a[sortKey]);bv=Number(b[sortKey]);}
   let c=0;
   if(typeof av==='string')c=av.localeCompare(bv,'zh-Hant',{numeric:true});
   else {const an=Number.isFinite(av),bn=Number.isFinite(bv);if(!an&&!bn)c=0;else if(!an)c=1;else if(!bn)c=-1;else c=av-bv;}
   if(c)return c*sortDir;
   return String(a.code).localeCompare(String(b.code),undefined,{numeric:true});
  });
  return rows;
 }
 function render(){
  const c=data.counts||{},r=data.rotation||{},cov=Number(data.coverage||0),total=Number(data.universe_count||0),fresh=Number(data.fresh_10m||0),post=isPost();
  $('radarModePill').textContent=data.offline?'離線快取':data.stale?'歷史行情':post?'盤後模式':data.clock_mode==='off'?'休市／非交易時段':'盤中模式'; $('radarModePill').dataset.mode=post?'postclose':'intraday';
  $('radarNoticeTitle').textContent=post?'📊 盤後強勢／明日續強雷達':'🚀 全市場強勢／漲停雷達';
  $('radarNoticeText').textContent=post?'13:35 後以來源回傳的資料日收盤位置重新分級；「明日續強候選」會再參考量比、MACD、突破與上影線，不代表隔日必漲。':'找「正在加速」的股票，不把漲停或急拉直接當買點；原 M/A/C 選股 SOP 與追價防護完全保留。';
  $('radarLegendNote').textContent=post?'盤後重點：收得靠近高點、量能健康、突破有效，才有較高明日研究優先度。':'L1→L2→L3 的升級比「已經漲停」更值得提早注意。';
  $('radarPriceHead').textContent=post?'收盤':'現價'; $('radarVolHead').textContent=post?'量比20日':'量速/分';
  const fullRunning=!!r.full_scan_running, scanDone=Number(r.full_scan_done||0), scanTotal=Number(r.full_scan_total||total||0);
  const btnBusy=busy||fullRunning;
  $('radarRefresh').disabled=btnBusy;
  $('radarRefresh').textContent=fullRunning?'全市場掃描中…':busy?'正在啟動…':'▶ 一鍵掃描全市場';
  $('radarScanStatus').dataset.state=(actionError||r.full_scan_error)?'warning':fullRunning?'running':'ready';
  $('radarScanStatus').textContent=actionError|| (fullRunning?`已處理 ${scanDone.toLocaleString()} / ${scanTotal.toLocaleString()}・本輪有效行情 ${Number(r.full_scan_quotes||0).toLocaleString()}・缺報價 ${Number(r.full_scan_missing||0).toLocaleString()}${r.full_scan_phase==='technicals'?'・補算候選技術指標中':''}`:r.full_scan_finished?`${r.full_scan_error||'本輪全市場掃描完成'}｜已處理 ${scanDone.toLocaleString()} / ${scanTotal.toLocaleString()}・有效行情 ${Number(r.full_scan_quotes||0).toLocaleString()}`:'按一次，自動處理全部股票；盤中看最新快照，盤後／休市看最近交易日。');
  const mc=data.market_counts||{}, complete=!!data.universe_complete;
  const shownDone=cov, shownTotal=total;
  const scanNote=data.stale||data.offline?'｜歷史／離線快取':'';
  $('radarStats').innerHTML=`
   <div><small>L4 漲停／近漲停</small><b>${c.L4||0}</b></div><div><small>L3 急拉攻擊</small><b>${c.L3||0}</b></div><div><small>L2 強勢突破</small><b>${c.L2||0}</b></div><div><small>L1 啟動預警</small><b>${c.L1||0}</b></div>
   <div class="radarCoverage ${complete?'universeOK':'universeBad'}"><small>${complete?'有效行情覆蓋':'⚠ 全市場清單尚未完整'}</small><b>${shownDone.toLocaleString()} / ${shownTotal?shownTotal.toLocaleString():'—'}</b><span>${complete?`${post?`明日續強候選 ${Number(data.next_day_count||0).toLocaleString()}｜資料日 ${h(data.data_date||'—')}${scanNote}`:`10分鐘內新鮮 ${fresh.toLocaleString()}｜資料日 ${h(data.data_date||'—')}${scanNote}`}｜上市 ${Number(mc.TW||0).toLocaleString()}・上櫃 ${Number(mc.TWO||0).toLocaleString()}`:h(data.universe_status||'正在重建全上市櫃清單')}</span></div>`;
  const rows=filtered();
  $('radarBody').innerHTML=rows.map(x=>{
   const ch=Number(x.change_pct), cls=ch>0?'up':ch<0?'down':'';
   const limit=x.at_limit?'漲停':x.dist_limit_pct!=null?fmt(x.dist_limit_pct):'—';
   const volMetric=post?(x.volume_ratio20==null?'待技術補算':fmt(x.volume_ratio20)+'×'):(x.volume_per_min==null?'累積中':intfmt(x.volume_per_min));
   const next=x.next_day_candidate?`<span class="radarNext">★ 明日續強 ${Number(x.next_day_score||0)}分</span>`:'';
   const tech=post&&x.macd_state?`<small class="radarTech">${h(x.macd_state)}${x.rsi14!=null?'｜RSI '+fmt(x.rsi14,1):''}${x.break20?'｜20日新高':''}${x.break60?'｜60日新高':''}</small>`:'';
   return `<tr data-radar-code="${h(x.code)}"><td><span class="radarBadge ${h(x.level)}">${h(x.level)}</span><small>${h(x.label)}</small></td><td class="l"><b>${h(x.name)}</b><span class="code">${h(x.code)}${x.market==='TWO'?'・櫃':''}</span><small>${h(x.industry||'')}</small></td><td><b>${fmt(x.price)}</b></td><td class="${cls}"><b>${ch>0?'+':''}${fmt(ch)}</b></td><td>${fmt(x.dist_high_pct)}</td><td class="${x.at_limit?'radarLimit':''}">${limit}</td><td>${intfmt(x.volume)}</td><td>${volMetric}</td><td class="l radarSop">${next}${h(x.sop||'')}${tech}</td></tr>`;
  }).join('');
  $('radarEmpty').style.display=rows.length?'none':'block';
  if(rows.length===0){
   if((data.items||[]).length)$('radarEmpty').textContent='目前篩選條件沒有股票。';
   else if(data.clock_mode==='closing')$('radarEmpty').textContent='13:30～13:35 收盤資料整理中；13:35 後會自動切換盤後雷達。';
   else if(!data.universe_complete)$('radarEmpty').textContent='全市場股票池尚未完整：'+(data.universe_status||'程式會自動重試上市／上櫃公司清單，不會退回電子科技 948 檔。');
   else if(r.full_scan_running)$('radarEmpty').textContent=`全市場一鍵掃描中：${Number(r.full_scan_done||0).toLocaleString()} / ${Number(r.full_scan_total||total||0).toLocaleString()}。`;
   else $('radarEmpty').textContent='按「一鍵掃描全市場」後，程式會自動處理全部股票；若沒有 L1～L4，會保留有效行情覆蓋數。';
  }
  panel.querySelectorAll('th[data-sort]').forEach(th=>{th.classList.toggle('sorted',th.dataset.sort===sortKey);th.dataset.dir=th.dataset.sort===sortKey?(sortDir>0?'▲':'▼'):'';});
 }
 async function load(){
  try{const res=await fetch('/api/strong_radar',{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);data=await res.json();render();}catch(e){$('radarEmpty').style.display='block';$('radarEmpty').textContent='強勢雷達暫時無法取得資料：'+e.message;}
 }
 panel.querySelector('.radarSegment').onclick=e=>{const b=e.target.closest('button[data-scope]');if(!b)return;scope=b.dataset.scope;panel.querySelectorAll('.radarSegment button').forEach(x=>x.classList.toggle('on',x===b));render();};
 $('radarLevel').onchange=render;$('radarQ').oninput=render;
 panel.querySelector('thead').onclick=e=>{const th=e.target.closest('th[data-sort]');if(!th)return;const k=th.dataset.sort;if(sortKey===k)sortDir=-sortDir;else{sortKey=k;sortDir=['code','dist_high_pct','dist_limit_pct'].includes(k)?1:-1;}render();};
 $('radarBody').onclick=e=>{const tr=e.target.closest('tr[data-radar-code]');if(!tr)return;const code=tr.dataset.radarCode;if(document.getElementById('viewTab_single'))document.getElementById('viewTab_single').click();if($('ssaQ')){$('ssaQ').value=code;$('ssaGo')?.click();}};
 $('radarRefresh').onclick=async()=>{if(busy||data.rotation?.full_scan_running)return;busy=true;actionError='';$('radarRefresh').disabled=true;render();try{
  const res=await fetch('/api/radar_refresh',{method:'POST'}); const j=await res.json().catch(()=>({}));
  if(!res.ok||!j.ok){const why=j?.meta?.reason||j?.meta?.fallback_reason||j?.error||'本批未取得有效資料';actionError='無法啟動全市場掃描：'+why;}
  if(j?.radar){data=j.radar;render();}else await load();
 }catch(e){actionError='雷達更新失敗：'+e.message;}finally{busy=false;render();}};
 let loading=false;const originalLoad=load;load=async()=>{if(loading)return;loading=true;try{await originalLoad();}finally{loading=false;}};setTimeout(load,1000);setInterval(()=>{if(!document.hidden&&!document.getElementById('view_radar')?.hidden)load();},2000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
