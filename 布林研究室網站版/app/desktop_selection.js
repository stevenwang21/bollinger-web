// v6.4 data-refresh optimization: realtime provider, de-duplicated scoring, segmented research candidates.
const GROUPS={K:'中軌突破',M:'M 中軌動能',A:'A 延續確認',N:'新突破・健康',H:'新突破・過熱觀察',V:'價格符合・量能未達',B:'B 強勢延伸',C:'C 量縮／整理',D:'D 突破轉弱',Q:'Q3 資料異常',ALL:'全部追蹤',NONE:'未入候選'};
let screenMode=store.get('bb_screen','strategy'),selectedGroup='M',dataStatusFilter='',dailyBiasFilter=store.get('bb_daily_bias_filter',''),asOf='',rankMode='rules';
let strategySortKey=store.get('bb_strategy_sort_key',''),strategySortDir=Number(store.get('bb_strategy_sort_dir',-1));
if(!Number.isFinite(strategySortDir)||![-1,1].includes(strategySortDir))strategySortDir=-1;
let timingMode=store.get('bb_timing_mode','intraday');
if(!['intraday','close'].includes(timingMode))timingMode='intraday';
function taipeiClock(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 return {today:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)};
}
function expectedVolumeFraction(minutes){
 // Conservative U-shaped cumulative-volume curve for early-warning only.  It avoids
 // comparing a 10:00 cumulative volume directly with a full-day 20-day average.
 const pts=[[540,.08],[555,.18],[570,.28],[600,.42],[660,.60],[720,.72],[780,.86],[810,1.0]];
 if(minutes<=pts[0][0])return pts[0][1];if(minutes>=pts.at(-1)[0])return 1;
 for(let i=1;i<pts.length;i++)if(minutes<=pts[i][0]){const [x0,y0]=pts[i-1],[x1,y1]=pts[i];return y0+(y1-y0)*(minutes-x0)/(x1-x0);}
 return 1;
}
function provisionalView(){return timingMode==='intraday'&&quality.calendar?.session==='intraday'&&(asOf||quality.latest_bar)===taipeiClock().today;}
function groupLabel(k){if(k==='K')return GROUPS[k]+(provisionalView()?'（盤中暫估）':'');return GROUPS[k]+(provisionalView()&&!['Q','ALL','NONE','V'].includes(k)?'（盤中已判定）':'');}
function timingLabel(){return provisionalView()?'盤中已判定・依最新下載快照':asOf?'歷史回看':timingMode==='close'?'收盤後確認（時間檢查，非官方驗證）':'盤中模式・目前顯示非今日資料';}
let marketDates=[],RESEARCH_ROWS=[],researchSignature='',researchByCode=new Map();
let legacyDetail=store.get('bb_legacy_detail',false);
// Expire an idle snapshot even when the backend revision has not changed.
setInterval(()=>{if(RAW.length&&!asOf)recompute();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&RAW.length&&!asOf)recompute();});
let maxAge=Number(store.get('bb_max_age',15));if(!Number.isFinite(maxAge))maxAge=15;maxAge=Math.max(5,Math.min(120,maxAge));
let SP={...SelectionRules.defaults,...store.get('bb_rules_v1',{})};
const bounds={breakVolume:[0.1,20],amount:[0,1000000],holdVolume:[0.1,20],retention:[0,5],maxGain:[0,100],maxDistance:[0,30],tracking:[1,30]};
for(const [k,[lo,hi]] of Object.entries(bounds)){const v=Number(SP[k]);SP[k]=Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):SelectionRules.defaults[k];}
SP.tracking=Math.round(SP.tracking);
const saved={recompute,applyFilters,renderTable,sortView,drawSelected};
const controls=document.createElement('div');controls.innerHTML=`
<h3>選股模式</h3><select id="screenMode" style="width:100%;background:var(--bg);padding:7px"><option value="strategy">突破後追蹤（新版）</option><option value="legacy">原布林型態</option></select>
<div id="strategyControls"><h3>訊號確認模式</h3><select id="timingMode" style="width:100%;background:var(--bg);padding:7px"><option value="intraday">盤中更新即判定</option><option value="close">收盤後確認</option></select><p class="hint" style="margin-top:8px">更新資料完成即按最新價格與累計量判定，不必等收盤；來源可能延遲。量比仍比較過去完整交易日，不推估全天量。</p><div class="row"><label for="maxAge">盤中快照有效分鐘</label><input id="maxAge" type="number" min="5" max="120" value="${maxAge}"></div><h3>資料日期</h3><select id="asOf" style="width:100%;background:var(--bg);padding:7px"></select>
<div class="hint" style="margin-top:6px">回看只使用選定日期以前的K棒；不是策略回測。</div>
<div id="ruleGroups"></div><h3>資料品質分層</h3><div id="dataStatusGroups"></div><p class="hint" style="margin-top:7px">Q1＝等待本輪即時刷新；Q2＝已有今日價格但快照稍舊；Q3＝資料異常，停止策略判定。Q1／Q2仍可看技術結構，但不進高優先推薦。</p><h3>Daily Bias 方向篩選</h3><select id="dailyBiasFilter" style="width:100%;background:var(--bg);padding:7px"><option value="">全部方向</option><option value="bull">偏多：掃低收上／收破前高</option><option value="bear">偏空：掃高收下／收破前低</option><option value="neutral">中性：雙掃／區間等待</option></select><p class="hint" style="margin-top:7px">只做方向過濾，不直接產生買賣。正式進場仍需 SMC/SNR、布林、量價與 RR。</p>
<div class="hint" style="margin:8px 0;padding:8px;border:1px solid #C6C1D9;border-radius:12px;background:linear-gradient(180deg,#40375B,#40375B)"><b style="color:#C6C1D9">M 中軌動能引擎</b>：先找突破20日中軌、量價有效、距上軌仍有路徑的股票；M1 初啟動 → M2 強啟動 → M3 上軌攻擊監測。M組不是直接買點；盤中採保守分時量速換算，09:15前不升級M層級，收盤後自動回到完整日量。</div>
<details><summary>延續確認條件（可調整）</summary>
${[['breakVolume','突破日量比≥'],['amount','前20日估算均額≥萬元'],['holdVolume','確認日量比≥'],['retention','當日量／突破日量≥'],['maxGain','五日漲幅≤%'],['maxDistance','距上軌≤%'],['tracking','追蹤交易日數']].map(([k,t])=>`<div class="row"><label for="rule_${k}">${t}</label><input id="rule_${k}" type="number" value="${SP[k]}" min="${bounds[k][0]}" max="${bounds[k][1]}" step="${['tracking','amount'].includes(k)?1:0.1}"></div>`).join('')}
<button class="btn small" id="resetRules">恢復選股條件</button></details>
<p class="hint" style="margin:10px 0">固定20日／2倍標準差；突破前15日收斂、120日位階≤25%、帶寬擴張≥15%。R10.19A 保留原評分，新增中軌動能引擎：位置路徑25＋量價20＋動能20＋結構20＋風險15；M組只做早期研究候選，不取代A組上軌突破延續確認。MACD仍作確認／扣分，過熱突破不列追價候選。成交金額為估算值；評分僅供研究排序。</p>
<select id="rankMode" style="width:100%;background:var(--bg);padding:7px"><option value="rules">綜合研究分排序（組別內）</option><option value="return">自突破日漲幅排序</option></select>
<button class="btn small" id="exportAllRules" style="margin-top:8px">匯出全部股票與條件</button>
<p class="hint" style="margin-top:8px">新版追蹤不套用下方原型態的股價／量門檻；市場與產業仍可篩選。</p></div>`;
document.querySelector('aside').prepend(controls);
const notice=document.createElement('div');notice.id='strategyNotice';notice.style.cssText='padding:8px 16px;color:var(--muted);border-bottom:1px solid var(--line);font-size:17px';
document.querySelector('main').before(notice);
const marketDataPanel=document.createElement('section');marketDataPanel.id='marketDataPanel';marketDataPanel.style.cssText='padding:12px 16px;border:1px solid var(--line);border-radius:18px;background:var(--panel);display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:17px;box-shadow:var(--elev-1)';
marketDataPanel.innerHTML=`<b>行情來源</b><select id="mdProvider" style="background:var(--bg);padding:6px"><option value="auto">自動（Fugle→TWSE備援）</option><option value="fugle">Fugle優先（無權限改TWSE）</option><option value="yahoo">Yahoo日K（不做盤中快照）</option></select><input id="mdKey" type="password" placeholder="Fugle API Key（只存本機）" style="min-width:260px;background:var(--bg);padding:6px"><button id="mdSave" class="btn small">儲存來源</button><button id="mdLive" class="btn small">立即更新盤中快照</button><span style="color:var(--good);font-weight:700">全市場輪詢：每 45 秒約 80 檔</span><span id="mdAutoClock" style="color:var(--accent-ink);font-weight:700">自動更新狀態：讀取中…</span><span id="mdStatus" style="color:var(--muted)">讀取設定…</span>`;
notice.before(marketDataPanel);

let mdAutoLast=null;
function mdTime(ts){if(!ts)return'—';try{return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(Number(ts)*1000));}catch(_e){return'—';}}
function mdCountdown(sec){sec=Math.max(0,Math.floor(Number(sec)||0));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}
function renderAutoLiveStatus(a){
 mdAutoLast=a||mdAutoLast;if(!mdAutoLast||!$('mdAutoClock'))return;
 const x=mdAutoLast, now=Date.now()/1000, due=Number(x.next_due_ts||0), left=due?Math.max(0,Math.floor(due-now)):null;
 let state='等待';
 if(!x.provider_enabled)state='已停用';else if(!x.market_open)state='非盤中';else if(x.state==='updating')state='更新中';else if(x.state==='ok')state='正常';else if(x.state==='retry'||x.state==='error')state='失敗重試';else if(x.state==='waiting')state='等待';
 const last=x.last_success_ts?`上次 ${mdTime(x.last_success_ts)}`:'尚無成功紀錄';
 const next=(x.market_open&&x.provider_enabled&&due)?`下次 ${mdTime(due)}（${mdCountdown(left)}）`:'下次 —';
 const src=x.last_source?`｜${x.last_source} ${x.last_count||0}檔`:'';
 $('mdAutoClock').textContent=`自動更新：${state}｜${last}｜${next}${src}`;
 $('mdAutoClock').style.color=(x.state==='retry'||x.state==='error')?'var(--warn)':x.state==='updating'?'var(--accent)':'var(--accent-ink)';
}
window.updateAutoLiveUI=renderAutoLiveStatus;
setInterval(()=>renderAutoLiveStatus(mdAutoLast),1000);
let mdWatchdogBusy=false;
async function mdAutoWatchdog(){
 if(mdWatchdogBusy||document.hidden)return;
 mdWatchdogBusy=true;
 try{
   const s=await requestJSON('/api/status',{},12000,false);renderAutoLiveStatus(s.auto_live);
   const a=s.auto_live||{};
   if(a.market_open&&a.provider_enabled&&Number(a.overdue_seconds||0)>=30){
     $('mdStatus').textContent='後端排程逾時，前端保險機制正在補抓盤中資料…';
     const r=await requestJSON('/api/live_watchdog',{method:'POST'},45000,false);renderAutoLiveStatus(r.auto_live);
     if(r.ok||r.watchdog==='not_due')schedulePoll(0);
   }
 }catch(e){/* 主輪詢仍會重試；watchdog不覆蓋主要錯誤訊息 */}
 finally{mdWatchdogBusy=false;}
}
setInterval(mdAutoWatchdog,60000);
setTimeout(mdAutoWatchdog,5000);
async function loadMarketDataConfig(){try{const c=await requestJSON('/api/marketdata_config');$('mdProvider').value=c.provider||'auto';$('mdKey').value=c.has_fugle_key?'••••••••':'';const p=c.provider||'auto';if(p==='yahoo')$('mdStatus').textContent='Yahoo日K模式：盤中快照停用；可切回自動模式取得今日盤中資料';else if(c.has_fugle_key)$('mdStatus').textContent='Fugle Key 已設定；若全市場Snapshot方案無權限，會自動改用TWSE MIS｜盤中分批輪詢';else $('mdStatus').textContent='未設定Fugle Key；自動模式會使用TWSE MIS盤中快照｜分批輪詢';}catch(e){$('mdStatus').textContent='行情設定讀取失敗：'+e.message;}}
$('mdSave').onclick=async()=>{try{const body={provider:$('mdProvider').value,fugle_api_key:$('mdKey').value};const r=await requestJSON('/api/marketdata_config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const p=r.config.provider||'auto';$('mdStatus').textContent=p==='yahoo'?'已儲存：Yahoo日K模式，盤中快照停用':r.config.has_fugle_key?'已儲存：Fugle優先；Snapshot無權限時自動改用TWSE MIS｜分批輪詢':'已儲存：自動使用TWSE MIS盤中快照｜分批輪詢';schedulePoll(0);}catch(e){$('mdStatus').textContent='儲存失敗：'+e.message;}};
$('mdLive').onclick=async()=>{try{$('mdLive').disabled=true;$('mdStatus').textContent='正在取得今日盤中資料…';const r=await requestJSON('/api/live_refresh',{method:'POST'},45000,false);renderAutoLiveStatus(r.auto_live);const m=r.live_market||{},src=m.source||r.quality?.live_source||'盤中來源',cnt=m.count??r.quality?.live_count??0,why=m.fallback_reason||r.reason||m.reason||'';$('mdStatus').textContent=r.ok?`盤中快照已更新：${src}｜${cnt}檔${why?'｜'+why:''}`:`盤中更新失敗：${why||'來源未回傳有效資料；請確認網路或切換自動模式'}`;schedulePoll(0);}catch(e){$('mdStatus').textContent='盤中更新失敗：'+e.message;}finally{$('mdLive').disabled=false;}};
loadMarketDataConfig();
// Auto recommendation column: recalculated after every data refresh / recompute.
const recommendationPanel=document.createElement('section');recommendationPanel.id='recommendationPanel';recommendationPanel.style.cssText='padding:16px 18px 20px;border:1px solid var(--line);border-radius:22px;background:var(--panel);overflow:visible;max-height:none;box-shadow:var(--elev-1)';
// Keep every original function in its original place; recommendations live below the main workspace.
document.querySelector('main').after(recommendationPanel);
// v6.2: durable next-session validation panel. It sits immediately under the priority list.
const trackingValidationPanel=document.createElement('section');
trackingValidationPanel.id='trackingValidationPanel';
trackingValidationPanel.setAttribute('aria-label','追蹤驗證區');
trackingValidationPanel.innerHTML='<div class="trackEmpty"><b>追蹤驗證區準備中…</b><span>會自動備份當日優先研究清單，下一個資料日載入前一份快照並比較股價。</span></div>';
recommendationPanel.after(trackingValidationPanel);
// r8 enhancement: a dedicated recommendation chart sits immediately below the validation area.
const recommendationChartPanel=document.createElement('section');
recommendationChartPanel.id='recommendationChartPanel';
recommendationChartPanel.style.cssText='padding:0 18px 20px;border:1px solid var(--line);border-radius:22px;background:var(--panel);box-shadow:var(--elev-1);margin-top:14px';
recommendationChartPanel.innerHTML=`<div id="recChartHead" style="padding:14px 0 10px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:22px">候選股技術圖表</b><span style="color:var(--muted);font-size:17px">點上方候選個股，下方圖表立即切換</span></div><div id="recChartInfo" style="padding:4px 0 8px;font-size:17px;color:var(--muted);min-height:24px;font-variant-numeric:tabular-nums"></div><div id="recCanvasWrap" style="position:relative;min-height:560px;width:100%;overflow:hidden"><canvas id="recCv" style="position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y"></canvas></div><div id="recChartReasons" style="padding:10px 0 0;font-size:18px;line-height:1.65"></div>`;
trackingValidationPanel.after(recommendationChartPanel);
let recSelCode=null,recHoverX=null;
function recommendationReason(r){
 const f=r.rule,q=f.quality,parts=[];
 if(r.middleBreakout?.eligible)parts.push('中軌突破 ✓ OBV>MA20且均線向上 ✓ MACD多頭');
 if(f.group==='M'){const h=f.midline?.health?.label||'訊號初始';parts.push(`中軌→上軌 ${f.midline?.tier||'M'}・${h}`);}
 else if(f.group==='A')parts.push('延續確認完成，優先研究');
 else if(f.group==='N')parts.push('健康新突破監控，尚非追價清單');
 else if(f.group==='H')parts.push('過熱突破：方向強但位置不適合追價');
 else if(f.group==='C'&&q?.pv.healthyPullback)parts.push('突破後量縮回測且守中軌');
 if(q?.macd.state==='多頭加速')parts.push('MACD作為確認：柱連續增強');
 else if(q?.macd.state==='黃金交叉')parts.push('MACD作為確認：剛黃金交叉');
 if(q?.pv.state==='價漲量增')parts.push(`價漲量增，20日量比${f2(q.pv.ratio)}`);
 else if(q?.pv.healthyPullback)parts.push('回檔量縮，賣壓未明顯放大');
 if(q?.pv.clv>=0.7)parts.push(`收盤位置強（CLV ${f2(q.pv.clv*100)}%）`);
 if(q?.trendScore>=20)parts.push('中短期趨勢結構完整');
 if(f.distance!=null&&f.distance<=2)parts.push(`距上軌${f2(f.distance)}%，未明顯延伸`);
 return parts.slice(0,4);
}
function recommendationRisk(r){
 const f=r.rule,q=f.quality,risks=[];
 if(f.group==='M')risks.push('中軌動能屬提前監測，不是直接追價買點；等上軌突破回測或A組確認');
 if(f.group==='N')risks.push('健康首日突破，仍只列監控，需後續延續確認');
 if(f.group==='H')risks.push('過熱突破，不列買進候選；等待回測後重新確認');
 if(q?.macd.histPct>=90)risks.push(`MACD動能位階${q.macd.histPct.toFixed(0)}%，位置偏熱`);
 if(f.gain>10)risks.push(`5日已漲${f2(f.gain)}%，追價風險升高`);
 if(f.distance>2)risks.push(`距上軌${f2(f.distance)}%，乖離偏大`);
 if(q?.alerts?.length)risks.push(...q.alerts);
 return [...new Set(risks)].slice(0,2);
}
function marketContextInfo(){
 const m=quality?.market_context||{};
 const label=m.state==='risk_on'?'大盤／櫃買趨勢皆偏多':m.state==='risk_off'?'大盤／櫃買趨勢皆偏弱':m.state==='mixed'?'大盤／櫃買環境分歧':'市場環境資料不足';
 return {...m,label,penalty:Number(m.recommendation_penalty||0)};
}
function recommendationCandidates(){
 const m=marketContextInfo(),pen=m.penalty;
 const eligible=RESEARCH_ROWS.filter(r=>{
  if(offMkt.has(r.mkt)||offInd.has(r.ind))return false;
  const f=r.rule,q=f.quality;if(!q||q.hardRisk||['Q1','Q2','Q3'].includes(f.dataStatus))return false;
  if(['Q','D','B','V','H','NONE'].includes(f.group))return false;
  // Hard chase-risk filters: technical strength is not the same as a good entry location.
  if(f.group==='M'){
   const h=f.midline?.health?.state||'signal',tier=f.midline?.tier||'';
   return ['accelerating','healthy','holding','signal'].includes(h)&&f.score>=70+Math.ceil(pen/2)&&(tier==='M3'||tier==='M2'||h==='accelerating');
  }
  if(f.group==='N')return f.score>=70+Math.ceil(pen/2)&&f.gain<=15&&f.distance<=3&&!(q.macd.histPct>=95);
  if(f.group==='A')return f.score>=68+Math.ceil(pen/2)&&f.gain<=20&&f.distance<=4;
  if(f.group==='C')return !!q.pv.healthyPullback&&f.score>=72+Math.ceil(pen/2)&&f.gain<=15;
  return false;
 });
 const sorter=(a,b)=>(b.rule.score-a.rule.score)||(b.rule.trendScore??b.rule.quality?.trendScore??0)-(a.rule.trendScore??a.rule.quality?.trendScore??0)||(b.rule.amount??0)-(a.rule.amount??0);
 const M=eligible.filter(r=>r.rule.group==='M').sort((a,b)=>SelectionRules.compare(a.rule,b.rule)).slice(0,4);
 const A=eligible.filter(r=>r.rule.group==='A').sort(sorter).slice(0,4);
 const C=eligible.filter(r=>r.rule.group==='C').sort(sorter).slice(0,2);
 const N=eligible.filter(r=>r.rule.group==='N').sort(sorter).slice(0,2);
 const existing=[...M,...A,...C,...N].slice(0,10),seen=new Set(existing.map(r=>r.code));
 const K=RESEARCH_ROWS.filter(r=>!seen.has(r.code)&&!offMkt.has(r.mkt)&&!offInd.has(r.ind)&&r.middleBreakout?.eligible&&r.rule?.dataStatus==='OK'&&r.rule.quality&&!r.rule.quality.hardRisk).sort(sorter).slice(0,Math.min(4,10-existing.length)).map(r=>({...r,rule:{...r.rule,group:'K',signal:{i:r.s.cl.length-1,date:r.date,price:r.close,low:r.s.l.at(-1),volume:r.s.v.at(-1)},reasons:['當日上穿20日中軌；OBV高於MA20且兩者向上；MACD多頭，允許零軸下轉強']}}));
 return {M:M.filter(r=>seen.has(r.code)),A:A.filter(r=>seen.has(r.code)),C:C.filter(r=>seen.has(r.code)),N:N.filter(r=>seen.has(r.code)),K,flat:[...existing,...K],market:m};
}
let trackingValidationState={current:null,previous:null,dates:[]};
let trackingValidationDate='';
let trackingSnapshotSignature='';
let trackingSnapshotTimer=null;
let trackingValidationBusy=false;

function trackingSnapshotItems(picks){
 return picks.map((r,i)=>({
  rank:i+1,code:r.code,name:r.name,market:r.mkt,group:r.rule?.group||'',group_label:groupLabel(r.rule?.group||'NONE'),
  score:r.rule?.score??null,price:Number.isFinite(Number(r.close))?Number(r.close):null,
  signal_date:r.rule?.signal?.date||'',tier:r.rule?.midline?.tier||'',macd:r.rule?.quality?.macd?.state||'',
  reasons:recommendationReason(r),risks:recommendationRisk(r)
 }));
}
function trackingRowByCode(code,market){
 return RESEARCH_ROWS.find(r=>r.code===code&&(!market||r.mkt===market))||null;
}
function trackingPriceOnDate(row,date,fallback){
 if(row?.s?.d&&Array.isArray(row.s.d)){
  const i=row.s.d.lastIndexOf(date);
  if(i>=0&&Number.isFinite(Number(row.s.cl?.[i])))return Number(row.s.cl[i]);
 }
 const n=Number(fallback);return Number.isFinite(n)?n:null;
}
function trackingFmtPrice(v){return Number.isFinite(Number(v))?f2(Number(v)):'—';}
function trackingPct(v){return Number.isFinite(v)?`${v>0?'+':''}${v.toFixed(2)}%`:'—';}
function trackingTone(v){return !Number.isFinite(v)?'flat':v>0.005?'up':v<-0.005?'down':'flat';}
function trackingSavedTime(iso){
 if(!iso)return'—';try{return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));}catch(_e){return iso;}
}
function renderTrackingValidation(currentDate){
 const panel=trackingValidationPanel,prev=trackingValidationState.previous,currentSet=new Set((recommendationCandidates().flat||[]).map(r=>r.code));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(currentDate||'')){
  panel.innerHTML='<div class="trackEmpty"><b>追蹤驗證區</b><span>等待有效資料日期後，自動建立與載入追蹤快照。</span></div>';return;
 }
 if(!prev||!Array.isArray(prev.items)||!prev.items.length){
  const cur=trackingValidationState.current;
  panel.innerHTML=`<div class="trackHeader"><div><span class="trackEyebrow">TRACK / VERIFY</span><h3>追蹤驗證區</h3><p>當日優先研究清單會自動備份；下一個資料日，前一份名單會在這裡還原並驗證。</p></div><div class="trackActions"><span class="trackStatus">${cur?.items?.length?`已備份 ${cur.items.length} 檔・${esc(currentDate)}`:'準備備份今日資料'}</span><button type="button" class="btn small" id="trackSaveNow">立即備份今日</button></div></div><div class="trackEmpty trackEmpty--soft"><b>尚無較早的研究快照</b><span>目前資料日 ${esc(currentDate)}。保存完成後，下一個資料日會自動顯示「前日股價 vs 今日最新股價」。</span></div>`;
  const b=panel.querySelector('#trackSaveNow');if(b)b.onclick=()=>saveTrackingSnapshotNow(currentDate,recommendationCandidates().flat,true);
  return;
 }
 const rows=prev.items.map((item,i)=>{
  const row=trackingRowByCode(item.code,item.market),prevPrice=trackingPriceOnDate(row,prev.date,item.price),todayPrice=row&&Number.isFinite(Number(row.close))?Number(row.close):null;
  const pct=(Number.isFinite(prevPrice)&&Number.isFinite(todayPrice)&&prevPrice!==0)?(todayPrice/prevPrice-1)*100:NaN;
  const tone=trackingTone(pct),still=currentSet.has(item.code);
  const currentGroup=row?.rule?.group?groupLabel(row.rule.group):'—';
  const status=still?'<span class="trackBadge trackBadge--keep">仍在今日清單</span>':'<span class="trackBadge trackBadge--exit">今日未入選</span>';
  return {html:`<div class="trackRow" data-track-code="${esc(item.code)}"><div class="trackRank">${i+1}</div><div class="trackStock"><b>${esc(item.name||item.code)}</b><span>${esc(item.code)}・${esc(item.group_label||item.group||'—')}</span></div><div class="trackPrice"><small>前日股價</small><b>${trackingFmtPrice(prevPrice)}</b><span>${esc(prev.date)}</span></div><div class="trackArrow">→</div><div class="trackPrice trackPrice--today"><small>今日最新</small><b>${trackingFmtPrice(todayPrice)}</b><span>${esc(currentDate)}</span></div><div class="trackMove ${tone}"><small>驗證漲跌</small><b>${trackingPct(pct)}</b><span>${Number.isFinite(pct)?(pct>0?'高於前日':pct<0?'低於前日':'持平'):'待更新'}</span></div><div class="trackMeta"><span>前日分數 <b>${item.score??'—'}</b>/100</span><span>今日分組 ${esc(currentGroup)}</span>${status}</div></div>`,pct};
 });
 const valid=rows.map(x=>x.pct).filter(Number.isFinite),up=valid.filter(x=>x>0).length,down=valid.filter(x=>x<0).length,flat=valid.length-up-down,avg=valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:NaN;
 panel.innerHTML=`<div class="trackHeader"><div><span class="trackEyebrow">TRACK / VERIFY</span><h3>追蹤驗證區</h3><p>還原 ${esc(prev.date)} 的優先研究清單，並用 ${esc(currentDate)} 最新價格逐檔驗證。前日價格優先取目前 K 線中的該日收盤，資料不足時才使用快照價格。</p></div><div class="trackActions"><span class="trackStatus">前次快照 ${esc(prev.date)}・${prev.items.length} 檔・保存 ${esc(trackingSavedTime(prev.saved_at))}</span><button type="button" class="btn small" id="trackReload">重新讀取</button><button type="button" class="btn small" id="trackSaveNow">備份今日</button></div></div><div class="trackSummary"><div><span>可驗證</span><b>${valid.length}</b><small>檔</small></div><div class="isUp"><span>上漲</span><b>${up}</b><small>檔</small></div><div class="isDown"><span>下跌</span><b>${down}</b><small>檔</small></div><div><span>持平</span><b>${flat}</b><small>檔</small></div><div class="${trackingTone(avg)}"><span>平均變動</span><b>${trackingPct(avg)}</b><small>${esc(prev.date)} → ${esc(currentDate)}</small></div></div><div class="trackColumns"><span># / 股票</span><span>前日股價</span><span>今日最新</span><span>驗證漲跌</span><span>條件延續</span></div><div class="trackRows">${rows.map(x=>x.html).join('')}</div><div class="trackFoot">此區只驗證上一份研究候選後續價格與條件是否延續，不把單日漲跌視為買賣績效或策略勝率。</div>`;
 panel.querySelector('#trackReload').onclick=()=>loadTrackingValidation(currentDate,true);
 panel.querySelector('#trackSaveNow').onclick=()=>saveTrackingSnapshotNow(currentDate,recommendationCandidates().flat,true);
 panel.querySelectorAll('[data-track-code]').forEach(el=>el.onclick=()=>{const code=el.dataset.trackCode;if(ROWS.some(r=>r.code===code)){recSelCode=code;selCode=code;hoverX=null;recHoverX=null;drawSelected();drawRecommendationChart();}});
}
async function loadTrackingValidation(date,force=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
 if(trackingValidationBusy)return;
 if(!force&&trackingValidationDate===date&&trackingValidationState.previous!==undefined){renderTrackingValidation(date);return;}
 trackingValidationBusy=true;
 try{
  const j=await requestJSON(`/api/tracking_validation?date=${encodeURIComponent(date)}`,{},10000,false);
  trackingValidationState=j||{current:null,previous:null,dates:[]};trackingValidationDate=date;renderTrackingValidation(date);
 }catch(e){trackingValidationPanel.innerHTML=`<div class="trackEmpty"><b>追蹤驗證資料暫時無法讀取</b><span>${esc(e.message)}</span></div>`;}
 finally{trackingValidationBusy=false;}
}
async function saveTrackingSnapshotNow(date,picks,manual=false){
 if(asOf||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
 if(!researchDataUsable()){
  if(manual)trackingValidationPanel.querySelector('.trackStatus')?.replaceChildren(document.createTextNode('資料尚未通過新鮮度檢查，保留既有快照'));
  return;
 }
 const items=trackingSnapshotItems(picks||[]),payload={date,mode:provisionalView()?'intraday':'daily',items};
 const sig=JSON.stringify(payload);
 if(!manual&&sig===trackingSnapshotSignature)return;
 try{
  const j=await requestJSON('/api/tracking_validation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},12000,false);
  trackingSnapshotSignature=sig;trackingValidationState=j||trackingValidationState;trackingValidationDate=date;renderTrackingValidation(date);
 }catch(e){if(manual)trackingValidationPanel.querySelector('.trackStatus')?.replaceChildren(document.createTextNode('備份失敗：'+e.message));}
}
function syncTrackingValidation(date,picks){
 renderTrackingValidation(date);
 if(trackingValidationDate!==date)loadTrackingValidation(date);
 clearTimeout(trackingSnapshotTimer);
 if(asOf||!researchDataUsable()||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
 trackingSnapshotTimer=setTimeout(()=>saveTrackingSnapshotNow(date,picks,false),600);
}

function researchDataUsable(){
 return !quality.offline&&!quality.mock&&quality.calendar?.verified_year!==false&&RESEARCH_ROWS.some(r=>r.rule?.dataStatus==='OK');
}

function researchEmptyReason(){
 const counts={};RESEARCH_ROWS.forEach(r=>{const k=r.rule?.dataStatus||'OK';counts[k]=(counts[k]||0)+1;});
 if(!RESEARCH_ROWS.length)return '尚無可計算日K；先按「一鍵更新全市場」。新上市且歷史不足者會列在失敗清單。';
 if((counts.Q3||0)===RESEARCH_ROWS.length)return `資料檢查未通過：${esc(RESEARCH_ROWS[0]?.rule?.reasons?.join('；')||'資料無效')}。可在選股工作區選擇「資料日期」歷史回看，或更新全市場資料。`;
 if((counts.Q1||0)+(counts.Q2||0)+(counts.Q3||0)===RESEARCH_ROWS.length)return `目前 Q1 待刷新 ${counts.Q1||0}・Q2 快照稍舊 ${counts.Q2||0}・Q3 異常 ${counts.Q3||0}；請先更新全市場行情，快取與過期價格不進高優先名單。`;
 return `本次沒有同時通過分組、位置與風險條件的研究候選；資料可用 ${counts.OK||0} 檔，等待條件成立。`;
}

function renderRecommendations(){
 recommendationPanel.style.display='block';recommendationChartPanel.style.display='block';
 const rec=recommendationCandidates(),picks=rec.flat;
 if(picks.length&&!picks.some(r=>r.code===recSelCode))recSelCode=picks[0].code;if(!picks.length)recSelCode=null;
 const date=asOf||quality.latest_bar||marketDates.at(-1)||'最新資料';
 const renderCards=(arr,offset=0)=>arr.map((r,i)=>{const f=r.rule,q=f.quality,reasons=recommendationReason(r),risks=recommendationRisk(r),chosen=r.code===recSelCode;return `<button type="button" data-rec="${r.code}" title="點擊在下方查看K線＋MACD" style="display:grid;width:100%;grid-template-columns:40px minmax(150px,1.15fr) 92px minmax(310px,2.45fr) minmax(220px,1.35fr);gap:13px;align-items:start;padding:14px 10px;border:0;border-top:1px solid var(--line);border-radius:0;background:${chosen?'rgba(232,93,117,.10)':'transparent'};color:inherit;text-align:left;cursor:pointer;outline:${chosen?'1px solid #C6C1D9':'none'}"><b style="color:var(--accent);font-size:21px">${offset+i+1}</b><div><b>${esc(r.name)}</b> <span class="code">${r.code}</span><div style="color:var(--muted);font-size:16px">${groupLabel(f.group)}・${f2(r.close)}</div></div><div><b>${f.score}</b>/100<div style="font-size:16px;color:var(--muted)">${esc(q.macd.state)}</div></div><div>${reasons.map(x=>`<span style="display:inline-block;margin:0 5px 4px 0">✓ ${esc(x)}</span>`).join('')||'符合研究門檻'}</div><div style="color:${risks.length?'#C6C1D9':'var(--muted)'}">${risks.length?'⚠ '+esc(risks.join('；')):'目前無重大技術警示'}</div></button>`;}).join('');
 const block=(title,desc,arr,offset)=>arr.length?`<div style="margin-top:10px"><b>${title}</b><span style="color:var(--muted);font-size:16px;margin-left:8px">${desc}</span>${renderCards(arr,offset)}</div>`:'';
 recommendationPanel.innerHTML=`<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><b style="font-size:22px">優先研究清單（非買進排名）</b><span style="color:var(--muted);font-size:17px">資料日 ${esc(date)}・可計算 ${RESEARCH_ROWS.length} 檔・入選 ${picks.length} 檔・${asOf?'歷史回看':'檢查資料新鮮度'}</span><span style="margin-left:auto;color:${rec.market.state==='risk_off'?'#C6C1D9':'var(--muted)'};font-size:17px">市場濾網：${esc(rec.market.label)}${rec.market.penalty?`・門檻加嚴 ${rec.market.penalty} 分`:''}</span></div>${block('M 中軌→上軌動能監測','提早找中軌突破且持續推進者；M不是直接買點',rec.M,0)}${block('A 延續確認','上軌突破後延續條件完成，優先研究',rec.A,rec.M.length)}${block('C 健康回測','量縮回測且守中軌，等待重新轉強',rec.C,rec.M.length+rec.A.length)}${block('N 健康新突破監控','只列監控；過熱突破會自動轉入 H 組，不列直接買進候選',rec.N,rec.M.length+rec.A.length+rec.C.length)}${block('中軌突破 · OBV / MACD 多頭','當日上穿20日中軌；多頭轉強監測，不是直接買點',rec.K,rec.M.length+rec.A.length+rec.C.length+rec.N.length)}${picks.length?'':`<div style="padding:12px 0;color:var(--muted)">${researchEmptyReason()}</div>`}<div style="margin-top:8px;color:var(--muted);font-size:16px">R10.19A 評分：趨勢25＋突破20＋量價效率20＋位置風險20＋流動性波動15；新增突破追價風險過濾。觸發至少2項（單日大漲／高於上軌／5日急漲／爆量／距突破基準過遠／RSI過熱／MACD過熱）即轉入 H 過熱觀察，不列直接買進候選。</div>`;
 recommendationPanel.querySelectorAll('[data-rec]').forEach(el=>el.onclick=()=>{recSelCode=el.dataset.rec;selCode=recSelCode;hoverX=null;recHoverX=null;drawSelected();renderRecommendations();requestAnimationFrame(()=>{drawRecommendationChart();recommendationChartPanel.scrollIntoView({behavior:'smooth',block:'start'});});});
 syncTrackingValidation(date,picks);
 drawRecommendationChart();
}

function drawRecommendationChart(){
 const r=recommendationCandidates().flat.find(x=>x.code===recSelCode)||researchByCode.get(recSelCode)||null;
 const head=document.getElementById('recChartHead'),info=document.getElementById('recChartInfo'),reasons=document.getElementById('recChartReasons');
 const canvas=document.getElementById('recCv'),wrap=document.getElementById('recCanvasWrap');
 if(!canvas||!wrap||!head||!info||!reasons)return;
 const ctx2=canvas.getContext('2d'),W=Math.max(300,wrap.clientWidth),H=Math.max(500,wrap.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
 const pixelW=Math.round(W*dpr),pixelH=Math.round(H*dpr);if(canvas.width!==pixelW)canvas.width=pixelW;if(canvas.height!==pixelH)canvas.height=pixelH;ctx2.setTransform(dpr,0,0,dpr,0,0);ctx2.clearRect(0,0,W,H);
 if(!r){head.innerHTML='<b style="font-size:22px">推薦股 K線＋MACD</b><span style="color:var(--muted)">本次沒有可顯示的推薦股</span>';info.textContent='';reasons.textContent='';return;}
 const f=r.rule,q=f?.quality;
 head.innerHTML=`<b style="font-size:23px">${esc(r.name)} <span class="code">${r.code}</span></b><span>${groupLabel(f.group)}</span><b class="${r.chg>0?'up':r.chg<0?'down':''}">${f2(r.close)}</b><span>${r.chg>0?'+':''}${f2(r.chg)}%</span><span style="color:var(--muted)">研究分 ${f.score??'—'}/100・${q?esc(q.macd.state):'—'}</span>`;
 const s=r.s,n=s.cl.length,i0=Math.max(0,n-(window.innerWidth<700?60:90)),m=n-i0,macd=chartMacdSeries(s.cl);
 const padL=8,padR=52,x0=padL,x1=W-padR,step=Math.max(.5,(x1-x0)/Math.max(1,m)),bwid=Math.max(1,step*.7);
 const top=8,bottom=20,total=Math.max(360,H-top-bottom),g=8;
 const hP=total*.49,hV=total*.12,hB=total*.12,hM=total*.21;
 const yP0=top,yP1=yP0+hP,yV0=yP1+g,yV1=yV0+hV,yB0=yV1+g,yB1=yB0+hB,yM0=yB1+g,yM1=Math.min(H-bottom,yM0+hM);
 let mx=-Infinity,mn=Infinity,vmx=0,bmx=0,macMax=-Infinity,macMin=Infinity;
 for(let i=i0;i<n;i++){mx=Math.max(mx,s.h[i],r.up[i]??-Infinity);mn=Math.min(mn,s.l[i],r.lo[i]??Infinity);vmx=Math.max(vmx,s.v[i]);bmx=Math.max(bmx,r.bwArr[i]||0);macMax=Math.max(macMax,macd.dif[i]??0,macd.dea[i]??0,macd.hist[i]??0,0);macMin=Math.min(macMin,macd.dif[i]??0,macd.dea[i]??0,macd.hist[i]??0,0);}
 if(!Number.isFinite(mx)||!Number.isFinite(mn))return;
 const pricePad=Math.max((mx-mn)*.04,Math.abs(mx)*.001,.01);mx+=pricePad;mn-=pricePad;
 if(!Number.isFinite(macMax)||!Number.isFinite(macMin)){macMax=1;macMin=-1;}if(macMax===macMin){macMax+=1;macMin-=1;}const mp=Math.max((macMax-macMin)*.08,.0001);macMax+=mp;macMin-=mp;
 const X=i=>x0+(i-i0+.5)*step,Y=p=>yP0+(mx-p)/(mx-mn)*(yP1-yP0),YM=v=>yM0+(macMax-v)/(macMax-macMin)*(yM1-yM0);
 const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim(),cUp=css('--up'),cDn=css('--down');
 ctx2.font='16px sans-serif';ctx2.textBaseline='middle';ctx2.strokeStyle='#8E97B8';ctx2.fillStyle='#C6C1D9';ctx2.lineWidth=1;
 for(let g0=0;g0<=4;g0++){const p=mn+(mx-mn)*g0/4,y=Math.round(Y(p))+.5;ctx2.beginPath();ctx2.moveTo(x0,y);ctx2.lineTo(x1,y);ctx2.stroke();ctx2.fillText(p.toFixed(p<100?2:1),x1+4,y);}
 ctx2.beginPath();let started=false;for(let i=i0;i<n;i++){if(r.up[i]==null)continue;if(!started){ctx2.moveTo(X(i),Y(r.up[i]));started=true;}else ctx2.lineTo(X(i),Y(r.up[i]));}for(let i=n-1;i>=i0;i--){if(r.lo[i]==null)continue;ctx2.lineTo(X(i),Y(r.lo[i]));}ctx2.closePath();ctx2.fillStyle='#A6B8D710';ctx2.fill();
 const line=(arr,col,w,yFn=Y)=>{ctx2.beginPath();let st=false;for(let i=i0;i<n;i++){if(arr[i]==null||!Number.isFinite(arr[i]))continue;const x=X(i),y=yFn(arr[i]);st?ctx2.lineTo(x,y):ctx2.moveTo(x,y);st=true;}ctx2.strokeStyle=col;ctx2.lineWidth=w;ctx2.stroke();};
 line(r.up,'#C6C1D9',1.3);line(r.mid,'#A6B8D7',1.3);line(r.lo,'#A6B8D7',1.3);
 for(let i=i0;i<n;i++){const isUp=s.cl[i]>=s.o[i],col=isUp?cUp:cDn,x=X(i);ctx2.strokeStyle=col;ctx2.fillStyle=col;ctx2.beginPath();ctx2.moveTo(Math.round(x)+.5,Y(s.h[i]));ctx2.lineTo(Math.round(x)+.5,Y(s.l[i]));ctx2.stroke();const ya=Y(Math.max(s.o[i],s.cl[i])),yb=Y(Math.min(s.o[i],s.cl[i]));ctx2.fillRect(x-bwid/2,ya,bwid,Math.max(1,yb-ya));const vh=(s.v[i]/(vmx||1))*(yV1-yV0-8);ctx2.globalAlpha=.75;ctx2.fillRect(x-bwid/2,yV1-vh,bwid,vh);ctx2.globalAlpha=1;}
 if(f?.signal?.i!=null&&f.signal.i>=i0){const isM=f.group==='M';ctx2.fillStyle=isM?'#A6B8D7':'#C6C1D9';ctx2.font='17px sans-serif';ctx2.textAlign='center';ctx2.fillText(isM?`◆${f.midline?.tier||'M'} 中軌`:'▲突破',X(f.signal.i),Math.min(yP1-8,Y(s.l[f.signal.i])+14));ctx2.textAlign='left';}
 ctx2.fillStyle='#C6C1D9';ctx2.font='16px sans-serif';ctx2.fillText('成交量',x0+2,yV0+6);ctx2.fillText('布林帶寬%',x0+2,yB0+6);
 ctx2.beginPath();let st2=false;for(let i=i0;i<n;i++){if(r.bwArr[i]==null)continue;const x=X(i),y=yB1-(r.bwArr[i]/(bmx||1))*(yB1-yB0-10);st2?ctx2.lineTo(x,y):ctx2.moveTo(x,y);st2=true;}ctx2.strokeStyle='#C6C1D9';ctx2.lineWidth=1.2;ctx2.stroke();
 const zeroY=YM(0);ctx2.strokeStyle='#8E97B8';ctx2.beginPath();ctx2.moveTo(x0,zeroY);ctx2.lineTo(x1,zeroY);ctx2.stroke();
 for(let i=i0;i<n;i++){const h=macd.hist[i];if(!Number.isFinite(h))continue;const x=X(i),yh=YM(h),ty=Math.min(yh,zeroY),hh=Math.max(1,Math.abs(zeroY-yh));ctx2.globalAlpha=.7;ctx2.fillStyle=h>=0?cUp:cDn;ctx2.fillRect(x-bwid/2,ty,bwid,hh);ctx2.globalAlpha=1;}
 line(macd.dif,'#A6B8D7',1.4,YM);line(macd.dea,'#C6C1D9',1.4,YM);ctx2.fillStyle='#C6C1D9';ctx2.fillText('MACD 12/26/9',x0+2,yM0+6);ctx2.fillStyle='#A6B8D7';ctx2.fillText('DIF',x0+94,yM0+6);ctx2.fillStyle='#C6C1D9';ctx2.fillText('DEA',x0+122,yM0+6);
 ctx2.fillStyle='#C6C1D9';ctx2.textAlign='center';const dateStep=Math.max(1,Math.ceil(m/(window.innerWidth<700?4:6)));for(let i=i0;i<n;i+=dateStep)ctx2.fillText(s.d[i].slice(5).replace('-','/'),X(i),H-8);ctx2.textAlign='left';
 let hi=n-1;if(recHoverX!=null){hi=Math.max(i0,Math.min(n-1,i0+Math.floor((recHoverX-x0)/step)));const x=Math.round(X(hi))+.5;ctx2.strokeStyle='#C6C1D966';ctx2.beginPath();ctx2.moveTo(x,yP0);ctx2.lineTo(x,yM1);ctx2.stroke();}
 const ch=hi>0?(s.cl[hi]/s.cl[hi-1]-1)*100:0;
 info.innerHTML=`<b>${s.d[hi]}</b>　開 ${f2(s.o[hi])}　高 ${f2(s.h[hi])}　低 ${f2(s.l[hi])}　收 <b class="${ch>0?'up':ch<0?'down':''}">${f2(s.cl[hi])}</b> (${ch>0?'+':''}${ch.toFixed(2)}%)　量 ${s.v[hi].toLocaleString()}張<br><span style="color:#C6C1D9">上軌 ${f2(r.up[hi])}</span>　<span style="color:#A6B8D7">中軌 ${f2(r.mid[hi])}</span>　<span style="color:#A6B8D7">下軌 ${f2(r.lo[hi])}</span>　<span style="color:#A6B8D7">DIF ${f2(macd.dif[hi])}</span>　<span style="color:#C6C1D9">DEA ${f2(macd.dea[hi])}</span>　MACD柱 <b class="${macd.hist[hi]>=0?'up':'down'}">${macd.hist[hi]>=0?'+':''}${f2(macd.hist[hi])}</b>`;
 const rs=recommendationReason(r),risk=recommendationRisk(r);
 reasons.innerHTML=`<b>入選理由：</b>${rs.length?rs.map(x=>`<span style="display:inline-block;margin:2px 8px 2px 0">✓ ${esc(x)}</span>`).join(''):'符合推薦研究門檻'}${risk.length?`<div style="color:#C6C1D9;margin-top:4px"><b>風險：</b>⚠ ${esc(risk.join('；'))}</div>`:'<div style="color:var(--muted);margin-top:4px">目前無重大技術警示。</div>'}`;
}

const recCanvas=document.getElementById('recCv');
if(recCanvas){
 const setRecHover=e=>{const rect=recCanvas.getBoundingClientRect();recHoverX=e.clientX-rect.left;drawRecommendationChart();};
 recCanvas.addEventListener('pointerdown',setRecHover);
 recCanvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')setRecHover(e);});
 recCanvas.addEventListener('pointerleave',()=>{recHoverX=null;drawRecommendationChart();});
 const recObserver=new ResizeObserver(()=>{if(!closing)drawRecommendationChart();});
 recObserver.observe(document.getElementById('recCanvasWrap'));
}

const detail=document.createElement('div');detail.id='ruleReasons';detail.style.cssText='padding:10px 14px;border-top:1px solid var(--line);max-height:220px;overflow:auto;font-size:17px';
$('why').before(detail);

// R10.19A: preserve complete explanation while simplifying the left candidate table.
// Keep it above the K chart so it can never look like it disappeared below the fold.
const dailyPanel=document.createElement('div');dailyPanel.id='dailyExplain';dailyPanel.style.cssText='padding:10px 14px;border-top:1px solid var(--line);max-height:300px;overflow:auto;font-size:18px;flex-shrink:0;background:#302943';
$('canvasWrap').before(dailyPanel);

// AI visuals are additive, not a replacement for the legacy explanation.
const aiVisualPanel=document.createElement('div');aiVisualPanel.id='aiVisualPanel';aiVisualPanel.style.cssText='padding:8px 14px;border-top:1px solid var(--line);flex-shrink:0;background:#302943';
dailyPanel.after(aiVisualPanel);

const riskPanel=document.createElement('div');riskPanel.id='riskPanel';riskPanel.style.cssText='padding:10px 14px;border-top:1px solid var(--line);flex-shrink:0;font-size:17px';
detail.before(riskPanel);
riskPanel.innerHTML=`<details><summary>交易風險試算（自填預算，不是下單建議）</summary>
<div class="row"><label for="riskBudget">單筆損失預算（元）</label><input id="riskBudget" type="number" min="1" placeholder="自填"></div>
<div class="row"><label for="riskCapital">本筆資金上限（元）</label><input id="riskCapital" type="number" min="1" placeholder="自填"></div>
<div class="row"><label for="riskCost">總成本／滑價緩衝（%）</label><input id="riskCost" type="number" min="0" max="10" step="0.1" placeholder="自填"></div>
<div id="riskResult"></div></details>`;

function barHtml(label,value,max,color='#A6B8D7'){
 const v=Number(value),m=Number(max)||100,p=Number.isFinite(v)?Math.max(0,Math.min(100,v/m*100)):0;
 const txt=Number.isFinite(v)?(Math.round(v*10)/10).toString():'—';
 return `<div style="background:#40375B;border:1px solid var(--line);border-radius:8px;padding:8px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:17px;margin-bottom:6px"><span>${esc(label)}</span><b>${txt}/${m}</b></div><div style="height:8px;background:#40375B;border-radius:999px;overflow:hidden"><div style="height:100%;width:${p}%;background:${color};border-radius:999px"></div></div></div>`;
}
function sopModelForSelection(r,f,e){
 const q=f.quality||{};
 let tag='🟡 觀望',tone='#C6C1D9',flat='等待條件更完整再出手',held='續抱觀察，跌破防守再調整',trigger='等待收盤站穩或下一次更新仍維持條件';
 if(f.group==='M'){const mm=f.midline?.current||f.midline||{},tier=f.midline?.tier||mm.tier||'M1';tag=tier==='M3'?'🔵 M3 上軌攻擊監測':tier==='M2'?'🔵 M2 強啟動監測':'🟡 M1 初啟動';tone=tier==='M3'?'#A6B8D7':tier==='M2'?'#A6B8D7':'#C6C1D9';flat=tier==='M3'?'列高優先監測，但不直接追價；等正式上軌突破後回測或A組確認':'等待量價延續與上軌距離收斂';held='已有部位可偏多觀察，以20日中軌與訊號低點分層防守';trigger=`中軌→上軌進度 ${f2(mm.progress)}%；${tier==='M3'?'下一步看上軌觸及／突破，再等回測確認':'等升級到M3或正式上軌突破'}`;}
 else if(f.group==='A'){tag='🔴 可研究買點';tone='#F3A1B5';flat='可列入研究名單，優先等回測不破或續強再分批';held='續抱為主，跌破突破日低點或中軌再降部位';trigger='若下一次更新仍守住突破區，可續抱／分批';}
 else if(f.group==='B'){tag='🔴 偏多續抱';tone='#F3A1B5';flat='不追高，等回測支撐';held='偏多續抱，注意量價是否背離';trigger='若量價續強可看延伸；若跌回關鍵價則降評';}
 else if(f.group==='N'){tag='🟡 健康突破待確認';tone='#C6C1D9';flat='先觀察首日突破隔日是否延續';held='小部位可續看，但未確認前不宜加碼';trigger='下一次更新若量能與收盤仍守突破區，才升級';}
 else if(f.group==='H'){tag='🟠 過熱勿追';tone='#C6C1D9';flat='不要追價，等待回測 OB/FVG / 突破區';held='已有部位續抱，但不建議再追';trigger='待距上軌與短線乖離收斂後再看';}
 else if(f.group==='C'){tag='🟡 整理等待';tone='#C6C1D9';flat='等整理結束、量能回溫再看';held='續抱觀察是否守中軌';trigger='重新放量或守支撐反彈再提高評級';}
 else if(f.group==='D'){tag='🟢 轉弱避開';tone='#95D1B4';flat='暫不介入';held='先減碼或停損，等重新站回關鍵位';trigger='需重新站回關鍵位並重建量價';}
 else if(f.group==='Q'){tag='🟢 Q3 資料異常';tone='#95D1B4';flat='先不根據此訊號交易';held='等待資料修復後再判斷';trigger='資料完整後重新評估';}
 const levels=[];
 if(f.signal?.price!=null)levels.push(['突破價',f2(f.signal.price)]);
 if(f.signal?.low!=null)levels.push(['防守參考',f2(f.signal.low)]);
 if(r.mid!=null)levels.push(['20日中軌',f2(Array.isArray(r.mid)?r.mid.at(-1):r.mid)]);
 if(f.midline){const mm=f.midline.current||f.midline;levels.push(['中軌動能',`${f.midline.tier||mm.tier||'M'} ${Math.round(mm.score||0)}/100`],['中→上軌進度',`${f2(mm.progress)}%`],['距上軌',`${f2(mm.distUpper)}%`]);}
 if(f.distance!=null)levels.push(['距上軌',f2(f.distance)+'%']);
 if(f.gain!=null)levels.push(['五日漲幅',f2(f.gain)+'%']);
 if(q.macd?.histPct!=null)levels.push(['MACD熱度',f2(q.macd.histPct)+'%']);
 return {tag,tone,flat,held,trigger,levels};
}
function visualTone(kind){
 return kind==='good'?{icon:'🔴',color:'#F3A1B5'}:kind==='bad'?{icon:'🟢',color:'#95D1B4'}:kind==='hot'?{icon:'🟠',color:'#C6C1D9'}:{icon:'🟡',color:'#C6C1D9'};
}
function compareArrow(a,b){
 const x=Number(a),y=Number(b);if(!Number.isFinite(x)||!Number.isFinite(y))return '→';
 const d=y-x,eps=Math.max(Math.abs(x),1)*0.003;return d>eps?'↑':d<-eps?'↓':'→';
}
function renderCompareTable(r,f){
 const s=r.s,t=s?.cl?.length-1;if(!(t>=1))return '';
 const b=SelectionRules.bands(s.cl,20,2),now=b[t],prev=b[t-1];
 const mcNow=SelectionRules.macdAt(s,t),mcPrev=SelectionRules.macdAt(s,t-1);
 const rows=[
  ['收盤',s.cl[t-1],s.cl[t],x=>f2(x)],
  ['成交量',s.v[t-1],s.v[t],x=>Math.round(x).toLocaleString()+'張'],
  ['20日中軌',prev?.mid,now?.mid,x=>f2(x)],
  ['布林帶寬%',prev?.bw,now?.bw,x=>f2(x)+'%'],
  ['MACD柱',mcPrev?.hist,mcNow?.hist,x=>(x>=0?'+':'')+f2(x)],
  ['距上軌%',prev?.up?((s.cl[t-1]/prev.up-1)*100):null,now?.up?((s.cl[t]/now.up-1)*100):null,x=>f2(x)+'%']
 ];
 return `<div style="margin-top:10px;background:#40375B;border:1px solid var(--line);border-radius:8px;padding:8px;overflow:auto"><b style="color:#C6C1D9;font-size:17px">前後日 AI 比較表</b><table style="width:100%;min-width:520px;margin-top:6px;border-collapse:collapse;font-size:17px"><thead><tr><th style="text-align:left;padding:5px;border-bottom:1px solid #8E97B8">項目</th><th style="text-align:right;padding:5px;border-bottom:1px solid #8E97B8">前一日</th><th style="text-align:center;padding:5px;border-bottom:1px solid #8E97B8">方向</th><th style="text-align:right;padding:5px;border-bottom:1px solid #8E97B8">目前</th></tr></thead><tbody>${rows.map(([name,a,bv,fmt])=>`<tr><td style="padding:5px;border-bottom:1px dashed #8E97B8">${esc(name)}</td><td style="padding:5px;text-align:right;border-bottom:1px dashed #8E97B8">${Number.isFinite(Number(a))?esc(fmt(Number(a))):'—'}</td><td style="padding:5px;text-align:center;border-bottom:1px dashed #8E97B8;font-weight:900">${compareArrow(a,bv)}</td><td style="padding:5px;text-align:right;border-bottom:1px dashed #8E97B8;font-weight:700">${Number.isFinite(Number(bv))?esc(fmt(Number(bv))):'—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function perItemSOP(r,f,e){
 const q=f.quality||{},s=r.s,t=s?.cl?.length-1,b=t>=0?SelectionRules.bands(s.cl,20,2):[],now=b[t],prev=b[t-1];
 const close=Number(s?.cl?.[t]),prior=Number(s?.cl?.[t-1]),vol=Number(s?.v?.[t]),pvol=Number(s?.v?.[t-1]);
 const change=prior>0?(close/prior-1)*100:null,aboveMid=now&&close>now.mid,aboveUp=now&&close>now.up,midUp=now&&prev&&now.mid>=prev.mid,bwUp=now&&prev&&now.bw>prev.bw;
 const dist=Number(f.distance),gain=Number(f.gain),vr=pvol>0?vol/pvol:null;
 const items=[];
 let k='warn',text='價格強弱混合',sop='等待價格與中軌方向一致，再決定是否提高曝險。';
 if(Number.isFinite(change)&&change>0&&aboveMid){k='good';text=`收盤偏強 ${change>=0?'+':''}${f2(change)}%`;sop='只要守住20日中軌，續看多方延伸；跌回中軌下改為等待。';}
 else if(Number.isFinite(change)&&change<0&&!aboveMid){k='bad';text=`收盤偏弱 ${f2(change)}%`;sop='不接弱勢下跌；先等站回中軌或重新形成突破。';}
 items.push(['收盤強弱',k,text,sop,Math.min(100,Math.max(0,50+(change||0)*6))]);
 k='warn';text='布林位置中性';sop='區間中段不追，等靠近支撐或有效突破。';
 if(f.group==='H'||(Number.isFinite(dist)&&dist>3)){k='hot';text=`位置過熱・距上軌 ${f2(dist)}%`;sop='禁止追價；等待回測上軌、突破區或OB/FVG後再確認。';}
 else if(aboveUp){k='good';text=`站上上軌・距上軌 ${f2(dist)}%`;sop='可續抱，但新倉等回測；若重新跌回上軌下，降為觀察。';}
 else if(!aboveMid){k='bad';text='跌至20日中軌下';sop='新倉暫停；已持有檢查防守與突破日低點。';}
 items.push(['布林位置',k,text,sop,q.positionScore!=null?q.positionScore/20*100:50]);
 k=midUp?'good':'warn';text=`中軌${midUp?'向上':'未向上'}・帶寬${bwUp?'擴張':'未擴張'}`;sop=midUp&&bwUp?'趨勢與波動同步擴張，可續追蹤，但帶寬擴張不能單獨當買點。':'等中軌轉上且價格站穩，再提高趨勢評級。';
 if(now&&prev&&now.mid<prev.mid){k='bad';sop='中軌轉下時避免追價，等重新走平／翻揚。';}
 items.push(['中軌／帶寬',k,text,sop,q.breakoutScore!=null?q.breakoutScore/20*100:50]);
 k='warn';text=Number.isFinite(vr)?`量 ${f2(vr)}×前日`:'量能待確認';sop='量能普通時不因單一紅K追價。';
 if(q.pv?.ratio>=1.5&&q.pv?.ratio<=3){k='good';text=`20日量比 ${f2(q.pv.ratio)}・量能健康`;sop='量價若同步續強可保留；若爆量不漲，立即降級。';}
 if(q.pv?.explosiveNoProgress||q.pv?.heavyUpperShadow){k='bad';text='爆量但價格效率差';sop='不追；已持有縮短防守，等量縮止穩再評估。';}
 items.push(['成交量',k,text,sop,q.volumeScore!=null?q.volumeScore/20*100:50]);
 k='warn';text=q.macd?.state||'MACD待確認';sop='MACD只作確認，不單獨進場。';
 if(q.macd?.deathCross||q.macd?.topDivergence){k='bad';sop='動能轉弱／背離時禁止加碼，已持有優先守防守價。';}
 else if(q.macd?.histPct>=95){k='hot';sop='動能位階過熱，不追；等柱體降溫或價格回測。';}
 else if(q.macd?.dif>q.macd?.dea&&q.macd?.hist>0){k='good';sop='多頭動能確認；仍需配合位置與量價才能進場。';}
 items.push(['MACD',k,`${text}・熱度 ${f2(q.macd?.histPct)}%`,sop,Number.isFinite(q.macd?.histPct)?Math.min(100,q.macd.histPct):50]);
 k='warn';text=q.pv?.state||'價量待確認';sop='價量沒有共振時先等。';
 if(q.pv?.state==='價漲量增'||q.pv?.healthyPullback||q.pv?.reacceleration){k='good';sop='價格與成交量互相支持，可續追蹤；跌破防守則取消。';}
 if(q.pv?.state==='價跌量增'){k='bad';sop='價跌量增屬風險訊號，新倉暫停、持股檢查減碼。';}
 items.push(['價量效率',k,text,sop,q.volumeScore!=null?q.volumeScore/20*100:50]);
 k='warn';text=q.score!=null?`${q.score}/100・${q.grade||''}`:'資料不足';sop='分數只用排序，不單獨買賣。';
 if(q.score>=75&&!q.hardRisk){k='good';sop='列入高優先研究名單；仍須等價格位置與防守條件合格。';}
 else if(q.hardRisk){k='hot';sop='即使總分高也先處理風險警示，不因高分追價。';}
 else if(q.score<50){k='bad';sop='研究品質偏弱，暫不列新倉候選。';}
 items.push(['研究品質',k,text,sop,q.score??0]);
 k=f.group==='A'||f.group==='M'?'good':f.group==='D'?'bad':f.group==='H'?'hot':'warn';
 text=f.group==='M'?`中軌動能 ${f.midline?.tier||'M1'}`:f.group==='A'?'延續確認完成':f.group==='N'?'新突破・待次日':f.group==='H'?'過熱突破':f.group==='D'?'舊突破失效':f.group==='B'?'強勢延伸':'條件待確認';
 sop=f.group==='M'?'中軌突破後只在守住中軌／訊號低點且量價延續時升級；跌回中軌下立即取消。':f.group==='A'?'若守突破區可分批研究；跌破突破日低點／中軌則退出此劇本。':f.group==='H'?'等回測而不是追價。':f.group==='D'?'等待全新突破訊號，不把舊訊號當作自動恢復。':f.group==='N'?'等待下一交易日守價、守量後才升級。':'等待所有必要條件同時成立。';
 items.push(['突破／防守',k,text,sop,f.group==='A'?100:f.group==='M'?(f.midline?.current?.score||f.midline?.score||70):f.group==='N'?72:f.group==='H'?45:f.group==='D'?15:50]);
 return items;
}
function renderPerItemSOP(r,f,e){
 const items=perItemSOP(r,f,e);
 return `<div style="margin-top:10px"><b style="color:#C6C1D9;font-size:17px">逐項分析＋SOP</b><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;margin-top:6px">${items.map(([name,kind,text,sop,pct])=>{const t=visualTone(kind);const p=Math.max(0,Math.min(100,Number(pct)||0));return `<div style="background:#40375B;border:1px solid ${t.color}55;border-radius:8px;padding:9px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${t.icon} ${esc(name)}</b><span style="font-size:16px;color:${t.color}">${esc(text)}</span></div><div style="height:6px;background:#40375B;border-radius:999px;overflow:hidden;margin:7px 0"><div style="height:100%;width:${p}%;background:${t.color}"></div></div><div style="font-size:17px;line-height:1.45"><b style="color:${t.color}">SOP：</b>${esc(sop)}</div></div>`;}).join('')}</div></div>`;
}
function renderMidlineEngine(r,f){
 const s=r.s,t=s.cl.length-1,b=SelectionRules.bands(s.cl,20,2),gate=ruleGate(s,s.d[t]);
 const mm=f.midline?.current||SelectionRules.midlineSnapshot(s,t,b,SP,gate);if(!mm)return '';
 const tier=f.midline?.tier||mm.tier||'';const health=f.midline?.health||{state:'signal',label:'訊號初始',ret:0,progressDelta:0};const progress=Math.max(0,Math.min(100,Number(mm.progress)||0));
 const stage=tier==='M3'?'M3 上軌攻擊監測':tier==='M2'?'M2 強啟動監測':tier==='M1'?'M1 初啟動':'未觸發M組';const healthTone=health.state==='accelerating'?'#F3A1B5':health.state==='healthy'||health.state==='holding'?'#A6B8D7':health.state==='fade'?'#95D1B4':'#C6C1D9';
 const tone=tier==='M3'||tier==='M2'?'#A6B8D7':tier==='M1'?'#C6C1D9':'#A6B8D7';
 const volLabel=gate.provisional?`盤中量速 ${f2(mm.volumePaceRatio)}×`:`20日量比 ${f2(mm.volumeRatio)}×`;
 const sop=health.state==='accelerating'?'續攻已加速；優先監測上軌觸及／正式突破，但仍不追價，突破後等回測或A組確認。':health.state==='healthy'||health.state==='holding'?'訊號後仍維持正向推進；守住中軌與訊號低點，觀察量價是否再加速。':tier==='M3'?'已進入上軌攻擊帶；這是監測訊號，不直接追價。等正式上軌突破後回測不破／A組延續確認再評估。':tier==='M2'?'中軌強啟動；觀察上軌距離是否縮到3%內、CLV與量能是否維持。':tier==='M1'?'初步突破中軌；先等量價再確認，未升級前不當成上軌突破。':'目前沒有同時通過中軌位置、量價、RSI與上軌路徑條件。';
 return `<div style="margin:8px 0 10px;padding:10px;border:1px solid ${tone}55;border-radius:10px;background:linear-gradient(90deg,#40375B,#40375B)"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><b style="color:${tone}">中軌→上軌 動能引擎｜${esc(stage)}</b><span style="font-size:17px">續攻 <b style="color:${healthTone}">${esc(health.label||'訊號初始')}</b>　動能分 <b style="color:${tone}">${Math.round(mm.score||0)}/100</b>　${esc(volLabel)}　CLV ${f2((mm.clv||0)*100)}%　RSI ${f2(mm.rsi)}</span></div><div style="margin-top:8px;display:grid;grid-template-columns:70px 1fr 70px;gap:8px;align-items:center;font-size:16px;color:var(--muted)"><span>中軌 ${f2(mm.mid)}</span><div style="height:10px;border-radius:999px;background:#40375B;position:relative;overflow:hidden"><div style="height:100%;width:${progress}%;background:${tone}"></div></div><span style="text-align:right">上軌 ${f2(mm.up)}</span></div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:16px;color:var(--muted)"><span>中軌上方 ${f2(mm.crossPct)}%</span><span>路徑 ${f2(mm.progress)}%</span><span>距上軌 ${f2(mm.distUpper)}%</span><span style="color:${healthTone}">續攻 ${health.ret==null?'—':(health.ret>=0?'+':'')+f2(health.ret)}%／進度Δ ${health.progressDelta==null?'—':(health.progressDelta>=0?'+':'')+f2(health.progressDelta)}pct</span></div><div style="margin-top:7px;font-size:17px;border-left:3px solid ${tone};padding-left:8px"><b style="color:${tone}">SOP：</b>${esc(sop)}</div>${mm.riskFlags?.length?`<div style="margin-top:5px;color:#C6C1D9;font-size:16px">⚠ ${esc(mm.riskFlags.join('；'))}</div>`:''}<div style="margin-top:5px;color:#A6B8D7;font-size:15px">內部保留期事件研究（2026/07/29後）：訊號日5日內收盤觸及上軌 M1 40.5% (n=116)／M2 53.6% (n=56)／M3 60.0% (n=40)。訊號後若仍守結構且報酬≥1%、中→上軌進度增加≥10pct、CLV≥50%，後續5日觸及率84.5% (n=71)；反之報酬<0或進度退化>15pct僅17.3% (n=162)，因此自動退出M快速池。事件重疊且期間有限，不代表未來勝率；M組仍不是直接追價訊號。</div></div>`;
}
function renderVisualJudge(r,f,e){
 const q=f.quality||{}, sop=sopModelForSelection(r,f,e);
 const traffic=[
  ['趨勢',q.trendScore,25,q.trendScore>=20?'✅':'⚠️',q.trendScore>=20?'趨勢完整':'趨勢普通'],
  ['突破',q.breakoutScore,20,q.breakoutScore>=15?'✅':'⚠️',q.breakoutScore>=15?'突破條件佳':'突破待確認'],
  ['量價',q.volumeScore,20,q.volumeScore>=14?'✅':'⚠️',q.volumeScore>=14?'量價效率佳':'量價普通'],
  ['位置',q.positionScore,20,q.positionScore>=14?'✅':'⚠️',q.positionScore>=14?'位置可接受':'位置需保守'],
  ['流動性',q.liquidityScore,15,q.liquidityScore>=10?'✅':'⚠️',q.liquidityScore>=10?'波動可接受':'波動偏大']
 ];
 const colorMap=['#A6B8D7','#C6C1D9','#C6C1D9','#C6C1D9','#40375B'];
 const compact=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="color:#C6C1D9">AI 一眼判斷</b><span style="display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid ${sop.tone}66;color:${sop.tone};font-weight:800;background:${sop.tone}18">${esc(sop.tag)}</span><span style="color:var(--muted);font-size:17px">舊版文字說明完整保留；AI 僅做補充</span></div>
 <div class="aiCompact">${traffic.map((x,i)=>barHtml(`${x[3]} ${x[0]}`,x[1],x[2],colorMap[i])).join('')}</div>
 <div style="margin-top:8px;padding:7px 9px;border-left:4px solid ${sop.tone};background:#40375B;border-radius:6px;font-size:17px"><b style="color:${sop.tone}">空手</b>：${esc(sop.flat)}　｜　<b style="color:${sop.tone}">持有</b>：${esc(sop.held)}<br><b style="color:#C6C1D9">下一步</b>：${esc(sop.trigger)}</div>`;
 const detailHtml=`<details><summary>展開 AI 比較表、逐項 SOP 與關鍵價</summary>
 <div style="margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:#40375B">
 <div style="display:grid;grid-template-columns:1.2fr .8fr;gap:10px">
   <div style="background:#40375B;border:1px solid var(--line);border-radius:8px;padding:8px">
     <b style="color:#C6C1D9;font-size:17px">重點數據表</b>
     <table style="width:100%;margin-top:6px;border-collapse:collapse;font-size:17px">${sop.levels.map(([k,v])=>`<tr><td style="padding:5px 6px;border-bottom:1px dashed #8E97B8">${esc(k)}</td><td style="padding:5px 6px;border-bottom:1px dashed #8E97B8;text-align:right;font-weight:700">${esc(v)}</td></tr>`).join('')}</table>
   </div>
   <div style="background:#40375B;border:1px solid var(--line);border-radius:8px;padding:8px">
     <b style="color:#C6C1D9;font-size:17px">條件燈號</b>
     <table style="width:100%;margin-top:6px;border-collapse:collapse;font-size:17px">${traffic.map(x=>`<tr><td style="padding:5px 6px;border-bottom:1px dashed #8E97B8">${x[0]}</td><td style="padding:5px 6px;border-bottom:1px dashed #8E97B8;text-align:right">${x[3]} ${x[4]}</td></tr>`).join('')}</table>
   </div>
 </div>
 ${renderCompareTable(r,f)}
 ${renderPerItemSOP(r,f,e)}
 </div></details>`;
 return renderMidlineEngine(r,f)+compact+detailHtml;
}

let riskSelection=null;
function renderRisk(r,f){
 riskSelection={r,f};riskPanel.style.display='block';
 const plan=SelectionRules.riskPlan(r.s,f,{budget:$('riskBudget').value,capital:$('riskCapital').value,costPct:$('riskCost').value});
 $('riskResult').innerHTML=plan.available?`<div>${f.provisional?'盤中快照試算・':asOf?'歷史情境試算・':''}價格 ${f2(plan.entry)}｜防守參考 ${f2(plan.stop)}（中軌與突破日低點取較高者）</div>
 <div>防守距離 ${f2(plan.distance)} 元／${f2(plan.stopPct)}%｜前14根完整K棒平均真實波幅 ${f2(plan.atr)}｜距離／波幅 ${f2(plan.atrRatio)} 倍</div>
 <div>${plan.atrRatio!=null&&plan.atrRatio<0.5?'注意：防守距離小於半個平均波幅，部位試算可能過大；不是額外買點。':''}</div>
 <div>假設2R價格 ${f2(plan.twoR)}（非預測、未扣成本）</div>
 ${plan.shares==null?'':`<b>試算上限 ${plan.shares.toLocaleString()} 股；若限整張，最多 ${plan.lots} 張</b><div>估算資金含緩衝 ${f2(plan.estimatedCapital)} 元｜估算風險含緩衝 ${f2(plan.estimatedLoss)} 元</div>`}
 <div>${esc(plan.reason)}</div><div>防守是條件參考，不保證成交價；本工具不下單、不推定獲利機率。</div>`:esc(plan.reason);
}
for(const id of ['riskBudget','riskCapital','riskCost'])$(id).oninput=()=>{if(riskSelection)renderRisk(riskSelection.r,riskSelection.f);};

function dailyActionSop(r,f,e){
 const s=r.s,t=s.cl.length-1,b=SelectionRules.bands(s.cl,20,2),now=b[t],q=f.quality||{};
 let db=r.dailyBias; if(!db){try{db=SingleStockCore.dailyBias({...s,_ssaProvisional:!!f.provisional});}catch(_e){db={bias:'neutral',label:'Daily Bias 資料不足',session:f.provisional?'今日':'下一交易日'};}}
 const price=Number(s.cl[t]),prior=Number(s.cl[t-1]),prevHigh=Number(s.h[t-1]),prevLow=Number(s.l[t-1]);
 const change=prior>0?(price/prior-1)*100:0,distUpper=now&&now.up>0?(price/now.up-1)*100:null;
 const signalLow=Number(f.signal?.low),defenseCandidates=[Number(now?.mid),signalLow].filter(Number.isFinite),defense=defenseCandidates.length?Math.max(...defenseCandidates):Number(now?.mid);
 const overheat=q.overheat?.isOverheated||f.group==='H'||(Number(q.overheat?.count)||0)>=2;
 let tag='🟡 等待',tone='#C6C1D9',nowText='條件尚未完成，先等，不急著做。',flat='先觀察，不追價。',held='續抱觀察，但不要因一天上漲就加碼。',trigger='',avoid='不要在條件未確認前追價或攤平。';
 if(f.group==='A'){
  tag='🔴 延續確認';tone='#F3A1B5';nowText='突破後的延續條件仍成立，屬於可以繼續追蹤的強勢股。';
  flat=price>prevHigh?'已突破前一日高點；若下一根K仍守住防守線，可列分批研究，不用一次追滿。':'先等價格重新突破前一日高點，再考慮分批。';
  held='可以續抱；只要沒有跌破防守線，就讓趨勢繼續走。';
  trigger=`下一步看 ${f2(prevHigh)} 是否站穩；站穩且量價沒有轉弱，可續看上攻。`;
  avoid='若爆量長上影、價跌量增，或跌破防守線，不要再加碼。';
 }else if(f.group==='M'){
  const tier=f.midline?.tier||f.midline?.current?.tier||'M1';
  tag=tier==='M3'?'🔴 中軌續攻':'🟡 中軌啟動';tone=tier==='M3'?'#F3A1B5':'#A6B8D7';
  nowText=tier==='M3'?'股價已從中軌往上軌推進，動能較完整，但仍不是追價訊號。':'剛站回中軌附近，方向轉強，但還要看下一步是否繼續往上軌走。';
  flat=`先不要追；等回測中軌 ${f2(now?.mid)} 不破，或重新突破前一日高點 ${f2(prevHigh)} 再評估。`;
  held=`可續抱觀察；中軌 ${f2(now?.mid)} 是第一道防守，跌破就降低期待。`;
  trigger=`守住中軌後，再突破 ${f2(prevHigh)}，且量能／收盤位置維持強勢，才視為續攻確認。`;
  avoid='只站上中軌但量價沒有延續，不要把它當成主升段直接追。';
 }else if(f.group==='N'){
  tag='🟡 新突破待確認';tone='#A6B8D7';nowText='今天剛突破，方向偏多，但第一天最容易出現假突破。';
  flat=`先等下一交易日；若仍守住上軌 ${f2(now?.up)}，並突破前日高點 ${f2(prevHigh)}，再升級為延續確認。`;
  held='已有持股可以續抱觀察，但不因首日突破就大幅加碼。';
  trigger=`下一根K守住 ${f2(now?.up)} 且再過 ${f2(prevHigh)}，才算突破有延續。`;
  avoid='不要在第一根大陽線尾端追價。';
 }else if(f.group==='H'||f.group==='B'){
  tag='🟠 強勢但過熱';tone='#C6C1D9';nowText='趨勢很強，但價格已跑太快；現在最大的風險不是看錯方向，而是買得太高。';
  flat=`不追價；等回測上軌 ${f2(now?.up)}／中軌 ${f2(now?.mid)} 或突破區後止跌，再重新評估。`;
  held=`可以續抱，但把防守線提高到 ${f2(defense)}；若出現爆量長上影或跌破防守線，分批降低部位。`;
  trigger=`等拉回後量縮止跌，再出現重新轉強K棒；不是越漲越買。`;
  avoid='不要因為漲停、MACD很強或站上上軌就直接追。';
 }else if(f.group==='D'){
  tag='🟢 結構轉弱';tone='#95D1B4';nowText='舊突破已失效，目前先以風險控制為主。';
  flat='不開新倉，等待重新站回中軌並形成新的突破訊號。';
  held=`若反彈仍站不回 ${f2(now?.mid)}，以減碼／退出優先；不要用攤平取代停損。`;
  trigger=`重新站回中軌 ${f2(now?.mid)}，再突破近期高點，才重新評估。`;
  avoid='不要把反彈誤當成原突破自動恢復。';
 }else if(f.group==='C'||f.group==='V'||f.group==='NONE'){
  tag='🟡 整理等待';tone='#C6C1D9';nowText='目前沒有完整的續攻條件，先等市場自己證明。';
  flat=`等待站穩中軌 ${f2(now?.mid)}，並突破前一日高點 ${f2(prevHigh)} 再看。`;
  held=`若仍守中軌可續看；跌破 ${f2(defense)} 則降低部位。`;
  trigger=`價格轉強＋量能配合＋重新突破 ${f2(prevHigh)}。`;
  avoid='沒有訊號就不要為了怕錯過而硬追。';
 }
 // Daily Bias is the top-level direction filter. It can veto a long setup, but never creates an entry by itself.
 if(db.bias==='bear'&&f.group!=='D'){
  tag='🟢 Daily Bias 偏空／先防守';tone='#95D1B4';nowText=`${db.label||'Daily Bias 偏空'}；原選股條件先降級，不啟動多方進場。`;
  flat='暫不開多單；等新的向上 CHoCH/BOS、重新站回布林中軌並有量價確認後再評估。';
  held=`已有持股以風險控制優先；${Number.isFinite(Number(db.pdl))?`先觀察 PDL ${f2(db.pdl)} 與下方支撐，`:''}若主要結構支撐失守則降低部位。`;
  trigger='偏空 Bias 只代表方向優先權；要轉回多方，必須由新的結構與布林共振證明。';
  avoid='不要因單一 MACD、漲停或碰到支撐就逆 Bias 接刀。';
 }else if(db.bias==='neutral'&&['A','M','N'].includes(f.group)){
  tag='🟡 Daily Bias 弱／等待';tone='#C6C1D9';nowText=`${db.label||'Daily Bias 中性'}；即使技術面偏強，也先等盤中結構確認。`;
  flat='先等 BOS/CHoCH 與布林、量價同向；沒有方向優勢時不勉強交易。';
  held='已有持股可依原防守線管理，但不因單一強勢指標主動加碼。';
  trigger='等待 C3 出現清楚的方向確認，再把 SNR／OB-FVG 當作操作位置。';
  avoid='區間中段與雙掃後不要硬猜方向。';
 }else if(db.bias==='bull'){
  nowText=`${db.label||'Daily Bias 偏多'}；${nowText}`;
  if(Number.isFinite(Number(db.primaryTarget)))trigger+=`　Daily Bias 第一目標 ${db.targetLabel||'PDH'} ${f2(db.primaryTarget)}${db.targetReached?' 已觸及，改看下一個 BSL／R1。':'。'}`;
 }
 if(overheat&&db.bias!=='bear'){tag='🟠 過熱勿追';tone='#C6C1D9';nowText=`${db.bias==='bull'?'Daily Bias 偏多，但':''}短線已過熱；空手先等回檔，比追高更重要。`;}
 const hot=q.overheat?.triggers||[];
 const plain=[];
 plain.push(`Daily Bias：${db.label||'—'}｜${db.preferred||'等待'}${Number.isFinite(Number(db.primaryTarget))?`｜${db.targetLabel||'目標'} ${f2(db.primaryTarget)}${db.targetReached?' 已觸及':''}`:''}。`);
 plain.push(change>=0?`價格：今天上漲 ${f2(change)}%，短線買盤較強。`:`價格：今天下跌 ${f2(Math.abs(change))}%，先看支撐是否守住。`);
 if(distUpper!=null)plain.push(distUpper>3?`位置：收盤已高於上軌 ${f2(distUpper)}%，屬延伸偏大，追價風險提高。`:distUpper>=0?`位置：收盤在上軌附近／上方 ${f2(distUpper)}%，趨勢強但要防追高。`:`位置：距上軌還有 ${f2(Math.abs(distUpper))}% 空間，仍要看量價是否續強。`);
 if(now)plain.push(now.mid> b[t-1].mid?`趨勢：20日中軌仍往上，波段方向偏多；中軌 ${f2(now.mid)} 是第一道防守。`:`趨勢：20日中軌沒有繼續上彎，短線不宜只看紅K追價。`);
 if(q.pv)plain.push(q.pv.state==='價漲量增'?`量價：上漲有量配合，屬正向；但量太大仍要留意是否爆量不漲。`:q.pv.state==='價跌量增'?`量價：下跌同時放量，賣壓較重，先防守。`:`量價：${q.pv.state||'中性'}，目前不是單靠成交量就能確認續攻。`);
 if(q.macd)plain.push((q.macd.histPct??0)>=95?`動能：MACD很強但也很熱（${f2(q.macd.histPct)}%位階），持有可看趨勢，空手不適合因動能高就追。`:`動能：MACD ${q.macd.state||'中性'}，可當確認條件，但不能單獨決定買賣。`);
 if(hot.length)plain.push(`追價風險：${hot.join('；')}。`);
 const levels=[['PDH',db.pdh],['PDL',db.pdl],['C1H',db.c1?.high],['C1L',db.c1?.low],['前日高點',prevHigh],['前日低點',prevLow],['20日中軌',now?.mid],['上軌',now?.up],['防守線',defense]].filter((x,i,a)=>Number.isFinite(Number(x[1]))&&a.findIndex(y=>y[0]===x[0]&&Number(y[1])===Number(x[1]))===i);
 return {tag,tone,nowText,flat,held,trigger,avoid,plain,levels,db};
}

function drawDailyExplanation(){
 const r=ROWS.find(r=>r.code===selCode);
 if(!r){dailyPanel.innerHTML='';aiVisualPanel.innerHTML='';riskPanel.style.display='none';return;}
 let f=r.rule;
 if(!f){
  const gate=ruleGate(r.s,asOf||quality.latest_bar||r.date);f={...SelectionRules.classify(r.s,SP,gate),provisional:gate.provisional};
 }
 const e=SelectionRules.explain(r.s,f,SP);
 renderRisk(r,f);
 const mode=f.provisional?'盤中條件已判定，非交易指令':asOf?'歷史回看，非今日買賣建議':'收盤／歷史技術條件判讀';
 const ds=dailyActionSop(r,f,e),db=ds.db||{};const dbTone=db.bias==='bull'?'#F3A1B5':db.bias==='bear'?'#95D1B4':'#C6C1D9';
 dailyPanel.innerHTML=`<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px"><b style="color:var(--accent);font-size:20px">${esc(db.session||'今日')}操作 SOP</b><span style="padding:4px 10px;border-radius:999px;border:1px solid ${ds.tone}77;color:${ds.tone};background:${ds.tone}16;font-weight:800">${esc(ds.tag)}</span><span style="padding:4px 9px;border-radius:999px;border:1px solid ${dbTone}66;color:${dbTone};font-weight:800">Daily Bias｜${esc(db.bias==='bull'?'偏多':db.bias==='bear'?'偏空':'中性')}</span><span style="color:var(--muted);font-size:16px">${esc(e.previousDate||'')} → ${esc(e.date||r.date)}</span></div>
 <div style="padding:9px 11px;background:#40375B;border:1px solid ${ds.tone}44;border-radius:9px;margin-bottom:8px"><b style="color:${ds.tone}">一句話：</b>${esc(ds.nowText)}</div>
 <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:7px">
  <div style="padding:8px 10px;border:1px solid #8E97B8;border-radius:8px;background:#40375B"><b style="color:#A6B8D7">① 空手怎麼做</b><div style="margin-top:4px">${esc(ds.flat)}</div></div>
  <div style="padding:8px 10px;border:1px solid #8E97B8;border-radius:8px;background:#40375B"><b style="color:#F3A1B5">② 已持有怎麼做</b><div style="margin-top:4px">${esc(ds.held)}</div></div>
  <div style="padding:8px 10px;border:1px solid #8E97B8;border-radius:8px;background:#40375B"><b style="color:#C6C1D9">③ 下一步看什麼</b><div style="margin-top:4px">${esc(ds.trigger)}</div></div>
  <div style="padding:8px 10px;border:1px solid #95D1B4;border-radius:8px;background:#40375B"><b style="color:#95D1B4">④ 什麼不要做</b><div style="margin-top:4px">${esc(ds.avoid)}</div></div>
 </div>
 <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">${ds.levels.map(([k,v])=>`<span style="padding:4px 8px;border:1px solid var(--line);border-radius:999px;background:#40375B;font-size:16px"><b>${esc(k)}</b> ${f2(v)}</span>`).join('')}</div>
 <details style="margin-top:8px"><summary style="color:#C6C1D9">為什麼這樣做？展開白話判讀</summary>${ds.plain.map(x=>`<div style="margin:6px 0">• ${esc(x)}</div>`).join('')}
 <details style="margin-top:7px"><summary style="color:var(--muted)">查看完整技術數據</summary>${e.reasons.map(x=>`<div style="margin:5px 0;color:var(--muted)">• ${esc(x)}</div>`).join('')}<div style="color:var(--muted);font-size:16px;margin-top:6px">${esc(mode)}。防守位置是技術觀察值，不保證成交價；上軌不是單獨賣出訊號。</div></details></details>`;
 aiVisualPanel.innerHTML=renderVisualJudge(r,f,e);
}

const legacyColumns=document.createElement('button');legacyColumns.id='legacyColumns';legacyColumns.type='button';legacyColumns.className='btn small';
legacyColumns.textContent=legacyDetail?'精簡欄位':'完整指標';legacyColumns.title='精簡顯示價量與評分；完整指標保留所有欄位，可左右捲動';
$('listHead').append(legacyColumns);legacyColumns.onclick=()=>{legacyDetail=!legacyDetail;store.set('bb_legacy_detail',legacyDetail);legacyColumns.textContent=legacyDetail?'精簡欄位':'完整指標';document.querySelector('main').dataset.legacyDetail=String(legacyDetail);renderTable();};
$('screenMode').value=screenMode;
$('timingMode').value=timingMode;
if($('dailyBiasFilter'))$('dailyBiasFilter').value=dailyBiasFilter;
$('maxAge').onchange=()=>{const v=Number($('maxAge').value);maxAge=Math.max(5,Math.min(120,Number.isFinite(v)?v:15));$('maxAge').value=maxAge;store.set('bb_max_age',maxAge);recompute();};
function ruleGate(s,target){
 const hard=[],soft=[],clock=taipeiClock();
 const hasTarget=s.d.at(-1)===target;
 let dataStatus='OK',dataStatusLabel='即時／可用',dataAge=null;
 if(quality.mock)hard.push('模擬資料');
 if(target>clock.today)hard.push('未來日期無效');
 if(asOf&& !hasTarget)hard.push('所選歷史日期缺少日K');
 if(!asOf&&quality.expected_weekday&&target<quality.expected_weekday)hard.push('資料落後最近預定交易日');
  if(!asOf&&quality.offline)hard.push('離線快取，僅供歷史回看');
  if(!asOf&&quality.calendar?.verified_year===false)hard.push('本年度休市日未核對');
 const fetched=s.live_quote_at?Date.parse(s.live_quote_at):s.live_fetched_at?Date.parse(s.live_fetched_at):(s.fetched_at?Date.parse(s.fetched_at):revision*1000);
 const cutoff=Date.parse(target+'T13:35:00+08:00');
 if(target===clock.today&&!asOf){
  if(!hasTarget){
   dataStatus='Q1';dataStatusLabel='Q1 等待即時刷新';
   soft.push('尚未取得今日盤中K棒；暫以最近完整日K顯示結構，等待輪詢刷新');
  }else if(!Number.isFinite(fetched)||fetched<=0||fetched>Date.now()+60000){
   dataStatus='Q1';dataStatusLabel='Q1 等待即時刷新';
   soft.push('今日K棒已有價格，但缺少有效快照時間；等待下一輪刷新');
  }else{
   dataAge=Math.max(0,(Date.now()-fetched)/60000);
   if(dataAge>maxAge){
    dataStatus='Q2';dataStatusLabel='Q2 快照稍舊';
    soft.push(`今日快照約 ${dataAge.toFixed(0)} 分鐘前；仍計算技術結構，但不列高優先推薦`);
   }
  }
  if(s.cached_fallback&&dataStatus==='OK'){
   dataStatus='Q2';dataStatusLabel='Q2 快照稍舊';soft.push('日K更新曾沿用快取，今日盤中價可用但降低資料信心');
  }
 }else if(s.cached_fallback){
  hard.push('更新失敗沿用快取');
 }
 const previous=marketDates.filter(d=>d<target).at(-1);
 if(hasTarget&&previous&&s.d.at(-2)!==previous)hard.push(`缺少樣本共同前一資料日 ${previous}，不進行隔日強弱判讀`);
 let provisional=timingMode==='intraday'&&quality.calendar?.session==='intraday'&&target===clock.today&&hasTarget&&!asOf;
 if(!provisional && !asOf && target===clock.today && (!Number.isFinite(fetched)||!fetched||fetched<cutoff||clock.minutes<815)){
  hard.push('尚未取得該日13:35後資料；盤中請切換「盤中更新即判定」，收盤後須重新更新');
 }
 if(hard.length){dataStatus='Q3';dataStatusLabel='Q3 資料異常';}
 const volumeExpectedFraction=provisional?expectedVolumeFraction(clock.minutes):1;
 const volumePaceReliable=!provisional||clock.minutes>=555;
 return {reason:hard.join('；'),softReason:soft.join('；'),dataStatus,dataStatusLabel,dataAge,provisional,volumeExpectedFraction,volumePaceReliable};
}
recompute=function(){
 marketDates=[...new Set(RAW.flatMap(s=>s.d))].sort();
 const dates=marketDates.slice().reverse().slice(0,30);
 $('asOf').innerHTML='<option value="">最新資料（檢查新鮮度）</option>'+dates.map(d=>`<option value="${d}">${d} 歷史回看</option>`).join('');
 if(asOf&&!dates.includes(asOf))asOf='';$('asOf').value=asOf;
 const target=asOf||dates[0];
 const signature=JSON.stringify([revision,liveRevision,asOf,timingMode,maxAge,SP,quality.offline,quality.mock,quality.expected_weekday,quality.calendar?.session,quality.calendar?.verified_year,taipeiClock().today,taipeiClock().minutes,RAW.length]);
 if(signature!==researchSignature){
 const oldP=P;P={...P,period:20,mult:2};
 try{RESEARCH_ROWS=RAW.map(raw=>{
  const end=raw.d.filter(d=>d<=target).length;
  if(!end)return null;
  const s={...raw};for(const k of ['d','o','h','l','cl','v'])s[k]=raw[k].slice(0,end);
  const r=analyze(s);if(!r)return null;
  const gate=ruleGate(s,target);
  r.rule=SelectionRules.classify(s,SP,gate);r.rule.provisional=gate.provisional;r.rule.fetchedAt=s.live_fetched_at||s.fetched_at||updated;r.rule.dataStatus=gate.dataStatus;r.rule.dataStatusLabel=gate.dataStatusLabel;r.rule.dataAge=gate.dataAge;r.rule.softReason=gate.softReason;if(r.rule.group==='Q')r.rule.dataStatus='Q3';
  r.middleBreakout=SelectionRules.middleBreakout(s,gate);try{r.dailyBias=SingleStockCore.dailyBias({...s,_ssaProvisional:gate.provisional});}catch(_e){r.dailyBias={bias:'neutral',setup:'insufficient',label:'資料不足',shortLabel:'中性／等待'};}
  if(gate.provisional)r.rule.checks=r.rule.checks.map(([ok,text])=>[ok,text.replaceAll('收盤','最新價格').replace('成交量／','累計成交量／')]);
  if(r.rule.signal){r.dayNo=s.cl.length-r.rule.signal.i;r.st='A';}else{r.dayNo=null;r.st=null;}
  return r;
 }).filter(Boolean);}finally{P=oldP;}
 researchSignature=signature;researchByCode=new Map(RESEARCH_ROWS.map(r=>[r.code,r]));
 }
 if(screenMode==='legacy'){
  const allRaw=RAW;
  try{
   RAW=RAW.map(raw=>{const end=raw.d.filter(d=>d<=target).length;if(!end)return null;const s={...raw};for(const k of ['d','o','h','l','cl','v'])s[k]=raw[k].slice(0,end);return s;}).filter(Boolean);
   saved.recompute();
  }finally{RAW=allRaw;}
  drawSelected();return;
 }
 ROWS=RESEARCH_ROWS;applyFilters();drawSelected();
};
applyFilters=function(){
 if(screenMode==='legacy'){ROWS.forEach(r=>r.middleBreakout=researchByCode.get(r.code)?.middleBreakout);saved.applyFilters();renderRecommendations();return;}
 const q=$('q').value.trim().toLowerCase(),only=$('onlyFav').checked;
 const base=ROWS.filter(r=>(!q||r.code.includes(q)||r.name.toLowerCase().includes(q))&&(!only||fav.has(r.code))&&!offMkt.has(r.mkt)&&!offInd.has(r.ind)&&(!dailyBiasFilter||r.dailyBias?.bias===dailyBiasFilter));
 const counts={};base.forEach(r=>counts[r.rule.group]=(counts[r.rule.group]||0)+1);counts.K=base.filter(r=>r.middleBreakout?.eligible).length;
 const dsCounts={OK:0,Q1:0,Q2:0,Q3:0};base.forEach(r=>dsCounts[r.rule.dataStatus||'OK']=(dsCounts[r.rule.dataStatus||'OK']||0)+1);
 $('ruleGroups').innerHTML=Object.entries(GROUPS).filter(([k])=>k!=='NONE').map(([k,v])=>`<button class="stage ${!dataStatusFilter&&k===selectedGroup?'on':''}" data-g="${k}"><span>${groupLabel(k)}</span><b class="cnt">${k==='ALL'?base.filter(r=>r.rule.group!=='NONE').length:counts[k]||0}</b></button>`).join('');
 const dsNames={Q1:'Q1 等待即時刷新',Q2:'Q2 快照稍舊',Q3:'Q3 資料異常'};
 $('dataStatusGroups').innerHTML=Object.entries(dsNames).map(([k,v])=>`<button class="stage ${dataStatusFilter===k?'on':''}" data-ds="${k}"><span>${v}</span><b class="cnt">${dsCounts[k]||0}</b></button>`).join('');
 VIEW=dataStatusFilter?base.filter(r=>(r.rule.dataStatus||'OK')===dataStatusFilter):base.filter(r=>q||only?true:selectedGroup==='K'?!!r.middleBreakout?.eligible:selectedGroup==='ALL'?r.rule.group!=='NONE'||!!r.middleBreakout?.eligible:r.rule.group===selectedGroup);
 sortView();renderTable();renderRecommendations();
 const liveCoverage=provisionalView()?`｜盤中覆蓋 ${quality.live_count||0}/${RAW.length}（即時≤15分 ${quality.live_fresh_count||0}・稍舊16–30分 ${quality.live_stale_count||0}・更舊 ${quality.live_old_count||0}・待刷新 ${quality.live_pending_count||0}）`:' ';
 $('strategyNotice').textContent=`${timingLabel()}${asOf?' '+asOf:''}｜${provisionalView()?'Q1/Q2仍計算結構但不進高優先推薦；Q3才停止判定':'未通過硬性資料檢查者列Q3'}${liveCoverage}｜Daily Bias ${dailyBiasFilter?({bull:'偏多',bear:'偏空',neutral:'中性'}[dailyBiasFilter]||dailyBiasFilter):'全部'}｜資料分層 Q1 ${dsCounts.Q1||0}・Q2 ${dsCounts.Q2||0}・Q3 ${dsCounts.Q3||0}｜規則 ${SelectionRules.version}｜載入 ${RAW.length}・可計算 ${ROWS.length}・M ${counts.M||0}・A ${counts.A||0}`;
 if(dsCounts.Q3) $('strategyNotice').textContent+=`｜Q3示例：${base.find(r=>(r.rule.dataStatus||'')==='Q3')?.rule.reasons?.join('；')||'資料異常'}`;
};
const STRATEGY_COLS=[
 {k:'fav',t:'★',l:true,tip:'依自選星號排序'},
 {k:'stock',t:'股票',l:true,tip:'依股票代號排序（再點一次反向）'},
 {k:'group',t:'分組',tip:'依策略分組排序'},
 {k:'dataStatus',t:'資料',tip:'依資料品質 OK／Q1／Q2／Q3 排序'},
 {k:'bias',t:'Daily Bias',tip:'依 C1/C2 日內偏見排序：偏多／中性／偏空'},
 {k:'score',t:'研究分',tip:'依研究分數排序'},
 {k:'midlineScore',t:'中軌動能',tip:'依中軌動能分數排序'},
 {k:'macd',t:'MACD',tip:'依 MACD 狀態排序'}
];
function strategySortValue(r,k){
 const f=r.rule||{},q=f.quality||{},mm=f.midline?.current||f.midline||{};
 if(k==='fav')return fav.has(r.code)?1:0;
 if(k==='stock')return String(r.code||'');
 if(k==='group'){const order={A:0,M:1,V:2,N:3,C:4,H:5,B:6,D:7,Q:8,NONE:9};return order[f.group]??99;}
 if(k==='dataStatus'){const order={OK:0,Q1:1,Q2:2,Q3:3};return order[f.dataStatus||'OK']??9;}
 if(k==='bias'){const order={bull:0,neutral:1,bear:2};return order[r.dailyBias?.bias||'neutral']??9;}
 if(k==='score')return Number.isFinite(Number(f.score))?Number(f.score):null;
 if(k==='midlineScore')return Number.isFinite(Number(mm.score))?Number(mm.score):null;
 if(k==='macd'){
  const state=String(q.macd?.state||'');
  const rank=state.includes('多頭加速')?6:state.includes('多頭')?5:state.includes('黃金')?4:state.includes('中性')?3:state.includes('偏弱')?2:state.includes('空頭')||state.includes('死亡')?1:0;
  return `${String(rank).padStart(2,'0')}\u0000${state}`;
 }
 return null;
}
function strategyCompare(a,b){
 const k=strategySortKey,d=strategySortDir;
 let x=strategySortValue(a,k),y=strategySortValue(b,k);
 const xn=x==null||(typeof x==='number'&&!Number.isFinite(x)),yn=y==null||(typeof y==='number'&&!Number.isFinite(y));
 if(xn||yn){if(xn&&yn)return a.code.localeCompare(b.code);return xn?1:-1;} // missing values always last
 let c=0;
 if(typeof x==='string'||typeof y==='string')c=String(x).localeCompare(String(y),'zh-Hant',{numeric:true,sensitivity:'base'});
 else c=Number(x)-Number(y);
 if(c)return d*c;
 // Stable, useful tie-breakers for strategy columns.
 const fs=a.rule||{},gs=b.rule||{};
 if(k==='group'||k==='dataStatus'||k==='bias')return (gs.score??-Infinity)-(fs.score??-Infinity)||a.code.localeCompare(b.code);
 return a.code.localeCompare(b.code);
}
sortView=function(){
 if(screenMode==='legacy')return saved.sortView();
 if(strategySortKey)return VIEW.sort(strategyCompare);
 VIEW.sort((a,b)=>rankMode==='return'?(b.rule.change??-Infinity)-(a.rule.change??-Infinity)||a.code.localeCompare(b.code):SelectionRules.compare(a.rule,b.rule)||a.code.localeCompare(b.code));
};
renderTable=function(){
 if(screenMode==='legacy'){
  saved.renderTable($('q').value.trim()||$('onlyFav').checked);
  const hidden=new Set(['ind','bw','minBw','rank','dayNo','chg5']);
  [...$('thead').children].forEach((th,i)=>{
   const hide=!legacyDetail&&hidden.has(COLS[i].k);th.hidden=hide;
   $('tbody').querySelectorAll('tr').forEach(tr=>{if(tr.children[i])tr.children[i].hidden=hide;});
  });
  return;
 }
 $('listTitle').textContent=dataStatusFilter?({Q1:'Q1 等待即時刷新',Q2:'Q2 快照稍舊',Q3:'Q3 資料異常'}[dataStatusFilter]):groupLabel(selectedGroup);$('listCount').textContent=`${VIEW.length} 檔`;
 // R10.19A：左側清單只保留一眼篩選欄位；價量／風險／訊號日期等細節合併到右側主圖說明。
 const headers=['★','股票','分組','資料','Daily Bias','研究分','中軌動能','MACD'];
 $('thead').innerHTML=STRATEGY_COLS.map(c=>`<th class="${c.l?'l':''} ${strategySortKey===c.k?'sorted':''}" data-strategy-sort="${c.k}" title="${esc(c.tip||'點一下排序；再點一次反向')}">${c.t}${strategySortKey===c.k?(strategySortDir>0?' ▲':' ▼'):''}</th>`).join('');
 $('tbody').innerHTML=VIEW.map(r=>{const f=r.rule,q=f.quality,mm=f.midline?.current||f.midline;const health=f.midline?.health,healthMark=health?.state==='accelerating'?'↑↑':health?.state==='healthy'?'↑':health?.state==='holding'?'→':'';const midTxt=mm?`${f.midline?.tier||mm.tier||''}${healthMark} ${Math.round(mm.score||0)}`:'—';return `<tr data-c="${r.code}" class="${r.code===selCode?'sel':''}"><td><span class="star ${fav.has(r.code)?'on':''}" data-star="${r.code}">★</span></td><td class="l">${esc(r.name)} <span class="code">${r.code}</span></td><td><span class="tag group-${esc(f.group)}" title="${esc(groupLabel(f.group))}">${esc(f.group)}</span>${r.middleBreakout?.eligible?'<span class="tag middleBreakout" title="獨立分類：中軌突破、OBV多頭、MACD多頭">中軌</span>':''}${f.preferred?' ★':''}</td><td><span class="tag data-${esc(f.dataStatus||'OK')}" title="${esc(f.softReason||f.reasons?.join('；')||'資料可用')}">${esc(f.dataStatus||'OK')}</span></td><td><span class="dbCell ${esc(r.dailyBias?.bias||'neutral')}" title="${esc(r.dailyBias?.label||'Daily Bias')}｜${esc(r.dailyBias?.formula||'')}">${esc(r.dailyBias?.bias==='bull'?'偏多':r.dailyBias?.bias==='bear'?'偏空':'中性')}</span></td><td>${f.score??'—'}</td><td>${esc(midTxt)}</td><td>${q?esc(q.macd.state):'—'}</td></tr>`;}).join('');
 $('empty').style.display=VIEW.length?'none':'block';$('empty').textContent='此組目前沒有符合股票。可查看其他分組、全部追蹤或選擇歷史日期；不會為湊名單放寬資料品質。';
 if(!VIEW.some(r=>r.code===selCode))selCode=VIEW[0]?.code||null;
 drawSelected();
};
function renderMiddleBreakoutEvidence(){
 let panel=document.getElementById('middleBreakoutEvidence');
 if(!panel){panel=document.createElement('div');panel.id='middleBreakoutEvidence';$('chartInfo').after(panel);}
 const r=researchByCode.get(selCode),m=r?.middleBreakout;
 const active=screenMode==='legacy'?stage==='K':selectedGroup==='K';
 panel.hidden=!m||(!active&&!m.eligible);if(panel.hidden)return;
 panel.innerHTML=`<b>中軌突破 · ${esc(m.date)} · ${m.eligible?(m.provisional?'盤中暫估，收盤需再確認':'三項條件符合'):'條件未成立'}</b><div>20日中軌 ${f2(m.mid)}｜OBV ${Math.round(m.obv||0).toLocaleString()} ／ OBV MA20 ${Math.round(m.obvMA20||0).toLocaleString()}｜DIF ${f2(m.macd?.dif)} ／ 訊號線 ${f2(m.macd?.dea)} ／ 柱 ${f2(m.macd?.hist)}</div>${m.checks.map(([ok,t])=>`<div>${ok?'✓':'✗'} ${esc(t)}</div>`).join('')}<small>獨立的當日分類，可與原分組重疊；中軌可以仍下彎，MACD可在零軸下轉強。不是買進訊號。</small>`;
}
drawSelected=function(){
 saved.drawSelected();
 drawDailyExplanation();renderMiddleBreakoutEvidence();
 $('ruleReasons').style.display=screenMode==='strategy'?'block':'none';
 if(screenMode!=='strategy')return;
 const r=ROWS.find(r=>r.code===selCode);if(!r){$('ruleReasons').textContent='';return;}
 const f=r.rule;
 const badge=$('chartHead').querySelector('.tag');if(badge)badge.textContent=groupLabel(f.group);
 const q=f.quality,db=r.dailyBias||{};
 $('ruleReasons').innerHTML=`<div style="padding:7px 9px;margin-bottom:7px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px"><b>Daily Bias：${esc(db.label||'資料不足')}</b>｜${esc(db.preferred||'等待')}｜${esc(db.targetLabel||'目標 —')} ${db.primaryTarget!=null?f2(db.primaryTarget):''}<div style="color:var(--muted)">${esc(db.formula||'')}｜${esc(db.explanation||'')}</div></div><div style="color:var(--accent)">${esc(f.dataStatusLabel||'資料可用')}：${esc(f.softReason|| (f.provisional?'依本次價格與累計量判定；下一次更新可能改變結果。':'收盤時間檢查不代表官方行情驗證。'))}｜下載：${esc(f.fetchedAt)}</div><b>${groupLabel(f.group)}${f.preferred?'・綜合條件優先':''}</b><div>${esc(f.reasons.join('；')||'延續確認條件全部符合')}</div>`+
 (q?`<div style="margin-top:6px"><b>研究品質分 ${q.score}/100・${esc(q.grade)}</b>｜趨勢 ${q.trendScore}/25｜突破 ${q.breakoutScore}/20｜量價效率 ${q.volumeScore}/20｜位置風險 ${q.positionScore}/20｜流動性波動 ${q.liquidityScore}/15</div><div>MACD：${esc(q.macd.state)}｜DIF ${f2(q.macd.dif)}｜DEA ${f2(q.macd.dea)}｜柱 ${f2(q.macd.hist)}｜60日動能位階 ${f2(q.macd.histPct)}%</div><div>價量：${esc(q.pv.state)}｜20日量比 ${f2(q.pv.ratio)}｜前日量比 ${f2(q.pv.volPrev)}｜CLV ${f2(q.pv.clv*100)}%｜OBV5 ${q.pv.obv5>=0?'+':''}${Math.round(q.pv.obv5).toLocaleString()}</div>${q.alerts.length?`<div style="color:#C6C1D9">⚠ ${esc(q.alerts.join('；'))}</div>`:''}`:'')+
 (f.midline?`<div style="color:#A6B8D7;margin-top:4px"><b>中軌動能 ${esc(f.midline.tier||'M')}</b>｜續攻 ${esc(f.midline.health?.label||'訊號初始')}｜動能分 ${f.midline.current?.score??f.midline.score??'—'}/100｜中軌→上軌 ${f2(f.midline.current?.progress??f.midline.progress)}%｜距上軌 ${f2(f.midline.current?.distUpper??f.midline.distUpper)}%</div>`:'')+
 (f.signal?`<div>${f.group==='M'?'中軌訊號':'突破'} ${f.signal.date}・價格 ${f2(f.signal.price)}・低點 ${f2(f.signal.low)}${f.signal.volume!=null?`・量 ${Number(f.signal.volume).toLocaleString()} 張`:''}${f.signal.rank!=null?`・收斂位階 ${f2(f.signal.rank)}%`:''}</div>`:'')+
 f.checks.map(([ok,t])=>`<div>${ok?'✓':'✗'} ${esc(t)}</div>`).join('')+
 renderVisualJudge(r,f,SelectionRules.explain(r.s,f,SP));
 // Strategy chart is always 20/2, independent of the legacy settings.
 $('why').style.display='none';
};
let priorityRefreshBusy=false,priorityRefreshLast=0;
async function priorityRefresh(){
 if(priorityRefreshBusy||!provisionalView()||Date.now()-priorityRefreshLast<2.5*60*1000)return;
 const codes=[...new Set(ROWS.filter(r=>['M','A','N'].includes(r.rule?.group)).sort((a,b)=>SelectionRules.compare(a.rule,b.rule)).slice(0,50).map(r=>r.code).concat(selCode?[selCode]:[]))];
 if(!codes.length)return;priorityRefreshBusy=true;
 try{const j=await requestJSON('/api/priority_refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codes})});priorityRefreshLast=Date.now();if(j?.ok) setTimeout(()=>{try{applyLivePatch();}catch(_e){}},250);}
 catch(_e){}finally{priorityRefreshBusy=false;}
}
setInterval(priorityRefresh,3*60*1000);
setTimeout(priorityRefresh,30*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)priorityRefresh();});
function syncMode(){
 document.querySelector('main').dataset.screenMode=screenMode;
 document.querySelector('main').dataset.legacyDetail=String(legacyDetail);
 $('legacyColumns').hidden=screenMode!=='legacy';
 $('strategyControls').style.display=screenMode==='strategy'?'block':'none';
 $('stages').style.display=screenMode==='strategy'?'none':'block';
 $('strategyNotice').style.display=screenMode==='strategy'?'block':'none';
 $('why').style.display=screenMode==='strategy'?'none':'grid';
 recompute();
}
$('screenMode').onchange=()=>{screenMode=$('screenMode').value;store.set('bb_screen',screenMode);syncMode();};
$('timingMode').onchange=()=>{timingMode=$('timingMode').value;store.set('bb_timing_mode',timingMode);recompute();};
$('asOf').onchange=()=>{asOf=$('asOf').value;recompute();};
$('ruleGroups').onclick=e=>{const b=e.target.closest('[data-g]');if(b){dataStatusFilter='';selectedGroup=b.dataset.g;applyFilters();}};
$('dataStatusGroups').onclick=e=>{const b=e.target.closest('[data-ds]');if(b){dataStatusFilter=dataStatusFilter===b.dataset.ds?'':b.dataset.ds;applyFilters();}};
if($('dailyBiasFilter'))$('dailyBiasFilter').onchange=()=>{dailyBiasFilter=$('dailyBiasFilter').value;store.set('bb_daily_bias_filter',dailyBiasFilter);applyFilters();};
$('rankMode').onchange=()=>{rankMode=$('rankMode').value;strategySortKey='';store.set('bb_strategy_sort_key','');sortView();renderTable();};
for(const [k,[lo,hi]] of Object.entries(bounds))$('rule_'+k).onchange=()=>{let v=Number($('rule_'+k).value);if(!Number.isFinite(v))v=SelectionRules.defaults[k];SP[k]=Math.max(lo,Math.min(hi,v));if(k==='tracking')SP[k]=Math.round(SP[k]);$('rule_'+k).value=SP[k];store.set('bb_rules_v1',SP);recompute();};
$('resetRules').onclick=()=>{SP={...SelectionRules.defaults};for(const k of Object.keys(bounds))$('rule_'+k).value=SP[k];store.set('bb_rules_v1',SP);recompute();};
const originalCsv=$('btnCsv').onclick;
function exportRules(rows,all=false){
 const cell=v=>{let t=String(v??'');if(/^[=+@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};
 const headers=['代號','名稱','市場','資料日','Daily Bias','Daily Bias型態','PDH','PDL','分組','研究品質分','品質級別','中軌層級','續攻狀態','續攻報酬%','路徑進度Δpct','中軌動能分','中軌上方%','中軌→上軌進度%','距上軌%','量速／20日量比','CLV%','RSI14','MACD狀態','DIF','DEA','MACD柱','MACD60日位階%','MACD頂背離','價量狀態','20日量比','前日量比','OBV5','風險提示','訊號日','經過日K','收盤','訊號後漲幅%','成交量／訊號日','五日漲幅%','前20日估算均額萬元','綜合條件優先','原因','模式','規則參數','訊號狀態','下載時間','前日資料日','強弱判讀','空手判讀','持有判讀','比較原因','規則版本','盤中快照有效分鐘','中軌突破','OBV','OBV20日均線','MACD多頭'];
 const data=rows.map(r=>{const f=r.rule,e=SelectionRules.explain(r.s,f,SP),q=f.quality,mm=f.midline?.current||f.midline||{};return [r.code,r.name,r.mkt,r.date,r.dailyBias?.label,r.dailyBias?.setup,r.dailyBias?.pdh,r.dailyBias?.pdl,groupLabel(f.group),f.score,q?.grade,f.midline?.tier||mm.tier||'',f.midline?.health?.label,f.midline?.health?.ret,f.midline?.health?.progressDelta,mm.score,mm.crossPct,mm.progress,mm.distUpper,mm.volumeUsed,q?100*q.pv.clv:null,mm.rsi,q?.macd.state,q?.macd.dif,q?.macd.dea,q?.macd.hist,q?.macd.histPct,q?.macd.topDivergence,q?.pv.state,q?.pv.ratio,q?.pv.volPrev,q?.pv.obv5,q?.alerts.join('；'),f.signal?.date,f.age,r.close,f.change,f.retention,f.gain,f.amount,!!f.preferred,f.reasons.join('；'),timingLabel(),JSON.stringify(SP),f.dataStatusLabel|| (f.provisional?'盤中已判定・依最新下載快照':f.group==='Q'?'Q3 資料異常':'歷史／收盤後資料・未官方驗證'),f.fetchedAt,e.previousDate,e.strength,e.flat,e.held,e.reasons.join('；'),SelectionRules.version,maxAge,!!r.middleBreakout?.eligible,r.middleBreakout?.obv,r.middleBreakout?.obvMA20,!!r.middleBreakout?.macdBull].map(cell).join(',');});
 const url=URL.createObjectURL(new Blob(['\ufeff'+headers.join(',')+'\r\n'+data.join('\r\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`布林_${all?'全部股票':'追蹤候選'}_${timingMode==='intraday'?'盤中判定':'收盤確認'}_${asOf||quality.latest_bar||'資料'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('btnCsv').onclick=()=>screenMode==='strategy'?exportRules(VIEW):originalCsv();
$('exportAllRules').onclick=()=>exportRules(ROWS,true);
const originalHead=$('thead').onclick;
$('thead').onclick=e=>{
 if(screenMode==='legacy')return originalHead(e);
 const th=e.target.closest('th[data-strategy-sort]');if(!th)return;
 const k=th.dataset.strategySort;if(!k)return;
 if(strategySortKey===k)strategySortDir=-strategySortDir;
 else{
  strategySortKey=k;
  // Text/status columns start ascending; scores/favorites/MACD start descending.
  strategySortDir=['stock','group','dataStatus','bias'].includes(k)?1:-1;
 }
 store.set('bb_strategy_sort_key',strategySortKey);store.set('bb_strategy_sort_dir',strategySortDir);
 sortView();renderTable();
};

// Date freshness can change without a new download (overnight / failed update).
const originalRequest=requestJSON;let gateSignature='';
requestJSON=async function(url,options={},...rest){
 const result=await originalRequest(url,options,...rest);
 if(url==='/api/refresh'&&options.method==='POST'){
  asOf='';$('asOf').value='';
  const clock=taipeiClock();
  if(quality.calendar?.session==='intraday'){
   timingMode='intraday';store.set('bb_timing_mode',timingMode);$('timingMode').value=timingMode;
  }
  recompute();
 }

 if(url==='/api/status'&&result.quality){
  quality={...quality,...result.quality};
  const signature=JSON.stringify(result.quality)+JSON.stringify(taipeiClock());
  if(signature!==gateSignature){gateSignature=signature;if(RAW.length&&!closing)queueMicrotask(recompute);}
 }
 return result;
};
syncMode();
