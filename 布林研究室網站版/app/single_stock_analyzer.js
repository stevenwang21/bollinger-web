// R10 single-stock Bollinger-pattern + multi-indicator diagnostic panel.
(()=>{
 'use strict';
 const displayText=x=>String(x??'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').trim();
 const htmlEsc=x=>displayText(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(x,d=2)=>x==null||x===''||typeof x==='object'||!Number.isFinite(Number(x))?'—':Number(x).toFixed(d);
 const panel=document.createElement('section');panel.id='singleStockAnalyzer';panel.style.cssText='padding:16px;border-top:1px solid var(--line);background:#302943;scroll-margin-top:8px;position:relative;z-index:0;clear:both;width:100%;display:block';
 panel.innerHTML=`<style>
 #singleStockAnalyzer .ssaHead{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}#singleStockAnalyzer .ssaHead b{font-size:24px;color:var(--accent)}
 #singleStockAnalyzer .ssaInput{min-width:260px;max-width:380px;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px 10px}
 #singleStockAnalyzer .ssaStatus{color:var(--muted);font-size:17px}.ssaCards{display:grid;grid-template-columns:repeat(8,minmax(105px,1fr));gap:8px;margin:10px 0}
 .ssaCard{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:9px}.ssaCard small{display:block;color:var(--muted);font-size:16px}.ssaCard b{font-size:21px}
 .ssaGrid{display:flex;flex-direction:column;gap:12px}.ssaChartBox{order:3;position:relative;background:#302943;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:100%;min-height:835px;display:block;clear:both}.ssaInfo{padding:7px 10px;color:var(--muted);font-size:17px;min-height:34px;border-bottom:1px solid var(--line)}
 #singleStockAnalyzer #ssaCv{position:relative!important;inset:auto!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;display:block!important;width:100%!important;height:760px!important;min-height:760px!important;max-height:none!important;touch-action:pan-y;z-index:0}.ssaLegend{padding:7px 10px;font-size:16px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap}
 .ssaAnalysis{order:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ssaAnalyst{order:2;background:linear-gradient(180deg,#302943,#302943);border:1px solid #5B4B8A;border-radius:10px;padding:12px 14px;box-shadow:0 0 0 1px #5B4B8A44 inset}.analystHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.analystHead h4{margin:0;color:#C6C1D9;font-size:21px}.analystDecision{display:inline-block;padding:5px 11px;border-radius:999px;font-weight:900;border:1px solid var(--line);font-size:19px}.analystDecision.buy{color:#95D1B4;border-color:#95D1B488;background:#302943}.analystDecision.sell{color:#F3A1B5;border-color:#F3A1B588;background:#302943}.analystDecision.wait{color:#C6C1D9;border-color:#C6C1D977;background:#302943}.analystGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.analystCell{background:#302943;border:1px solid var(--line);border-radius:7px;padding:9px;min-height:78px}.analystCell b{display:block;color:#A6B8D7;font-size:16px;margin-bottom:5px}.analystCell strong{font-size:19px;line-height:1.45}.analystSummary{margin-top:9px;padding:9px 10px;border-left:3px solid #A6B8D7;background:#302943;border-radius:5px;line-height:1.55}.analystForecast{margin-top:8px;padding:9px 10px;border-left:3px solid #C6C1D9;background:#302943;border-radius:5px;line-height:1.55}.analystFine{margin-top:7px;color:var(--muted);font-size:15.5px}.ssaBlock{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}.ssaBlock h4{margin:0 0 6px;color:var(--accent);font-size:19px}.ssaLine{padding:3px 0}.ssaGood{color:#95D1B4}.ssaWarn{color:#C6C1D9}.ssaBad{color:#F3A1B5}.ssaNeutral{color:var(--muted)}.ssaMiniSop{margin-top:8px;padding:8px 9px;border-left:3px solid #C6C1D9;background:#302943;border-radius:5px;font-size:17px;line-height:1.45}.ssaMiniSop.good{border-left-color:#95D1B4}.ssaMiniSop.hot{border-left-color:#C6C1D9}.ssaMiniSop.bad{border-left-color:#F3A1B5}.ssaQualityBars{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:8px}.ssaQBar{background:#302943;border:1px solid var(--line);border-radius:6px;padding:6px}.ssaQBar small{display:flex;justify-content:space-between;color:#A6B8D7}.ssaQTrack{height:6px;background:#302943;border-radius:999px;overflow:hidden;margin-top:5px}.ssaQFill{height:100%;background:#A6B8D7;border-radius:999px}
 .ssaWide{grid-column:1/-1}.smcTitle{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.smcBadge{display:inline-block;border:1px solid #C6C1D9;background:#302943;border-radius:999px;padding:3px 8px;font-size:16px;font-weight:700}.smcBull{color:#95D1B4}.smcBear{color:#F3A1B5}.smcNeutral{color:#C6C1D9}.smcSignal{font-size:23px;font-weight:900;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:#302943}.smcSignal.bull{color:#95D1B4;border-color:#95D1B466}.smcSignal.bear{color:#F3A1B5;border-color:#F3A1B566}.smcSignal.wait{color:#C6C1D9;border-color:#C6C1D955}.smcReason{margin-top:7px;padding:8px 10px;border-left:3px solid #A6B8D7;background:#302943;border-radius:4px}.smcKeyRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}.smcKey{background:#302943;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:16px}
 .ssaSOP{order:0;background:linear-gradient(180deg,#302943,#302943);border:1px solid #C6C1D9;border-radius:11px;padding:12px 14px;box-shadow:0 0 0 1px #5B4B8A55 inset}.sopHead{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.sopHead h4{margin:0;color:#C6C1D9;font-size:22px}.sopDecision{font-size:25px;font-weight:900;padding:7px 13px;border-radius:9px;border:1px solid var(--line)}.sopDecision.buy{color:#95D1B4;background:#302943;border-color:#95D1B488}.sopDecision.wait{color:#C6C1D9;background:#302943;border-color:#C6C1D977}.sopDecision.hot{color:#C6C1D9;background:#5B4B8A;border-color:#C6C1D977}.sopDecision.sell{color:#F3A1B5;background:#302943;border-color:#F3A1B588}.sopFlow{margin-left:auto;color:#A6B8D7;font-size:16px;font-weight:700}.sopGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:7px;margin-top:10px}.sopGate{background:#302943;border:1px solid var(--line);border-radius:8px;padding:8px;min-height:72px}.sopGate small{display:block;color:#C6C1D9;font-size:15.5px;margin-bottom:4px}.sopGate strong{display:block;font-size:18px;line-height:1.35}.sopGate.good{border-color:#95D1B466}.sopGate.warn{border-color:#C6C1D955}.sopGate.hot{border-color:#C6C1D966}.sopGate.bad{border-color:#F3A1B566}.sopTrade{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.sopTrade div{background:#302943;border:1px solid var(--line);border-radius:7px;padding:8px}.sopTrade small{display:block;color:#C6C1D9;font-size:15px}.sopTrade b{font-size:19px}.sopTrade .sopSub{display:block;margin-top:4px;color:#F4F1F8;font-size:13px;line-height:1.3}.sopOneLine{margin-top:9px;padding:9px 10px;border-left:4px solid #A6B8D7;background:#302943;border-radius:5px;font-weight:700;line-height:1.5}.sopGuard{margin-top:7px;color:#C6C1D9;font-size:16.5px}.sopGuard b{color:#C6C1D9}
 .smcIndex{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:9px}.smcSlide{background:#302943;border:1px solid var(--line);border-radius:8px;padding:9px;min-height:155px}.smcSlide .idx{font-size:15px;letter-spacing:.08em;color:#C6C1D9;font-weight:800}.smcSlide h5{font-size:18px;margin:3px 0 6px;color:#A6B8D7}.smcSlide ul{margin:0;padding-left:18px}.smcSlide li{margin:3px 0;line-height:1.35}.smcPlain{margin-top:8px;padding:7px 8px;background:#302943;border-left:3px solid #C6C1D9;border-radius:4px;color:#C6C1D9;font-size:16.5px;line-height:1.5}.smcPlain b{color:#C6C1D9}.smcNote{margin-top:8px;padding-top:7px;border-top:1px dashed var(--line);color:var(--muted);font-size:16px}
 .dailyBiasBlock{position:relative;overflow:hidden}.dailyBiasHead{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:10px}.dailyBiasHead h4{margin:0;font-size:21px}.dailyBiasBadge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;font-weight:800;border:1px solid var(--line)}.dailyBiasBadge.bull{color:var(--down)}.dailyBiasBadge.bear{color:var(--up)}.dailyBiasBadge.neutral{color:var(--accent)}.dailyBiasGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.dailyBiasCell{border:1px solid var(--line);border-radius:8px;padding:9px;min-height:88px}.dailyBiasCell small{display:block;color:var(--muted);font-size:14px;margin-bottom:4px}.dailyBiasCell strong{display:block;font-size:18px;line-height:1.4}.dailyBiasLogic{margin-top:9px;padding:9px 11px;border-left:4px solid var(--accent);border-radius:6px;line-height:1.6}.dailyBiasAlign{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.dailyBiasAlign>div{border:1px solid var(--line);border-radius:7px;padding:8px}.dailyBiasAlign small{display:block;color:var(--muted);font-size:13px}.dailyBiasAlign b{font-size:16px}.dailyBiasFoot{margin-top:8px;color:var(--muted);font-size:14px;line-height:1.55}.frameworkScore{display:inline-flex;gap:7px;align-items:center;flex-wrap:wrap}.frameworkScore b{font-size:18px}.frameworkLayers{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:6px;margin-top:8px}.frameworkLayer{border:1px solid var(--line);border-radius:7px;padding:7px;background:var(--panel2)}.frameworkLayer small{display:block;color:var(--muted);font-size:13px}.frameworkLayer strong{font-size:16px}
 .ssaMatches{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.ssaMatch{border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:5px;padding:4px 8px;cursor:pointer}
 .ssaImagePanel{order:2;background:linear-gradient(180deg,#5B4B8A,#302943);border:1px solid #5B4B8A;border-radius:10px;padding:12px 14px;box-shadow:0 0 0 1px #5B4B8A44 inset}.ssaImageHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ssaImageHead h4{margin:0;color:#C6C1D9;font-size:21px}.ssaImageHint{color:var(--muted);font-size:16px}.ssaPosterTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}.ssaPosterTools .btn{padding:5px 10px}.ssaPosterMode{display:inline-flex;border:1px solid #5B4B8A;border-radius:7px;overflow:hidden}.ssaPosterMode button{border:0;border-right:1px solid #5B4B8A;background:#5B4B8A;color:#A6B8D7;padding:6px 10px;cursor:pointer}.ssaPosterMode button:last-child{border-right:0}.ssaPosterMode button.active{background:#C6C1D9;color:#302943;font-weight:800}.ssaPosterFrame{margin-top:10px;background:#302943;border:1px solid var(--line);border-radius:12px;padding:10px;overflow:auto;display:flex;justify-content:center;align-items:flex-start;max-height:920px}.ssaPosterFrame img{display:block;width:min(100%,960px);max-width:960px;height:auto;border-radius:12px;border:1px solid #5B4B8A;background:#5B4B8A;box-shadow:0 8px 22px #5B4B8A55}.ssaPosterEmpty{padding:28px 16px;border:1px dashed #5B4B8A;border-radius:12px;text-align:center;color:#C6C1D9;background:#302943;font-size:18px;width:100%}.ssaPosterMeta{margin-top:8px;color:#C6C1D9;font-size:16px;line-height:1.5}
 @media(max-width:1100px){.dailyBiasGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.dailyBiasAlign{grid-template-columns:1fr}.ssaAnalysis{grid-template-columns:1fr}.analystGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.ssaCards{grid-template-columns:repeat(3,1fr)}.smcIndex{grid-template-columns:repeat(2,minmax(0,1fr))}.smcKeyRow{grid-template-columns:repeat(2,minmax(0,1fr))}.sopGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.sopTrade{grid-template-columns:repeat(2,minmax(0,1fr))}.sopFlow{margin-left:0;width:100%}}@media(max-width:700px){.dailyBiasGrid{grid-template-columns:1fr}.analystGrid{grid-template-columns:1fr}.ssaCards{grid-template-columns:repeat(2,1fr)}.smcIndex{grid-template-columns:1fr}.smcKeyRow{grid-template-columns:1fr}.sopGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.sopTrade{grid-template-columns:1fr}#ssaCv{height:700px}}
 </style>
 <div class="ssaHead"><b>單股布林型態＋技術面診斷 <span style="font-size:16px;color:var(--muted)">v6.9.4 Starry Sapphire · Daily Bias</span></b><span class="ssaStatus">輸入任一上市／上櫃股票名稱或代號；手動重抓保留；全市場每45秒輪詢約80檔＋高優先候選每3分鐘快速更新，Fugle不可用時改用TWSE MIS，不限電子股</span><div style="flex:1"></div><input id="ssaQ" class="ssaInput" placeholder="例如 2330、台積電、2426.TW"><button id="ssaGo" class="btn primary">重新取得並分析</button><button id="ssaCurrent" class="btn">分析目前主圖</button></div>
 <div id="ssaMsg" class="ssaStatus">尚未分析。可輸入上市／上櫃股票代號或名稱。</div><div id="ssaMatches" class="ssaMatches"></div>
 <div id="ssaBody" style="display:none"><div class="ssaCards"><div class="ssaCard"><small>股票</small><b id="ssaName">—</b></div><div class="ssaCard"><small>布林型態</small><b id="ssaPattern">—</b></div><div class="ssaCard"><small>收盤／最新</small><b id="ssaPrice">—</b></div><div class="ssaCard"><small>Daily Bias</small><b id="ssaDailyBias">—</b></div><div class="ssaCard"><small>均線結構</small><b id="ssaMA">—</b></div><div class="ssaCard"><small>MACD</small><b id="ssaMACD">—</b></div><div class="ssaCard"><small>研究分</small><b id="ssaScore">—</b></div><div class="ssaCard"><small>SMC / SNR</small><b id="ssaSMC">—</b></div></div>
 <div class="ssaGrid"><div id="ssaSOP" class="ssaSOP"></div><div id="ssaAnalysis" class="ssaAnalysis"></div><div id="ssaAnalyst" class="ssaAnalyst"></div><div id="ssaImagePanel" class="ssaImagePanel ssaWide"><div class="ssaImageHead"><h4>交易計畫圖卡</h4><span class="ssaImageHint">依目前個股分析，自動整理成可視化圖卡，放在個股分析區下方</span><div class="ssaPosterTools"><div class="ssaPosterMode"><button id="ssaPosterStandard" type="button" class="active">標準版</button><button id="ssaPosterCompact" type="button">緊湊版</button></div><button id="ssaPosterRefresh" class="btn">更新圖卡</button><button id="ssaPosterPng" class="btn" type="button">下載 PNG</button><a id="ssaPosterDownload" class="btn" href="#" download="trading-plan.svg">下載 SVG</a></div></div><div class="ssaPosterFrame"><div id="ssaPosterEmpty" class="ssaPosterEmpty">完成個股分析後，這裡會自動產生圖卡。</div><img id="ssaPosterPreview" alt="交易計畫圖卡預覽" style="display:none"></div><div id="ssaPosterMeta" class="ssaPosterMeta">用途：把買點、停損、目標價、SOP 與重點趨勢濃縮成一張圖，方便快速判斷與分享。</div></div><div class="ssaChartBox"><div style="padding:10px;border-bottom:1px solid var(--line);font-weight:700;color:var(--accent)">個股 K 線＋布林通道＋技術指標（置於最下方）</div><div id="ssaHover" class="ssaInfo"></div><canvas id="ssaCv"></canvas><div class="ssaLegend"><span style="color:#F3A1B5">紅K 上漲</span><span style="color:#95D1B4">綠K 下跌</span><span style="color:#C6C1D9">布林上軌</span><span style="color:#C6C1D9">布林中軌/MA20</span><span style="color:#C6C1D9">布林下軌</span><span>MA5 短均線</span><span>MA60 灰</span><span>成交量＋5/20均量</span><span>MACD 12/26/9</span><span>RSI14</span><span style="color:#95D1B4">S1/S2 支撐</span><span style="color:#F3A1B5">R1/R2 壓力</span><span style="color:#A6B8D7">BSL/SSL 流動性</span><span style="color:#C6C1D9">EQ 50%</span><span>半透明區＝OB / FVG</span><span>BOS / CHoCH＝結構事件</span></div></div></div></div>`;
 const footer=document.querySelector('footer');if(footer)footer.before(panel);else document.body.append(panel);
 let current=null,analysis=null,hover=null,currentSource="";const historicalAnalyses=new Map();
 const qEl=document.getElementById('ssaQ'),msg=document.getElementById('ssaMsg'),matches=document.getElementById('ssaMatches'),body=document.getElementById('ssaBody'),cv=document.getElementById('ssaCv');
 const posterImg=document.getElementById('ssaPosterPreview'),posterEmpty=document.getElementById('ssaPosterEmpty'),posterMeta=document.getElementById('ssaPosterMeta'),posterDownload=document.getElementById('ssaPosterDownload'),posterStandard=document.getElementById('ssaPosterStandard'),posterCompact=document.getElementById('ssaPosterCompact');
 let posterMode='standard';
 function localFind(q){q=String(q||'').trim().toLowerCase();if(!q)return[];const m=q.match(/^(\d{4})(?:\.(two|tw))?$/i),code=m?m[1]:q,market=m?.[2]?.toUpperCase();const pool=market?RAW.filter(s=>s.m===market):RAW;let exact=pool.filter(s=>s.c===code||String(s.n).toLowerCase()===q);if(exact.length)return exact;return pool.filter(s=>s.c.includes(code)||String(s.n).toLowerCase().includes(q)).slice(0,12);}
 async function fetchSingle(query){
   // R10.9：個股分析永遠先向後端重新抓資料，不能因為主選股快取已有該股票就直接沿用舊資料。
   // 後端的單股清單是全部上市／上櫃普通股，不受主畫面電子股宇宙限制。
   try{return await requestJSON('/api/single_stock?q='+encodeURIComponent(query)+'&refresh=1&_='+Date.now(),{},75000,false);}
   catch(e){
     // 網路暫時失敗時才退回目前主畫面的本機快取；非電子股若沒有本機快取，會明確顯示抓取失敗。
     const found=localFind(query);
     if(found.length===1)return{stock:found[0],source:'重新取得失敗，暫用本機舊快取',stale_fallback:true};
     if(found.length>1)return{matches:found.map(x=>({c:x.c,n:x.n,m:x.m})),source:'本機快取候選'};
     throw e;
   }
 }
 function renderMatches(arr){matches.innerHTML=(arr||[]).map(x=>`<button class="ssaMatch" data-q="${htmlEsc(x.c)}">${htmlEsc(x.c)} ${htmlEsc(x.n||'')} ${x.m==='TWO'?'上櫃':'上市'}</button>`).join('');matches.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{qEl.value=b.dataset.q;run();});}
 function biasColor(b){return b==='bull'?'#F3A1B5':b==='bear'?'#95D1B4':'#C6C1D9';}

 function smcClass(b){return b==='偏多'||b==='bull'?'smcBull':b==='偏空'||b==='bear'?'smcBear':'smcNeutral';}
 function dailyBiasClass(b){return b==='bull'?'bull':b==='bear'?'bear':'neutral';}
 function dailyBiasAlignment(a){
   const db=a?.dailyBias||{},smc=a?.smc||{},p=a?.pattern||{},m=a?.metrics||{},sig=smc.signal||{};
   const smcDir=sig.bias==='bull'||sig.bias==='bear'?sig.bias:(smc.structure?.bias||'neutral');
   const smcAlign=db.bias==='neutral'?'等待 Daily Bias 方向':smcDir==='neutral'?'SMC 尚待確認':smcDir===db.bias?'同向／加強情境':'方向衝突／先等待';
   const bollAlign=db.bias==='neutral'?'布林僅作觀察':p.bias==='neutral'?'布林方向未明':p.bias===db.bias?'同向':'反向／不共振';
   const mac=String(m.macdState||''),slope=Number(m.ma20Slope);
   let momentum='動能中性';
   if(db.bias==='bull')momentum=(slope>0&&(/多頭|黃金/.test(mac)))?'中軌＋MACD 同向':'仍需多方動能確認';
   else if(db.bias==='bear')momentum=(slope<0&&(/空頭|死亡/.test(mac)))?'中軌＋MACD 同向':'仍需空方動能確認';
   let score=Number(db.baseConfidence)||0;
   if(db.bias!=='neutral'){
     if(p.bias===db.bias)score+=6;else if(p.bias!=='neutral')score-=10;
     if(db.bias==='bull'){if(slope>0)score+=3;else if(slope<0)score-=4;if(/多頭|黃金/.test(mac))score+=3;else if(/空頭|死亡/.test(mac))score-=4;if(m.pv==='價漲量增')score+=3;}
     if(db.bias==='bear'){if(slope<0)score+=3;else if(slope>0)score-=4;if(/空頭|死亡/.test(mac))score+=3;else if(/多頭|黃金/.test(mac))score-=4;if(m.pv==='價跌量增')score+=3;}
   }else score=Math.min(score,45);
   score=Math.max(0,Math.min(100,Math.round(score)));
   return{smcAlign,bollAlign,momentum,score};
 }
 function renderDailyBias(a){
   const db=a?.dailyBias;if(!db)return'';const x=dailyBiasAlignment(a),c1=db.c1||{},c2=db.c2||{},smc=a?.smc||{},price=Number(a?.metrics?.price);
   const nextPool=db.bias==='bull'?[...(smc.snr?.resistance||[]).map(z=>Number(z.price)),Number(smc.liquidity?.pools?.bsl?.price),Number(smc.structure?.protectedHigh)].filter(v=>Number.isFinite(v)&&v>price):db.bias==='bear'?[...(smc.snr?.support||[]).map(z=>Number(z.price)),Number(smc.liquidity?.pools?.ssl?.price),Number(smc.structure?.protectedLow)].filter(v=>Number.isFinite(v)&&v<price):[];
   nextPool.sort((a,b)=>db.bias==='bear'?b-a:a-b);const nextTarget=nextPool[0];
   const target=db.primaryTarget!=null?`${db.targetLabel} ${fmt(db.primaryTarget)}${db.targetReached?`（已觸及${Number.isFinite(nextTarget)?`；下一流動性 ${fmt(nextTarget)}`:''}）`:''}`:'—';
   const invalid=db.biasInvalidation!=null?`${fmt(db.biasInvalidation)}（Bias 參考線，非交易停損）`:'—';
   return `<div class="ssaBlock ssaWide dailyBiasBlock"><div class="dailyBiasHead"><h4>Daily Bias 日內偏見</h4><span class="dailyBiasBadge ${dailyBiasClass(db.bias)}">${htmlEsc(db.shortLabel||db.label)}</span><span class="smcBadge">${htmlEsc(db.session||'今日')}計畫</span><span class="smcBadge">條件分 ${x.score}/100</span></div>
   <div class="dailyBiasGrid"><div class="dailyBiasCell"><small>C1 前天 · ${htmlEsc(c1.date||'—')}</small><strong>H ${fmt(c1.high)} / L ${fmt(c1.low)}</strong><span>O ${fmt(c1.open)} · C ${fmt(c1.close)}</span></div><div class="dailyBiasCell"><small>C2 昨天 · ${htmlEsc(c2.date||'—')}</small><strong>H ${fmt(c2.high)} / L ${fmt(c2.low)}</strong><span>O ${fmt(c2.open)} · C ${fmt(c2.close)}</span></div><div class="dailyBiasCell"><small>方向與主要目標</small><strong>${htmlEsc(db.preferred||'觀望')}</strong><span>${htmlEsc(target)}</span></div><div class="dailyBiasCell"><small>Bias 失效參考</small><strong>${htmlEsc(invalid)}</strong><span>Buffer ${fmt(db.buffer)} · 過濾單一 tick 假刺穿</span></div></div>
   <div class="dailyBiasLogic"><b>${htmlEsc(db.label)}</b>｜${htmlEsc(db.formula)}<br>${htmlEsc(db.explanation)}<br><span class="ssaNeutral">${htmlEsc(db.invalidationText||'')}</span></div>
   <div class="dailyBiasAlign"><div><small>SMC / SNR</small><b>${htmlEsc(x.smcAlign)}</b></div><div><small>Bollinger</small><b>${htmlEsc(x.bollAlign)}</b></div><div><small>MA20 / MACD</small><b>${htmlEsc(x.momentum)}</b></div></div>
   <div class="dailyBiasFoot">${htmlEsc(db.note)}　本工具的 SMC 與 Daily Bias 同為日 K 資料，避免把同一個 D1 Sweep 重複加分；盤中要等新的結構與價格確認。</div></div>`;
 }
 function smcLevels(arr){return(arr||[]).slice(0,3).map((x,i)=>`${i+1}. ${fmt(x.price)}（${x.touches||1} 個轉折樣本）`).join('；')||'—';}
 function zoneText(z){return z?`${fmt(z.low)} ～ ${fmt(z.high)}（${htmlEsc(z.date||'')}）`:'目前未偵測到有效區';}
 function signalClass(sig){return sig?.bias==='bull'?'bull':sig?.bias==='bear'?'bear':'wait';}
 function levelLabel(arr,prefix){return(arr||[]).slice(0,2).map((x,i)=>`${prefix}${i+1} ${fmt(x.price)}（${x.touches||1} 個轉折樣本）`).join('｜')||'—';}
 function plainStructure(st,ev){
   const lo=fmt(st?.protectedLow),hi=fmt(st?.protectedHigh),label=String(st?.label||'');
   if(label.includes('多頭'))return `高點與低點大致往上抬，走勢偏多。${lo!=='—'?` ${lo} 可看成多方重要防守`:''}${hi!=='—'?`；${hi} 是上方要克服的前高`:''}。BOS＝趨勢延續突破，CHoCH＝可能轉折。`;
   if(label.includes('空頭'))return `高點與低點大致往下移，走勢偏弱。${hi!=='—'?` ${hi} 是反彈要先站回的位置`:''}${lo!=='—'?`；${lo} 跌破後要防續弱`:''}。BOS＝趨勢延續突破，CHoCH＝可能轉折。`;
   if(label.includes('擴張'))return `高低點同時向外擴大，波動很大，容易出現假突破。先等價格真正站穩前高或跌破前低，再判斷方向。`;
   return `目前高低點沒有形成單一明確方向，偏整理。先看最近前高、前低哪一邊被有效突破；不要只因一根K棒就追價。`;
 }
 function plainLiquidity(bsl,ssl){
   const up=bsl?fmt(bsl.price):'上方關鍵高點',dn=ssl?fmt(ssl.price):'下方關鍵低點';
   return `簡單說，${up} 上方容易累積追價單與空單停損；${dn} 下方容易累積多單停損。突破後能站穩才偏有效；刺穿後又收回，要提防假突破。`;
 }
 function plainSupplyDemand(ob,fvg){
   const hasBull=!!(ob?.bull||fvg?.bull),hasBear=!!(ob?.bear||fvg?.bear);
   if(hasBull&&hasBear)return `Bull OB/FVG 可當作「可能有人承接的區域」，Bear OB/FVG 可當作「可能遇到賣壓的區域」。碰到區域要看止跌／受壓反應，不是碰到就直接買賣。`;
   if(hasBull)return `目前較明顯的是下方承接區。股價回到 Bull OB/FVG 時，可觀察是否止跌、量縮後轉強；若直接跌穿，支撐效果就降低。`;
   if(hasBear)return `目前較明顯的是上方賣壓區。股價進入 Bear OB/FVG 時，可觀察是否遇壓；若帶量站穩其上，才代表壓力可能被消化。`;
   return `目前沒有清楚的 OB/FVG 區域可依靠，操作上應更重視 S1/S2、R1/R2 與最新高低點。`;
 }
 function plainPosition(rg){
   const z=String(rg?.zone||'');
   if(z.includes('Premium'))return `股價位在近期區間上半部，位置相對偏高。要追多最好等突破站穩；越靠近區間高點，追價的風險報酬通常越不漂亮。`;
   if(z.includes('Discount'))return `股價位在近期區間下半部，位置相對偏低。若大方向仍偏多，可優先觀察承接；但跌破重要支撐時不能只因「便宜」就接。`;
   return `股價在近期區間中段附近，既不算明顯便宜也不算明顯昂貴。這裡常是等待區，通常等靠近支撐／壓力或出現結構突破較容易判斷。`;
 }
 function plainSNR(snr){
   const s1=snr?.support?.[0]?.price,r1=snr?.resistance?.[0]?.price;
   return `S1/S2 是下方第一、第二道防線，R1/R2 是上方第一、第二道關卡。${Number.isFinite(s1)?`守住 S1 ${fmt(s1)} 後再轉強，對多方較有利；`:''}${Number.isFinite(r1)?`突破並站穩 R1 ${fmt(r1)}，再看 R2；`:''}若跌破 S1，下一步通常看 S2。`;
 }
 function plainAction(sig,pl){
   const key=sig?.key;
   if(key==='breakout_confirmed')return `目前屬於「突破後確認」。重點不是已經漲了多少，而是突破位能不能轉成支撐；若很快跌回去，這個劇本就取消。`;
   if(key==='pullback_buy')return `已出現掃低後的向上結構突破，目前回到支撐附近。接下來觀察回測是否守穩、量價是否配合，再評估進場。`;
   if(key==='structure_weak')return `目前結構偏弱，先以風險控制為主。要看到重新站回關鍵壓力、或出現新的向上 CHoCH/BOS，才重新評估多方。`;
   if(key==='liquidity_bull_trap')return `目前有「上破後又收回」的假突破風險。除非重新站回假突破位並守穩，否則先不要把那次上破當成有效轉強。`;
   return `目前沒有明確優勢，先觀察支撐與壓力哪一邊被有效突破。把「觀察 → 觸發 → 失效」照順序看，比單看一個價位更安全。`;
 }
 function renderSMCIndex(smc){
   if(!smc)return'';
   const st=smc.structure||{},ev=st.event||{},liq=smc.liquidity||{},snr=smc.snr||{},ob=smc.orderBlocks||{},fvg=smc.fvg||{},rg=smc.range||{},pl=smc.plan||{},sig=smc.signal||{};
   const bsl=liq.pools?.bsl,ssl=liq.pools?.ssl;
   const eventTxt=ev.type&&ev.type!=='無近期 BOS / CHoCH'?`${ev.type}${ev.level!=null?' @ '+fmt(ev.level):''}`:'近期無確認 BOS / CHoCH';
   const supportTxt=levelLabel(snr.support,'S'),resistTxt=levelLabel(snr.resistance,'R');
   const pdTxt=rg.zone||'—';
   const posTxt=Number.isFinite(rg.pos)?`${fmt(rg.pos*100,1)}%`:'—';
   return `<div class="ssaBlock ssaWide"><div class="smcTitle"><h4 style="margin:0">SMC / SNR 結構說明</h4><span class="smcBadge ${smcClass(smc.bias)}">${htmlEsc(smc.bias||'中性')}</span><span class="smcBadge">結構分 ${smc.score??0}</span></div>
   <div class="smcReason"><div class="smcSignal ${signalClass(sig)}">${htmlEsc(sig.label||'等待')}</div><div style="margin-top:6px"><b>為什麼：</b>${htmlEsc(sig.reason||'—')}</div><div><b>下一步：</b>${htmlEsc(sig.next||pl.trigger||'—')}</div><div><b>失效／解除：</b>${htmlEsc(sig.invalidation||pl.invalidation||'—')}</div></div>
   <div class="smcKeyRow"><div class="smcKey"><b>支撐 S1 / S2</b><br>${htmlEsc(supportTxt)}</div><div class="smcKey"><b>壓力 R1 / R2</b><br>${htmlEsc(resistTxt)}</div><div class="smcKey"><b>BSL</b><br>${bsl?fmt(bsl.price)+'｜上方流動性':'—'}</div><div class="smcKey"><b>SSL</b><br>${ssl?fmt(ssl.price)+'｜下方流動性':'—'}</div></div>
   <div class="smcIndex">
    <div class="smcSlide"><div class="idx">01 結構</div><h5>Market Structure</h5><ul><li>${htmlEsc(st.label||'資料不足')}｜${htmlEsc(eventTxt)}</li><li>Protected Low ${fmt(st.protectedLow)}｜Protected High ${fmt(st.protectedHigh)}</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainStructure(st,ev))}</div></div>
    <div class="smcSlide"><div class="idx">02 流動性</div><h5>Liquidity</h5><ul><li>BSL ${bsl?fmt(bsl.price):'—'}｜SSL ${ssl?fmt(ssl.price):'—'}</li><li>上影越高後收回＝假突破風險；下影越低後收回＝承接線索，仍待結構確認</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainLiquidity(bsl,ssl))}</div></div>
    <div class="smcSlide"><div class="idx">03 供需區</div><h5>OB / FVG</h5><ul><li>Bull OB ${htmlEsc(zoneText(ob.bull))}</li><li>Bull FVG ${htmlEsc(zoneText(fvg.bull))}</li><li>Bear OB/FVG：${htmlEsc(zoneText(ob.bear))} / ${htmlEsc(zoneText(fvg.bear))}</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainSupplyDemand(ob,fvg))}</div></div>
    <div class="smcSlide"><div class="idx">04 價格位置</div><h5>Premium / Discount</h5><ul><li>${htmlEsc(pdTxt)}｜區間位置 ${htmlEsc(posTxt)}</li><li>EQ 50% ${fmt(rg.eq)}｜區間 ${fmt(rg.low)} ～ ${fmt(rg.high)}</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainPosition(rg))}</div></div>
    <div class="smcSlide"><div class="idx">05 關鍵價位</div><h5>SNR</h5><ul><li>${htmlEsc(supportTxt)}</li><li>${htmlEsc(resistTxt)}</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainSNR(snr))}</div></div>
    <div class="smcSlide"><div class="idx">06 ACTION</div><h5>操作劇本</h5><ul><li><b>觀察：</b>${htmlEsc(pl.preferred||'—')}</li><li><b>觸發：</b>${htmlEsc(pl.trigger||'—')}</li><li><b>避免：</b>${htmlEsc(pl.avoid||'—')}</li></ul><div class="smcPlain"><b>白話：</b>${htmlEsc(plainAction(sig,pl))}</div></div>
   </div><div class="smcNote">模型條件擇一（均須核對資料日）：上掃／突破失敗風險 → 結構轉弱 → 突破確認 → 回檔承接候選 → 等待。圖上仍保留 BOS、CHoCH、OB、FVG、BSL、SSL、S1/S2、R1/R2。</div><div class="ssaMiniSop ${sig.key==='structure_weak'||sig.key==='liquidity_bull_trap'?'bad':sig.key==='breakout_confirmed'||sig.key==='pullback_buy'?'good':''}"><b>SOP：</b>${htmlEsc(pl.trigger||sig.next||'先看結構，再等位置與流動性確認；沒有 CHoCH/BOS 不接刀。')}</div></div>`;
 }


 function sopModel(s,a,rule){
   const smc=a?.smc||{},m=a?.metrics||{},db=a?.dailyBias||{},st=smc.structure||{},liq=smc.liquidity||{},snr=smc.snr||{},rg=smc.range||{},sig=smc.signal||{},ob=smc.orderBlocks?.bull,fvg=smc.fvg?.bull;
   const p=Number(m.price)||0,atr=Number(m.atr)||Math.max(p*.025,.01),tol=Number(snr.tolerance)||atr*.45,t=(s?.cl?.length||1)-1;
   const num=x=>x===null||x===undefined||x===''?null:(Number.isFinite(Number(x))?Number(x):null);
   const age=e=>e&&Number.isInteger(e.i)?t-e.i:999;
   const sweeps=liq.sweeps||[],events=st.events||[];
   const sslSweep=[...sweeps].reverse().find(e=>e.side==='low'&&age(e)<=5)||null;
   const bslSweep=[...sweeps].reverse().find(e=>e.side==='high'&&age(e)<=5)||null;
   const upEvent=[...events].reverse().find(e=>e.direction==='up'&&age(e)<=8)||null;
   const downEvent=[...events].reverse().find(e=>e.direction==='down'&&age(e)<=8)||null;
   const s1=num(snr.support?.[0]?.price),s2=num(snr.support?.[1]?.price),r1=num(snr.resistance?.[0]?.price),r2=num(snr.resistance?.[1]?.price);
   const obLow=num(ob?.low),obHigh=num(ob?.high),fvgLow=num(fvg?.low),fvgHigh=num(fvg?.high);
   const nearZone=(lo,hi,mul=1.15)=>lo!=null&&hi!=null&&p>=lo-tol*mul&&p<=hi+tol*mul;
   const nearDemand=nearZone(obLow,obHigh)||nearZone(fvgLow,fvgHigh)||(s1!=null&&Math.abs(p-s1)<=tol*1.35);
   const bullDemandValid=(obLow!=null&&p>=obLow-tol*.35)||(fvgLow!=null&&p>=fvgLow-tol*.35);
   const premium=Number.isFinite(Number(rg.pos))&&Number(rg.pos)>.72;
   const distanceMidAtr=Number.isFinite(Number(m.bbMid))&&atr>0?Math.abs(p-Number(m.bbMid))/atr:null;
   const overheat=rule?.group==='H'||(Number(m.pctB)>1.10&&Number(m.rsi)>=75)||(premium&&Number(m.rsi)>=72)||(distanceMidAtr!=null&&distanceMidAtr>1.5&&Number(m.pctB)>1.03);

   let biasGate={cls:'warn',icon:'',title:'Daily Bias',text:'中性／等待'};
   if(db.bias==='bull')biasGate={cls:'good',icon:'',title:'Daily Bias',text:db.label||'偏多'};
   else if(db.bias==='bear')biasGate={cls:'bad',icon:'',title:'Daily Bias',text:db.label||'偏空'};

   let trend={cls:'warn',icon:'',title:'SMC 趨勢',text:'整理／方向待確認'};
   if(st.bias==='bull'||String(st.label||'').includes('多頭'))trend={cls:'good',icon:'',title:'SMC 趨勢',text:'HH/HL 多頭結構'};
   else if(st.bias==='bear'||String(st.label||'').includes('空頭'))trend={cls:'bad',icon:'',title:'SMC 趨勢',text:'LH/LL 空頭結構'};

   let position={cls:'warn',icon:'',title:'SNR 位置',text:`${rg.zone||'區間中段'}`};
   if(nearDemand&&!overheat)position={cls:'good',icon:'',title:'SNR 位置',text:'靠近 OB/FVG/S1'};
   else if(overheat||premium)position={cls:'hot',icon:'',title:'SNR 位置',text:'Premium／追價風險'};

   let structure={cls:'warn',icon:'',title:'結構確認',text:'等待 CHoCH / BOS'};
   if(sig.key==='structure_weak'||(downEvent&&p<Number(downEvent.level||Infinity)))structure={cls:'bad',icon:'',title:'結構確認',text:downEvent?`${downEvent.kind||'BOS'}↓ 結構轉弱`:'Protected Low 失守'};
   else if(sig.key==='liquidity_bull_trap')structure={cls:'bad',icon:'',title:'結構確認',text:'上破失敗／誘多風險'};
   else if(sig.key==='breakout_confirmed'||(upEvent&&p>Number(upEvent.level||-Infinity)))structure={cls:'good',icon:'',title:'結構確認',text:upEvent?`${upEvent.kind||'BOS'}↑ 已確認`:'Bullish BOS 已確認'};
   else if(sig.key==='pullback_buy')structure={cls:'good',icon:'',title:'結構確認',text:'掃低後已向上突破'};

   let liquidityGate={cls:'warn',icon:'',title:'流動性',text:'尚未出現有效 Sweep'};
   if(sslSweep)liquidityGate={cls:'good',icon:'',title:'流動性',text:`SSL Sweep @ ${fmt(sslSweep.level)}`};
   else if(bslSweep)liquidityGate={cls:'hot',icon:'',title:'流動性',text:`BSL Sweep @ ${fmt(bslSweep.level)}`};

   let demand={cls:'warn',icon:'',title:'Demand',text:'OB/FVG 尚未形成有效承接'};
   if((ob||fvg)&&bullDemandValid)demand={cls:nearDemand?'good':'warn',icon:'',title:'Demand',text:nearDemand?'正在 OB/FVG 附近':'Bull OB/FVG 仍有效'};
   if((obLow!=null&&p<obLow-tol*.35)&&(fvgLow==null||p<fvgLow-tol*.35))demand={cls:'bad',icon:'',title:'Demand',text:'Bull OB/FVG 已跌穿'};

   // Bollinger gate: direction, midline slope, %B and bandwidth are evaluated independently from Daily Bias.
   const bb=a?.series?.bb||{},bwNow=num(bb.bw?.[t]),bwPrev=num(bb.bw?.[Math.max(0,t-1)]),bw3=num(bb.bw?.[Math.max(0,t-3)]);
   const bwExpand=bwNow!=null&&((bwPrev!=null&&bwNow>bwPrev*1.015)||(bw3!=null&&bwNow>bw3*1.03));
   const aboveMid=num(m.bbMid)!=null&&p>Number(m.bbMid),belowMid=num(m.bbMid)!=null&&p<Number(m.bbMid),slope=num(m.ma20Slope),pctB=num(m.pctB);
   let bollingerGate={cls:'warn',icon:'',title:'Bollinger',text:'中軌／帶寬待確認'};
   if(overheat)bollingerGate={cls:'hot',icon:'',title:'Bollinger',text:`%B ${fmt(pctB,2)}／乖離過熱`};
   else if(db.bias==='bull'&&aboveMid&&slope>0&&pctB!=null&&pctB>.5&&(bwExpand||a?.pattern?.bias==='bull'))bollingerGate={cls:'good',icon:'',title:'Bollinger',text:`中軌向上${bwExpand?'＋帶寬擴張':''}`};
   else if(db.bias==='bull'&&(belowMid||slope<0||a?.pattern?.bias==='bear'))bollingerGate={cls:'bad',icon:'',title:'Bollinger',text:'偏多 Bias 但布林未共振'};
   else if(db.bias==='bear'&&belowMid&&slope<0)bollingerGate={cls:'bad',icon:'',title:'Bollinger',text:'空方與布林同向'};
   else if(db.bias==='neutral')bollingerGate={cls:'warn',icon:'',title:'Bollinger',text:'Bias 中性，只作觀察'};

   // Momentum/volume gate: MACD, volume, OBV and RSI confirm continuation; they never trigger an entry by themselves.
   const mac=String(m.macdState||''),vr=num(m.volRatio),obv5=num(m.obv5),rsi=num(m.rsi);
   const bullMomentum=[/多頭|黃金/.test(mac),vr!=null&&vr>=1.2,obv5!=null&&obv5>0,rsi!=null&&rsi>=50&&rsi<75].filter(Boolean).length;
   const bearMomentum=[/空頭|死亡/.test(mac),m.pv==='價跌量增',obv5!=null&&obv5<0,rsi!=null&&rsi<45].filter(Boolean).length;
   let momentumGate={cls:'warn',icon:'',title:'量價動能',text:`MACD ${mac||'中性'}／量比 ${fmt(vr,2)}`};
   if(overheat&&rsi!=null&&rsi>=75)momentumGate={cls:'hot',icon:'',title:'量價動能',text:`RSI ${fmt(rsi,1)} 過熱，不追價`};
   else if(db.bias==='bull'&&bullMomentum>=3)momentumGate={cls:'good',icon:'',title:'量價動能',text:`多方確認 ${bullMomentum}/4`};
   else if(db.bias==='bull'&&bearMomentum>=2)momentumGate={cls:'bad',icon:'',title:'量價動能',text:`偏多 Bias 但動能背離 ${bearMomentum}/4`};
   else if(db.bias==='bear'&&bearMomentum>=2)momentumGate={cls:'bad',icon:'',title:'量價動能',text:`空方確認 ${bearMomentum}/4`};

   const demandZones=[];
   if(sig.key==='breakout_confirmed'&&num(sig.level)!=null){const lv=num(sig.level);demandZones.push({lo:lv-tol*.22,hi:lv+tol*.35,kind:'BOS'});}
   if(s1!=null&&s1<=p+tol)demandZones.push({lo:s1-tol*.32,hi:s1+tol*.38,kind:'S1'});
   if(obLow!=null&&obHigh!=null&&obLow<=p+tol)demandZones.push({lo:obLow,hi:obHigh,kind:'OB'});
   if(fvgLow!=null&&fvgHigh!=null&&fvgLow<=p+tol)demandZones.push({lo:fvgLow,hi:fvgHigh,kind:'FVG'});
   const maxBuyDistance=Math.min(p*.08,Math.max(atr*2.2,p*.035));
   const maxStopDistance=Math.min(p*.08,Math.max(atr*2.4,p*.035));
   const nearbyZones=demandZones.filter(z=>Number.isFinite(z.lo)&&Number.isFinite(z.hi)&&z.lo<=z.hi&&Math.abs(p-(z.lo+z.hi)/2)<=maxBuyDistance);
   nearbyZones.sort((a,b)=>Math.abs(p-Math.min(p,a.hi))-Math.abs(p-Math.min(p,b.hi)));
   const chosen=nearbyZones[0]||{lo:null,hi:null,kind:'無有效結構區'};
   const entryLow=num(chosen.lo),entryHigh=num(chosen.hi);

   // 結構失效參考：先使用「真實結構價」，不足時才以目前回測區下緣加 ATR/Tick 緩衝。
   // v6.9.3 只檢查 S2 / Protected Low / OB / FVG / SSL，會漏掉 Daily Bias C1L 與最近 Swing Low；
   // 因此像「掃前低後收回」但 S2 過遠的個股，即使已有合理回測區，仍可能顯示 —。
   const tick=num(db.tick)||0;
   const stopBuffer=Math.max(tick*2,atr*.12,tol*.18,p*.001);
   const minStopGap=Math.max(tick||0,atr*.02,p*.0005);
   const rawStopCandidates=[
     {value:num(st.protectedLow),source:'SMC Protected Low',kind:'structure'},
     {value:num(st.lastLow?.p),source:'最近確認 Swing Low',kind:'structure'},
     {value:s2,source:'S2 支撐',kind:'snr'},
     {value:num(liq.pools?.ssl?.price),source:'SSL 下方流動性',kind:'liquidity'},
     {value:db.bias==='bull'?num(db.biasInvalidation):null,source:db.setup==='sweep_low_reclaim'?'Daily Bias C1L':'Daily Bias 失效線',kind:'daily-bias'},
     {value:db.bias==='bull'?num(db.c2?.low):null,source:db.setup==='sweep_low_reclaim'?'C2 掃低極值':'C2 日低',kind:'daily-bias'},
     {value:obLow,source:'Bull OB 下緣',kind:'demand'},
     {value:fvgLow,source:'Bull FVG 下緣',kind:'demand'}
   ].filter(x=>entryLow!=null&&x.value!=null&&x.value<entryLow-minStopGap&&p-x.value<=maxStopDistance&&x.value>0);
   rawStopCandidates.sort((a,b)=>b.value-a.value);
   let stopPick=rawStopCandidates[0]||null;
   const longContext=db.bias==='bull'||st.bias==='bull'||sig.bias==='bull'||a?.pattern?.bias==='bull';
   if(!stopPick&&entryLow!=null&&chosen.kind!=='無有效結構區'&&longContext){
     const zoneStop=entryLow-stopBuffer;
     if(zoneStop>0&&zoneStop<entryLow&&p-zoneStop<=maxStopDistance){
       stopPick={value:zoneStop,source:`${chosen.kind} 下緣＋ATR/Tick 緩衝`,kind:'zone-buffer',derived:true};
     }
   }
   const stop=stopPick?.value??null;
   const stopSource=stopPick?.source||(entryLow!=null?'無符合距離限制的近端失效價':'近端結構不足');
   const stopDerived=!!stopPick?.derived;
   const stopText=stop!=null?fmt(stop):(entryLow!=null?'風險距離過大／等待':'等待形成近端結構');
   const stopRule=stop!=null?`日 K 收盤有效跌破 ${fmt(stop)}（${stopSource}）後，多方回測／突破情境需重新評估。`:(entryLow!=null?'已有回測區，但找不到符合最大停損距離的結構價；不建立多方進場，等待更近的 S1 / Swing Low / OB-FVG。':'目前沒有可用的近端結構失效價；不建立多方進場，等待新的 S1 / Swing Low / OB-FVG。');
   const dbTarget=db.bias==='bull'&&!db.targetReached?num(db.primaryTarget):null;
   const targetCandidates=[dbTarget,r1,r2,liq.pools?.bsl?.price].map(num).filter(x=>entryHigh!=null&&x!=null&&x>Math.max(p,entryHigh)).filter((x,i,a)=>a.findIndex(y=>Math.abs(y-x)<tol*.15)===i).sort((x,y)=>x-y);
   const t1=targetCandidates[0]??null,t2=targetCandidates[1]??null;
   const entry=(entryLow!=null&&entryHigh!=null)?(entryLow+entryHigh)/2:null;
   const rr=entry!=null&&stop!=null&&t1!=null&&entry>stop&&t1>entry?(t1-entry)/(entry-stop):null;
   let rrGate={cls:'warn',icon:'',title:'RR',text:rr!=null?`1:${fmt(rr,1)} 尚可等待`:'資料不足'};
   if(rr!=null&&rr>=2)rrGate={cls:'good',icon:'',title:'RR',text:`1:${fmt(rr,1)} ≥ 2`};
   else if(rr!=null&&rr<1.5)rrGate={cls:'bad',icon:'',title:'RR',text:`1:${fmt(rr,1)} 不划算`};

   const gates=[biasGate,trend,position,structure,liquidityGate,demand,bollingerGate,momentumGate,rrGate];
   const green=gates.filter(x=>x.cls==='good').length,red=gates.filter(x=>x.cls==='bad').length;
   const fallingKnife=nearDemand&&structure.cls!=='good'&&!upEvent;

   // Five-layer 100-point execution score. The D1 liquidity sweep is not scored again in SMC to avoid duplicate evidence.
   const biasPts=db.bias==='bull'?Math.round(Math.min(100,Number(db.baseConfidence)||0)*.20):0;
   const smcPts=Math.min(30,(trend.cls==='good'?8:0)+(structure.cls==='good'?12:0)+(demand.cls==='good'?6:demand.cls==='warn'?2:0)+(position.cls==='good'?4:0));
   let bollPts=0;if(db.bias==='bull'){if(aboveMid)bollPts+=7;if(slope>0)bollPts+=6;if(pctB!=null&&pctB>.5)bollPts+=5;if(bwExpand)bollPts+=4;if(a?.pattern?.bias==='bull')bollPts+=3;}bollPts=Math.min(25,bollPts);
   let momPts=0;if(db.bias==='bull'){if(/多頭|黃金/.test(mac))momPts+=5;if(vr!=null&&vr>=1.2)momPts+=4;if(obv5!=null&&obv5>0)momPts+=3;if(rsi!=null&&rsi>=50&&rsi<75)momPts+=3;}momPts=Math.min(15,momPts);
   let riskPts=0;if(rr!=null&&rr>=2)riskPts+=7;else if(rr!=null&&rr>=1.5)riskPts+=4;if(!overheat)riskPts+=3;riskPts=Math.min(10,riskPts);
   const framework={bias:biasPts,smc:smcPts,bollinger:bollPts,momentum:momPts,risk:riskPts,total:biasPts+smcPts+bollPts+momPts+riskPts,
     note:'權重：Daily Bias 20／SMC-SNR 30／Bollinger 25／量價動能 15／RR風險 10。D1 Sweep 不在 SMC 重複計分。'};

   let finalKey='wait',final='🟡 等待',oneLine='趨勢／位置／結構尚未同時完成，先等訊號，不猜最低點。';
   if(sig.key==='liquidity_bull_trap'){finalKey='sell';final='🟢 流動性誘多／防守';oneLine='上方流動性被掃後沒有延續，先防守；重新站回假突破位並出現向上 CHoCH/BOS 才重評。';}
   else if(sig.key==='structure_weak'||red>=3){finalKey='sell';final='🟢 結構轉弱';oneLine='結構已轉弱，先控風險；重新站回關鍵壓力並出現向上 CHoCH/BOS 才重評。';}
   else if(db.bias==='bear'){finalKey='wait';final='🟡 Daily Bias 偏空／先防守';oneLine='Daily Bias 偏空，只當方向過濾；未出現新的多方 CHoCH/BOS、布林轉強與量價共振前，不啟動多方進場。';}
   else if(db.bias==='neutral'){finalKey='wait';final='🟡 Daily Bias 弱／等待';oneLine='C2 沒有形成明確 Sweep 或收盤突破；先等盤中結構、布林與量價共同給方向。';}
   else if(overheat){finalKey='hot';final='🟡 趨勢多但勿追';oneLine='Daily Bias 偏多，但價格已過度延伸；等回測突破區、OB/FVG 或 S1，再看承接。';}
   else if(fallingKnife){finalKey='wait';final='🟡 Demand 未確認／不接刀';oneLine='雖已進 Demand，但尚未完成向上 CHoCH/BOS；只觀察，不因跌深就接。';}
   else if(sig.key==='pullback_buy'&&structure.cls==='good'&&bollingerGate.cls!=='bad'&&momentumGate.cls!=='bad'&&rr!=null&&rr>=2&&framework.total>=62){finalKey='buy';final='🔴 回檔買點';oneLine='Daily Bias 偏多，掃低／結構與回測區已對齊；等承接與量價不轉弱後再分批，失效就退出。';}
   else if(sig.key==='breakout_confirmed'&&structure.cls==='good'&&bollingerGate.cls==='good'&&momentumGate.cls!=='bad'&&rr!=null&&rr>=2&&framework.total>=65){finalKey='buy';final='🔴 突破確認';oneLine='Daily Bias、BOS 與布林共振；仍優先等突破位回測不破，不追遠離成本區的紅K。';}
   else if(framework.total>=60&&structure.cls==='good'&&rr!=null&&rr>=2){finalKey='wait';final='🟡 結構條件偏多';oneLine='五層條件大致偏多，但尚缺明確回檔買點或突破確認；等待價格把最後一個條件完成。';}

   const entryTxt=entryLow!=null&&entryHigh!=null?`${fmt(Math.min(entryLow,entryHigh))}～${fmt(Math.max(entryLow,entryHigh))}`:'—';
   return{finalKey,final,oneLine,gates,green,red,entryTxt,stop,stopText,stopSource,stopDerived,stopRule,t1,t2,rr,fallingKnife,overheat,framework,bollingerGate,momentumGate,
     entryLow,entryHigh,maxBuyDistance,maxStopDistance,planSource:chosen.kind,targetFallback:targetCandidates.length<2,dailyBias:db,guard:fallingKnife?'Falling Knife Guard：Demand 不是買點；未出現 Sweep＋CHoCH/BOS 前維持等待。':'SOP：Daily Bias → SMC/SNR → 布林 → 量價 → RR → 進場。'};
 }
 function renderSOPDashboard(s,a,rule){
   const el=document.getElementById('ssaSOP');if(!el)return;
   const x=sopModel(s,a,rule),context=StockReport.dataContext(s,quality);
   const cls=x.finalKey==='buy'?'buy':x.finalKey==='sell'?'sell':x.finalKey==='hot'?'hot':'wait';
   const fw=x.framework||{},layers=[['Bias',fw.bias,20],['SMC/SNR',fw.smc,30],['Bollinger',fw.bollinger,25],['量價',fw.momentum,15],['RR/風險',fw.risk,10]];
   el.innerHTML=`<div class="sopHead"><h4>Daily Bias × SMC 一眼判斷 SOP</h4><span class="sopDecision ${cls}">${context.historical?'資料當日：':''}${htmlEsc(x.final)}</span><span class="smcBadge">條件 ${x.green}/${x.gates.length}</span><span class="frameworkScore"><span class="smcBadge">多方執行分 <b>${fw.total??0}/100</b></span></span><span class="sopFlow">Bias → SMC/SNR → 布林 → 量價 → RR → 進場</span></div>
   <div class="frameworkLayers">${layers.map(z=>`<div class="frameworkLayer"><small>${htmlEsc(z[0])}</small><strong>${Number(z[1]||0)}/${z[2]}</strong></div>`).join('')}</div>
   <div class="sopGrid">${x.gates.map(g=>`<div class="sopGate ${g.cls}"><small>${htmlEsc(g.title)}</small><strong>${g.icon} ${htmlEsc(g.text)}</strong></div>`).join('')}</div>
   <div class="sopTrade"><div><small>觀察回測區</small><b>${htmlEsc(x.entryTxt)}</b></div><div><small>交易結構失效參考</small><b>${htmlEsc(x.stopText)}</b><span class="sopSub">${htmlEsc(x.stopSource)}${x.stopDerived?' · 模型緩衝':''}</span></div><div><small>T1</small><b>${fmt(x.t1)}</b></div><div><small>T2</small><b>${fmt(x.t2)}</b></div></div>
   <div class="sopOneLine">${htmlEsc(x.oneLine)}</div><div class="sopGuard"><b>防接刀：</b>${htmlEsc(x.guard)}${x.rr!=null?`｜RR 1:${fmt(x.rr,1)}`:''}<br><span class="ssaNeutral">${htmlEsc(fw.note||'')}</span></div>`;
 }
 function analystModel(s,a,rule){
   const m=a?.metrics||{},db=a?.dailyBias||{},smc=a?.smc||{},sig=smc.signal||{},snr=smc.snr||{},rg=smc.range||{},p=Number(m.price),atr=Number(m.atr)||Math.max(p*.025,.01),tol=Number(snr.tolerance)||atr*.45;
   const s1=snr.support?.[0]?.price,s2=snr.support?.[1]?.price,r1=snr.resistance?.[0]?.price,r2=snr.resistance?.[1]?.price,bsl=smc.liquidity?.pools?.bsl?.price,ssl=smc.liquidity?.pools?.ssl?.price;
   let score=Number(smc.score)||0;
   if(db.bias==='bull')score+=(Number(db.baseConfidence)>=85?3:2);else if(db.bias==='bear')score-=(Number(db.baseConfidence)>=85?3:2);
   if(sig.key==='breakout_confirmed')score+=4;else if(sig.key==='pullback_buy')score+=3;else if(sig.key==='structure_weak')score-=4;else if(sig.key==='liquidity_bull_trap')score-=5;
   if(a?.pattern?.bias==='bull')score+=2;else if(a?.pattern?.bias==='bear')score-=2;
   if(m.maState==='多頭排列')score+=2;else if(m.maState==='空頭排列')score-=2;else if(String(m.maState||'').includes('短多'))score+=1;else if(String(m.maState||'').includes('短空'))score-=1;
   const mac=String(m.macdState||'');if(mac.includes('黃金')||mac.includes('多頭'))score+=1;if(mac.includes('死亡')||mac.includes('空頭'))score-=1;
   if(m.pv==='價漲量增')score+=1;else if(m.pv==='價跌量增')score-=1;
   if(Number.isFinite(m.rsi)&&m.rsi>=78&&score>0)score-=1;
   score=Math.max(-12,Math.min(12,score));
   let decision='觀望',dclass='wait',stance='中性',holding='等待方向確認';
   if(sig.key==='liquidity_bull_trap'||sig.key==='structure_weak'||score<=-7){decision='賣出／減碼';dclass='sell';stance='偏空';holding='已有持股先控風險；未持有先不要接';}
   else if(sig.key==='breakout_confirmed'){decision='買進';dclass='buy';stance='偏多';holding='突破位守穩可續抱，回測承接可分批';}
   else if(sig.key==='pullback_buy'){decision='買進';dclass='buy';stance='偏多';holding='等支撐止跌後分批，不一次重押';}
   else if(score>=5&&Number(rg.pos)<=.78){decision='觀望';dclass='wait';stance='偏多';holding='趨勢偏多但訊號未完成，不追價，等支撐或突破確認';}
   if(dclass==='buy'&&db.bias!=='bull'){decision='觀望';dclass='wait';stance=db.bias==='bear'?'偏空防守':'方向未明';holding=db.bias==='bear'?'Daily Bias 偏空；等新的向上 CHoCH/BOS 與布林轉強再評估':'Daily Bias 偏弱；先等方向確認，不因單一指標進場';}
   if(rule?.group==='M'){
    const mm=rule.midline?.current||rule.midline||{},tier=rule.midline?.tier||mm.tier||'M1';
    decision=tier==='M3'?'優先監測':'觀察';dclass='wait';stance=`中軌動能 ${tier}`;holding=`守住20日中軌與訊號低點，${tier==='M3'?'優先看上軌突破／回測':'等待量價延續與距上軌收斂'}`;
   }else if(rule?.group==='H'){
    decision='觀望';dclass='wait';stance='偏多但過熱';holding='突破方向偏多，但追價風險過高；等待回測突破區／布林上軌／OB-FVG後再評估';
   }
   const num=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x))?Number(x):null;
   const f=x=>fmt(x);
   // One authoritative price plan is shared by the decision cards, SOP and exports.
   const sharedPlan=sopModel(s,a,rule);
   const {entryLow,entryHigh,stop,stopText,stopSource,stopDerived,stopRule,t1,t2,maxBuyDistance,maxStopDistance}=sharedPlan;
   const bullZone=entryLow!=null&&entryHigh!=null?[entryLow,entryHigh]:null;
   const buyZoneReasonable=!!bullZone;
   const rawBullZone=smc.orderBlocks?.bull||smc.fvg?.bull||null;
   if(dclass==='buy'&&sharedPlan.finalKey!=='buy'){decision='觀望';dclass='wait';holding=sharedPlan.oneLine;}
   const buyText=db.bias==='bear'?'Daily Bias 偏空，暫不啟動多方進場':db.bias==='neutral'?'Daily Bias 方向偏弱，先等待結構確認':bullZone?`${f(bullZone[0])}～${f(bullZone[1])}，觀察回測守穩與量價`:'缺少有效近端回測區，等待新的結構與支撐';
   const sellRef=[r1,bsl,smc.structure?.protectedHigh].map(num).find(x=>x!=null&&x>=p-tol*.25)??null;
   const weakBreak=[s1,ssl,smc.structure?.protectedLow].map(num).find(x=>x!=null&&x<p&&(p-x)<=maxStopDistance)??null;
   const sellText=(dclass==='sell')?(sellRef!=null?`反彈至 ${f(sellRef)} 附近無法突破可減碼；${weakBreak!=null?`再跌破 ${f(weakBreak)} 則偏弱確認`:'再破前低則偏弱確認'}`:'反彈不過壓力可減碼；再破前低偏弱確認'):(stop!=null?`有效跌破 ${f(stop)}，多方情境失效（${stopSource}）`:'缺少有效近端失效價，維持觀察');
   let tomorrow='震盪',forecastClass='wait';if(score>=7){tomorrow='偏多／有機會續攻';forecastClass='buy';}else if(score>=3){tomorrow='偏多震盪';forecastClass='buy';}else if(score<=-7){tomorrow='偏空／有續弱風險';forecastClass='sell';}else if(score<=-3){tomorrow='偏空震盪';forecastClass='sell';}if(db.bias==='bear'&&!['liquidity_bull_trap','structure_weak'].includes(sig.key)&&score>-7){tomorrow='Daily Bias 偏空／等待空方確認';forecastClass='sell';}else if(db.bias==='neutral'&&Math.abs(score)<7){tomorrow='方向未定／等待';forecastClass='wait';}
   const centerShift=score>=3?.14:score<=-3?-.14:0,center=p+atr*centerShift,lo=center-atr*(score>=3?.58:score<=-3?.82:.68),hi=center+atr*(score>=3?.82:score<=-3?.58:.68);
   const upVerify=p+atr*.20,downVerify=p-atr*.20;
   // 驗證價必須位於現價正確方向：偏多只引用現價上方壓力，偏空只引用現價下方支撐。
   const supportRef=[s1,ssl,smc.structure?.protectedLow].map(num).find(x=>x!=null&&x<p-tol*.05&&(p-x)<=maxStopDistance)??null;
   const resistRef=[r1,bsl,smc.structure?.protectedHigh].map(num).find(x=>x!=null&&x>p+tol*.05)??null;
   let verify;if(score>=3)verify=`下一交易日收盤 ≥ ${f(upVerify)} 視為偏多情境門檻（ATR 模型）；${resistRef!=null?`若再站上 ${f(resistRef)}，屬強勢驗證。`:''}收盤 < ${f(downVerify)}${supportRef!=null?` 或跌破 ${f(supportRef)}`:''}，偏多情境失效。`;
   else if(score<=-3)verify=`下一交易日收盤 ≤ ${f(downVerify)} 視為偏空情境門檻（ATR 模型）；${supportRef!=null?`若再跌破 ${f(supportRef)}，屬弱勢確認。`:''}收盤 > ${f(upVerify)}${resistRef!=null?` 或站回 ${f(resistRef)}`:''}，偏空情境失效。`;
   else verify=`下一交易日收盤落在 ${f(downVerify)}～${f(upVerify)} 視為震盪情境成立；${resistRef!=null?`站上 ${f(resistRef)} 轉偏多`:''}${resistRef!=null&&supportRef!=null?'，':''}${supportRef!=null?`跌破 ${f(supportRef)} 轉偏空`:''}。`;
   const filters=[];if(!buyZoneReasonable&&rawBullZone)filters.push('已過濾離現價過遠的舊買點');if(stop==null)filters.push('沒有可用的近端結構失效價');if(score>=3&&resistRef==null)filters.push('未顯示低於現價的偏多驗證壓力');
   const reasons=[];reasons.push(`Daily Bias：${db.label||'未計算'}（${db.session||'今日'}）`);reasons.push(`SMC：${sig.label||'等待'}（${smc.structure?.label||'結構未明'}）`);reasons.push(`布林：${a?.pattern?.label||'—'}`);reasons.push(`均線／MACD：${m.maState||'—'}／${m.macdState||'—'}`);reasons.push(`量價：${m.pv||'—'}，RSI ${f(m.rsi)}`);
   return{score,decision,dclass,stance,holding,buyText,sellText,entryLow,entryHigh,stop,stopText,stopSource,stopDerived,stopRule,t1,t2,tomorrow,forecastClass,lo,hi,verify,reasons,filters,maxBuyDistance,maxStopDistance};
 }
 function renderAnalystConclusion(s,a,rule){
   const x=analystModel(s,a,rule),context=StockReport.dataContext(s,quality),el=document.getElementById('ssaAnalyst');if(!el)return;
   el.innerHTML=`<div class="analystHead analystHead--v3">
      <div class="analystTitle">
         <div class="analystEyebrow">AI TECHNICAL DECISION</div>
         <h4>技術決策中心</h4>
         <p>先看方向，再看進場、防守與目標；把複雜指標整理成可執行的 SOP。</p>
      </div>
      <div class="analystPills">
         <span class="analystDecision ${x.dclass}"><span class="pillDot"></span>${context.historical?'資料當日：':''}${htmlEsc(x.decision)}</span>
         <span class="smcBadge score">模型分數 <strong>${x.score>0?'+':''}${x.score}</strong></span>
         <span class="smcBadge trend ${x.forecastClass==='buy'?'smcBull':x.forecastClass==='sell'?'smcBear':'smcNeutral'}">${context.historical?'當日情境':'下一交易日'} · ${htmlEsc(x.tomorrow)}</span>
      </div>
   </div>
   <div class="analystGrid analystGrid--v3">
      <div class="analystCell analystCell--stance">
         <div class="analystCellTop"><span class="analystIcon analystIcon--stance"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17l4-4 3 3 7-8"/><path d="M14 8h5v5"/></svg></span><b>目前立場</b></div>
         <strong>${htmlEsc(x.stance)}</strong><small>${htmlEsc(x.holding)}</small>
      </div>
      <div class="analystCell analystCell--entry">
         <div class="analystCellTop"><span class="analystIcon analystIcon--entry"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/></svg></span><b>進場條件</b></div>
         <strong>${htmlEsc(x.buyText.split("，")[0])}</strong><small>${htmlEsc(x.buyText)}。等待確認，避免直接追高。</small>
      </div>
      <div class="analystCell analystCell--risk">
         <div class="analystCellTop"><span class="analystIcon analystIcon--risk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4z"/><path d="M12 8v5M12 16h.01"/></svg></span><b>防守／減碼</b></div>
         <strong>${htmlEsc(x.dclass==='sell'?x.sellText.split('；')[0]:(x.sellText.match(/\d+(?:\.\d+)?/)?.[0]||x.sellText))}</strong><small>${htmlEsc(x.sellText)}</small>
      </div>
      <div class="analystCell analystCell--target">
         <div class="analystCellTop"><span class="analystIcon analystIcon--target"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg></span><b>上方目標</b></div>
         <strong>第一目標 ${fmt(x.t1)}</strong><small>第二目標 ${fmt(x.t2)} · 分批停利，不一次猜最高點。</small>
      </div>
   </div>
   <div class="analystInsightGrid">
      <details class="analystSummary analystSummary--v3">
         <summary class="insightHeading"><span class="insightIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13"/></svg></span><div><b>為什麼這樣判斷</b><small>模型主要依據</small></div></summary>
         <span>${x.reasons.map(htmlEsc).join('　｜　')}</span>
         ${x.filters?.length?`<div class="analystNote"><b>價格合理性檢查</b><span>${x.filters.map(htmlEsc).join('；')}</span></div>`:''}
      </details>
      <details class="analystForecast analystForecast--v3">
         <summary class="insightHeading"><span class="insightIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg></span><div><b>${context.historical?'資料當日的隔日觀察':'下一交易日觀察條件'}</b><small>用價格確認，不用猜測</small></div></summary>
         <span><strong>${htmlEsc(x.tomorrow)}</strong> · ATR 波動參考 <strong>${fmt(x.lo)}～${fmt(x.hi)}</strong></span>
         <div class="analystNote"><b>驗證條件</b><span>${htmlEsc(x.verify)}</span></div>
      </details>
   </div>
   <div class="analystFine analystFine--v3"><span>ⓘ</span><span>模型整合日 K 與量價。ATR 區間僅為波動情境，未經預測準確率驗證；盤中價格未完成收盤確認。</span></div>`;
 }



function buildPosterSvg(s,a,rule,mode='standard'){
   return StockReport.build({s,a,rule,mode,sop:sopModel(s,a,rule),analyst:analystModel(s,a,rule),quality,source:currentSource});
 }
function renderPoster(s,a,rule,mode=posterMode){
   if(!posterImg||!posterEmpty||!posterDownload)return;
   const svg=buildPosterSvg(s,a,rule,mode);
   const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
   posterImg.src=url;
   posterImg.style.display='block';
   posterEmpty.style.display='none';
   posterDownload.href=url;
   posterDownload.download=`${s.c||'stock'}_trading_plan_${mode}.svg`;
   if(posterMeta)posterMeta.textContent=`已依 ${s.c} ${s.n||''} 的最新分析產生${mode==='compact'?'精簡圖卡':'完整報告'}；資料日 ${s.d?.at(-1)||'—'}。SVG 保留向量細節，PNG 適合分享與保存。`;
 }
 function renderTradePlan(smc,a,rule){
   const plan=sopModel(current,a,rule);
   return `<div class="ssaBlock ssaWide"><h4>技術位置參考</h4><div class="ssaLine"><b>資料當日條件：</b>${htmlEsc(plan.final)}</div><div class="ssaLine"><b>觀察回測區：</b>${htmlEsc(plan.entryTxt)}</div><div class="ssaLine"><b>結構失效參考：</b>${htmlEsc(plan.stopText)}${plan.stop!=null?`　<span class="ssaNeutral">來源：${htmlEsc(plan.stopSource)}${plan.stopDerived?'（模型緩衝）':''}</span>`:''}</div><div class="ssaLine"><b>失效判定：</b>${htmlEsc(plan.stopRule)}</div><div class="ssaLine"><b>上方參考 T1：</b>${fmt(plan.t1)}　<b>T2：</b>${fmt(plan.t2)}</div><div class="ssaLine"><b>風險報酬：</b>${plan.rr!=null&&plan.rr>0?'1 : '+fmt(plan.rr):'條件不足'}</div><div class="ssaLine ssaNeutral">區間基準 ${htmlEsc(plan.planSource)}；${plan.targetFallback?'缺少足夠有效壓力，缺項不推造目標價':'上方參考取自技術壓力與流動性位置'}。此處與摘要、圖卡採同一組 SOP 位置。</div></div>`;
 }

 function miniSop(text,kind='wait'){
   return `<div class="ssaMiniSop ${kind}"><b>SOP：</b>${htmlEsc(text)}</div>`;
 }
 function qualityBars(q){
   if(!q)return '<div class="ssaLine ssaNeutral">研究品質資料不足。</div>';
   const rows=[['趨勢',q.trendScore,25],['突破',q.breakoutScore,20],['量價',q.volumeScore,20],['位置',q.positionScore,20],['流動性',q.liquidityScore,15]];
   return `<div class="ssaQualityBars">${rows.map(([n,v,m])=>{const pct=Math.max(0,Math.min(100,(Number(v)||0)/m*100));return `<div class="ssaQBar"><small><span>${n}</span><b>${v}/${m}</b></small><div class="ssaQTrack"><div class="ssaQFill" style="width:${pct}%"></div></div></div>`;}).join('')}</div>`;
 }
 function blockSops(m,p,a,rule,smc){
   const price=Number(m.price),pctB=Number(m.pctB)*100;
   const nearS=Number(a.support?.[0]?.[1]),nearR=Number(a.resistance?.[0]?.[1]);
   const out={};
   if(p.bias==='bull'&&pctB<=110)out.boll=['布林偏多但不追伸展；守住中軌可續看，跌回中軌下轉等待。','good'];
   else if(pctB>110||rule?.group==='H')out.boll=['位置過熱，禁止追價；等待回測上軌／中軌或OB/FVG再重新判斷。','hot'];
   else if(p.bias==='bear')out.boll=['布林結構偏弱，新倉先停；等價格站回中軌且中軌走平／上揚。','bad'];
   else out.boll=['布林方向未形成優勢，先等突破或回到支撐。','wait'];

   if(String(m.maState).includes('多頭')&&String(m.macdState).includes('多頭'))out.trend=['趨勢與動能同向，可續追蹤；新倉仍需確認位置與量價，不能只看MACD。','good'];
   else if(String(m.macdState).includes('死叉')||String(m.maState).includes('空頭'))out.trend=['趨勢／動能轉弱，先控風險；等重新站回均線與MACD修復。','bad'];
   else out.trend=['趨勢與動能不同步，先觀察，不提高部位。','wait'];

   out.positive=a.positives.length>=3?['多方條件集中，但仍要等回測／突破確認後才執行。','good']:['多方條件不足，先等待更多條件共振。','wait'];
   out.risk=a.risks.length?['已有主要風險警示：停止追價；持股以防守位優先，風險解除再評估。','bad']:a.cautions.length?['有次要警示，降低追價意願並縮短驗證時間。','hot']:['目前無主要警示，但仍依結構失效價控風險。','good'];

   if(Number.isFinite(nearS)&&price>0&&Math.abs(price-nearS)/price<=0.03)out.position=['靠近支撐，先等止跌／Sweep＋CHoCH；不是碰支撐就直接買。','good'];
   else if(Number.isFinite(nearR)&&price>0&&Math.abs(nearR-price)/price<=0.03)out.position=['靠近壓力，避免追價；等突破站穩或回檔再做。','hot'];
   else out.position=['位於支撐與壓力中間，風報比普通，等待更靠近關鍵價位。','wait'];

   const g=rule?.group;
   if(g==='M')out.research=[`中軌動能 ${rule?.midline?.tier||'M1'}：先看中軌→上軌路徑；守中軌與訊號低點，量價續強才升級。`,rule?.midline?.tier==='M3'?'good':'wait'];
   else if(g==='A')out.research=['A組延續確認完成：可列高優先研究，但跌破突破日低點／中軌就取消劇本。','good'];
   else if(g==='H')out.research=['過熱突破：分數再高也不追；等待乖離收斂後重算。','hot'];
   else if(g==='D')out.research=['舊突破已失效：不把反彈當原訊號恢復，等待全新突破。','bad'];
   else if(g==='N')out.research=['新突破首日：等待下一交易日守價、守量，確認後才升級。','wait'];
   else out.research=['研究分只做排序；未達完整交易條件前維持等待。','wait'];
   return out;
 }
 function renderAnalysis(s,a,source){
   currentSource=source||s.live_source||"Yahoo Finance 日 K / 本機快取";
   const m=a.metrics,p=a.pattern,smc=a.smc||null;
   document.getElementById('ssaName').innerHTML=`${htmlEsc(s.n||s.c)} <span class="code">${htmlEsc(s.c)}${s.m==='TWO'?'.TWO':'.TW'}</span>`;
   document.getElementById('ssaPattern').textContent=displayText(p.label);document.getElementById('ssaPattern').style.color=biasColor(p.bias);
   document.getElementById('ssaPrice').textContent=fmt(m.price);const dbCard=document.getElementById('ssaDailyBias');if(dbCard){dbCard.textContent=displayText(a.dailyBias?.shortLabel||a.dailyBias?.label||'—');dbCard.style.color=biasColor(a.dailyBias?.bias);}document.getElementById('ssaMA').textContent=m.maState;document.getElementById('ssaMACD').textContent=m.macdState;
   let rule=null;try{rule=SelectionRules.classify(s,SP,{});}catch(e){}
   document.getElementById('ssaScore').textContent=rule?.score!=null?`${rule.score}/100`:'—';
   const smcCard=document.getElementById('ssaSMC');smcCard.textContent=smc?`${displayText(smc.signal?.label||'等待')}｜${smc.structure?.label||'—'}`:'—';smcCard.className=smcClass(smc?.signal?.bias||smc?.bias);
   const pos=`布林上／中／下 ${fmt(m.bbUp)} / ${fmt(m.bbMid)} / ${fmt(m.bbLow)}｜%B ${fmt(m.pctB*100,1)}%｜帶寬 ${fmt(m.bw)}%｜近120日窄度位階 ${fmt(p.rank,1)}%`;
   const trend=`${m.maState}｜MA20近5日斜率 ${m.ma20Slope>=0?'+':''}${fmt(m.ma20Slope)}%｜5/20/60日報酬 ${fmt(m.ret5)}% / ${fmt(m.ret20)}% / ${fmt(m.ret60)}%`;
   const momentum=`${m.macdState}｜DIF ${fmt(m.dif)} / DEA ${fmt(m.dea)} / 柱 ${fmt(m.hist)}｜RSI14 ${fmt(m.rsi,1)}｜${m.kdState} K ${fmt(m.K,1)} / D ${fmt(m.D,1)}`;
   const volume=`${m.pv}｜今日量 / 20日均量 ${fmt(m.volRatio)} 倍｜今日量 / 5日均量 ${fmt(m.vol5Ratio)} 倍｜OBV近5日 ${m.obv5>=0?'+':''}${Math.round(m.obv5||0).toLocaleString()}`;
   const vol=`ATR14 ${fmt(m.atr)}（${fmt(m.atrPct)}%）｜近20日高低 ${fmt(m.high20)} / ${fmt(m.low20)}｜近60日高低 ${fmt(m.high60)} / ${fmt(m.low60)}`;
   const levels=(title,arr)=>`<div class="ssaLine"><b>${title}：</b>${arr.slice(0,3).map(x=>`${htmlEsc(x[0])} ${fmt(x[1])}`).join('｜')}</div>`;
   const sop=blockSops(m,p,a,rule,smc),q=rule?.quality;
   const groupText=rule?({M:'M 中軌動能',A:'A 延續確認',N:'新突破・健康',H:'新突破・過熱觀察',V:'價格符合・量能未達',B:'B 強勢延伸',C:'C 量縮／整理',D:'D 突破轉弱',Q:'Q3 資料異常',NONE:'未入候選'}[rule.group]||rule.group):'—';
   document.getElementById('ssaAnalysis').innerHTML=`
    ${renderDailyBias(a)}
    <div class="ssaBlock"><h4>布林通道型態</h4><div class="ssaLine" style="color:${biasColor(p.bias)}"><b>${htmlEsc(p.label)}</b></div><div class="ssaLine">${htmlEsc(p.description)}</div><div class="ssaLine ssaNeutral">${htmlEsc(pos)}</div>${miniSop(...sop.boll)}</div>
    <div class="ssaBlock"><h4>趨勢與動能</h4><div class="ssaLine">${htmlEsc(trend)}</div><div class="ssaLine">${htmlEsc(momentum)}</div><div class="ssaLine">${htmlEsc(volume)}</div><div class="ssaLine">${htmlEsc(vol)}</div>${miniSop(...sop.trend)}</div>
    <div class="ssaBlock"><h4>偏多條件</h4>${a.positives.length?a.positives.map(x=>`<div class="ssaLine ssaGood">✓ ${htmlEsc(x)}</div>`).join(''):'<div class="ssaLine ssaNeutral">目前沒有明顯偏多條件聚集。</div>'}${miniSop(...sop.positive)}</div>
    <div class="ssaBlock"><h4>風險與弱項</h4>${a.cautions.length?a.cautions.map(x=>`<div class="ssaLine ${a.risks.includes(x)?'ssaWarn':'ssaBad'}">⚠ ${htmlEsc(x)}</div>`).join(''):'<div class="ssaLine ssaNeutral">目前未偵測到主要技術風險警示。</div>'}${miniSop(...sop.risk)}</div>
    <div class="ssaBlock"><h4>價格位置參考</h4>${levels('較近支撐',a.support)}${levels('較近壓力',a.resistance)}<div class="ssaLine ssaNeutral">支撐／壓力是技術位置參考，不代表一定反轉。</div>${miniSop(...sop.position)}</div>
    <div class="ssaBlock"><h4>R10.19A＋Daily Bias 研究系統</h4><div class="ssaLine">${rule?`分組 ${htmlEsc(groupText)}｜研究品質分 ${rule.score}/100｜${htmlEsc(q?.grade||'')}`:'資料不足或規則未計算'}</div>${rule?.midline?`<div class="ssaLine ssaGood"><b>中軌動能：</b>${htmlEsc(rule.midline.tier||'M')}｜續攻 ${htmlEsc(rule.midline.health?.label||'訊號初始')}｜${Math.round(rule.midline.current?.score??rule.midline.score??0)}/100｜中軌→上軌 ${fmt(rule.midline.current?.progress??rule.midline.progress,1)}%｜距上軌 ${fmt(rule.midline.current?.distUpper??rule.midline.distUpper,1)}%</div>`:''}${qualityBars(q)}${q?.alerts?.length?`<div class="ssaLine ssaWarn">${htmlEsc(q.alerts.join('；'))}</div>`:''}<div class="ssaLine ssaNeutral">資料：${htmlEsc(source||'本機快取')}｜${htmlEsc(s.live_source||'日K')}</div>${miniSop(...sop.research)}</div>
    ${renderSMCIndex(smc)}`;
   document.getElementById('ssaAnalysis').insertAdjacentHTML('beforeend',renderTradePlan(smc,a,rule));
   renderSOPDashboard(s,a,rule);renderAnalystConclusion(s,a,rule);renderPoster(s,a,rule);
 }
 function canvasSize(){const r=cv.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);const pixelW=Math.round(Math.max(240,r.width)*d),pixelH=Math.round(Math.max(560,r.height)*d);if(cv.width!==pixelW)cv.width=pixelW;if(cv.height!==pixelH)cv.height=pixelH;const ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);return{ctx,w:Math.max(240,r.width),h:Math.max(560,r.height)};}
 function draw(){
   if(!current||!analysis||cv.getBoundingClientRect().width===0)return;
   const s=current,a=analysis,ser=a.series;
    let smc=a.smc||null;
    if(hover!=null&&hover>=64&&hover<s.cl.length-1){
      if(!historicalAnalyses.has(hover)){
        const past={...s,_ssaProvisional:false};for(const k of ['d','o','h','l','cl','v'])past[k]=s[k].slice(0,hover+1);
        historicalAnalyses.set(hover,SingleStockCore.analyze(past).smc);
      }
      smc=historicalAnalyses.get(hover);
    }
    const {ctx,w,h}=canvasSize();
   ctx.fillStyle='#302943';ctx.fillRect(0,0,w,h);
   const showStructure=document.getElementById('ssaStructureMarkers')?.checked!==false;
   const unit=h/760;
   const n=s.cl.length,m=Math.min(n,w<700?70:160),i0=n-m,pad={l:w<700?18:56,r:58,t:18,b:24},price0=18*unit,price1=430*unit,vol0=442*unit,vol1=520*unit,mac0=535*unit,mac1=650*unit,rsi0=665*unit,rsi1=735*unit,x0=pad.l,x1=w-pad.r,step=(x1-x0)/m,bwid=Math.max(2,Math.min(7,step*.62));
   let mn=Infinity,mx=-Infinity,vm=1,macMin=Infinity,macMax=-Infinity;
   for(let i=i0;i<n;i++){mn=Math.min(mn,s.l[i],ser.bb.lo[i]??Infinity,ser.ma60[i]??Infinity);mx=Math.max(mx,s.h[i],ser.bb.up[i]??-Infinity,ser.ma60[i]??-Infinity);vm=Math.max(vm,s.v[i],ser.vma5[i]||0,ser.vma20[i]||0);macMin=Math.min(macMin,ser.macd.dif[i],ser.macd.dea[i],ser.macd.hist[i],0);macMax=Math.max(macMax,ser.macd.dif[i],ser.macd.dea[i],ser.macd.hist[i],0);}
   if(smc&&showStructure){
     for(const z of [...(smc.snr?.support||[]),...(smc.snr?.resistance||[])])if(Number.isFinite(z.price)){mn=Math.min(mn,z.price);mx=Math.max(mx,z.price);}
     for(const z of [smc.orderBlocks?.bull,smc.orderBlocks?.bear,smc.fvg?.bull,smc.fvg?.bear])if(z){mn=Math.min(mn,z.low);mx=Math.max(mx,z.high);}
     for(const z of [smc.liquidity?.pools?.bsl,smc.liquidity?.pools?.ssl])if(Number.isFinite(z?.price)){mn=Math.min(mn,z.price);mx=Math.max(mx,z.price);}
     if(Number.isFinite(smc.range?.eq)){mn=Math.min(mn,smc.range.eq);mx=Math.max(mx,smc.range.eq);}
   }
   let pp=(mx-mn)*.05||1;mn-=pp;mx+=pp;let mp=(macMax-macMin)*.08||.01;macMin-=mp;macMax+=mp;
   const X=i=>x0+(i-i0+.5)*step,Y=v=>price0+(mx-v)/(mx-mn)*(price1-price0),V=v=>vol1-v/vm*(vol1-vol0-5),M=v=>mac0+(macMax-v)/(macMax-macMin)*(mac1-mac0),R=v=>rsi0+(100-v)/100*(rsi1-rsi0);
   ctx.font='16px sans-serif';ctx.fillStyle='#C6C1D9';ctx.strokeStyle='#8E97B8';
   for(let g=0;g<=4;g++){const y=price0+(price1-price0)*g/4,p=mx-(mx-mn)*g/4;ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.fillText(p.toFixed(p<100?2:1),x1+5,y+3);}
   ctx.beginPath();let st=false;for(let i=i0;i<n;i++){if(ser.bb.up[i]==null)continue;st?ctx.lineTo(X(i),Y(ser.bb.up[i])):ctx.moveTo(X(i),Y(ser.bb.up[i]));st=true;}for(let i=n-1;i>=i0;i--)if(ser.bb.lo[i]!=null)ctx.lineTo(X(i),Y(ser.bb.lo[i]));ctx.closePath();ctx.fillStyle='#C6C1D914';ctx.fill();
   const line=(arr,col,width,yfn=Y,dash=[])=>{ctx.beginPath();let z=false;for(let i=i0;i<n;i++){const v=arr[i];if(v==null||!Number.isFinite(v)){z=false;continue;}z?ctx.lineTo(X(i),yfn(v)):ctx.moveTo(X(i),yfn(v));z=true;}ctx.setLineDash(dash);ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([]);};
   line(ser.bb.up,'#A6B8D7',1.3);line(ser.bb.mid,'#C6C1D9',1.45);line(ser.bb.lo,'#A6B8D7',1.3);line(ser.ma5,'#C6C1D9',1.15);line(ser.ma60,'#8E97B8',1.1);

   if(smc&&showStructure){
     const zone=(z,fill,stroke,label,startOverride)=>{if(!z||!Number.isFinite(z.low)||!Number.isFinite(z.high))return;const zi=Math.max(i0,startOverride??z.startIndex??z.i??i0),zx=Math.max(x0,X(zi)-step/2),y1=Y(z.high),y2=Y(z.low);ctx.fillStyle=fill;ctx.fillRect(zx,Math.min(y1,y2),Math.max(0,x1-zx),Math.max(1,Math.abs(y2-y1)));ctx.strokeStyle=stroke;ctx.setLineDash([3,3]);ctx.strokeRect(zx,Math.min(y1,y2),Math.max(0,x1-zx),Math.max(1,Math.abs(y2-y1)));ctx.setLineDash([]);ctx.fillStyle=stroke;ctx.font='15px sans-serif';ctx.fillText(label,zx+4,Math.min(y1,y2)+11);};
     zone(smc.orderBlocks?.bull,'#F3A1B51A','#F3A1B5CC','Bull OB / Demand');
     zone(smc.orderBlocks?.bear,'#95D1B416','#95D1B4CC','Bear OB / Supply');
     zone(smc.fvg?.bull,'#F3A1B510','#F3A1B5AA','Bull FVG');
     zone(smc.fvg?.bear,'#95D1B410','#95D1B4AA','Bear FVG');
     const hline=(v,col,dash,label,side='right',width=1)=>{if(!Number.isFinite(v))return;const y=Y(v);ctx.strokeStyle=col;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=col;ctx.font='15px sans-serif';const tx=side==='left'?x0+4:Math.max(x0+3,x1-104);ctx.fillText(label+' '+fmt(v),tx,y-4);};
     const su=smc.snr?.support||[],re=smc.snr?.resistance||[];
     hline(su[0]?.price,'#F3A1B5',[6,4],'S1','right',1.25);hline(su[1]?.price,'#F3A1B588',[2,4],'S2','right');
     hline(re[0]?.price,'#95D1B4',[6,4],'R1','right',1.25);hline(re[1]?.price,'#95D1B488',[2,4],'R2','right');
     hline(smc.liquidity?.pools?.bsl?.price,'#A6B8D7',[2,3],'BSL','left',1.1);hline(smc.liquidity?.pools?.ssl?.price,'#A6B8D7',[2,3],'SSL','left',1.1);
     hline(smc.range?.eq,'#C6C1D9',[2,4],'EQ','right');
     const db=a.dailyBias||{};hline(db.pdh,'#C6C1D9',[7,4],'PDH','left',1.35);hline(db.pdl,'#C6C1D9',[7,4],'PDL','left',1.35);hline(db.c1?.high,'#A6B8D7',[2,5],'C1H','right',.9);hline(db.c1?.low,'#A6B8D7',[2,5],'C1L','right',.9);
     const markEvent=e=>{if(!e||!Number.isInteger(e.i)||!Number.isFinite(e.level)||e.i<i0)return;const xa=X(Math.max(i0,e.pivotIndex??e.i)),xb=X(e.i),y=Y(e.level),bull=e.direction==='up',col=bull?'#F3A1B5':'#95D1B4';ctx.strokeStyle=col;ctx.lineWidth=1.4;ctx.setLineDash(e.kind==='CHoCH'?[3,2]:[7,3]);ctx.beginPath();ctx.moveTo(xa,y);ctx.lineTo(xb,y);ctx.stroke();ctx.setLineDash([]);const label=`${e.kind||'Break'}${bull?'↑':'↓'}`;ctx.font='600 12px sans-serif';const tw=ctx.measureText(label).width+8,by=Math.max(price0+2,Math.min(price1-16,y+(bull?-18:5)));ctx.fillStyle=bull?'#5B4B8A':'#4B4263';ctx.fillRect(Math.min(x1-tw,xb+3),by,tw,14);ctx.fillStyle=col;ctx.fillText(label,Math.min(x1-tw+4,xb+7),by+11);};
     for(const e of smc.structure?.events||[])markEvent(e);
     const markSweep=e=>{if(!e||!Number.isInteger(e.i)||e.i<i0||!Number.isFinite(e.level))return;const x=X(e.i),y=Y(e.level),isHigh=e.side==='high',col=isHigh?'#C6C1D9':'#A6B8D7',label=isHigh?'BSL Sweep':'SSL Sweep';ctx.fillStyle=col;ctx.font='14px sans-serif';ctx.fillText(label,Math.min(x1-58,x+3),Math.max(price0+10,Math.min(price1-4,y+(isHigh?-7:13))));};
     for(const e of smc.liquidity?.sweeps||[])markSweep(e);
   }

   const up=getComputedStyle(document.documentElement).getPropertyValue('--up').trim(),dn=getComputedStyle(document.documentElement).getPropertyValue('--down').trim();
   for(let i=i0;i<n;i++){const col=s.cl[i]>=s.o[i]?up:dn,x=X(i);ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(x,Y(s.h[i]));ctx.lineTo(x,Y(s.l[i]));ctx.stroke();const ya=Y(Math.max(s.o[i],s.cl[i])),yb=Y(Math.min(s.o[i],s.cl[i]));ctx.fillRect(x-bwid/2,ya,bwid,Math.max(1,yb-ya));ctx.globalAlpha=.55;ctx.fillRect(x-bwid/2,V(s.v[i]),bwid,vol1-V(s.v[i]));ctx.globalAlpha=1;}
   if(smc&&showStructure){
     for(const e of smc.structure?.events||[]){if(!Number.isInteger(e.i)||e.i<i0||!Number.isFinite(e.level))continue;const bull=e.direction==='up',col=bull?'#F3A1B5':'#95D1B4',label=`${e.kind||'BOS'}${bull?'↑':'↓'}`,x=X(e.i),y=Y(e.level);ctx.font='600 12px sans-serif';const tw=ctx.measureText(label).width+8,tx=Math.min(x1-tw,x+3),ty=Math.max(price0+2,Math.min(price1-16,y+(bull?-18:5)));ctx.fillStyle=bull?'#5B4B8A':'#4B4263';ctx.fillRect(tx,ty,tw,14);ctx.fillStyle=col;ctx.fillText(label,tx+4,ty+11);}
     for(const e of smc.liquidity?.sweeps||[]){if(!Number.isInteger(e.i)||e.i<i0||!Number.isFinite(e.level))continue;const isHigh=e.side==='high',col=isHigh?'#C6C1D9':'#A6B8D7',label=isHigh?'BSL Sweep':'SSL Sweep',x=X(e.i),y=Y(e.level);ctx.fillStyle=col;ctx.font='14px sans-serif';ctx.fillText(label,Math.min(x1-58,x+3),Math.max(price0+10,Math.min(price1-4,y+(isHigh?-7:13))));}
   }
   line(ser.vma5,'#C6C1D9',1.2,V);line(ser.vma20,'#A6B8D7',1.2,V);
   const zero=M(0);ctx.strokeStyle='#8E97B8';ctx.beginPath();ctx.moveTo(x0,zero);ctx.lineTo(x1,zero);ctx.stroke();
   for(let i=i0;i<n;i++){const z=ser.macd.hist[i];if(!Number.isFinite(z))continue;const y=M(z);ctx.fillStyle=z>=0?up:dn;ctx.globalAlpha=.65;ctx.fillRect(X(i)-bwid/2,Math.min(y,zero),bwid,Math.max(1,Math.abs(zero-y)));ctx.globalAlpha=1;}
   line(ser.macd.dif,'#A6B8D7',1.3,M);line(ser.macd.dea,'#C6C1D9',1.3,M);ctx.setLineDash([4,4]);ctx.strokeStyle='#8E97B888';for(const lv of [30,70]){ctx.beginPath();ctx.moveTo(x0,R(lv));ctx.lineTo(x1,R(lv));ctx.stroke();}ctx.setLineDash([]);line(ser.rsi,'#C6C1D9',1.4,R);
   ctx.fillStyle='#C6C1D9';ctx.fillText('量＋均量5/20',x0+2,vol0+8);ctx.fillText('MACD 12/26/9',x0+2,mac0+8);ctx.fillText('RSI14',x0+2,rsi0+8);
   let hi=hover==null?n-1:Math.max(i0,Math.min(n-1,hover));const xx=X(hi);if(hover!=null){ctx.strokeStyle='#C6C1D977';ctx.beginPath();ctx.moveTo(xx,price0);ctx.lineTo(xx,rsi1);ctx.stroke();}
   const ch=hi?((s.cl[hi]/s.cl[hi-1]-1)*100):0;document.getElementById('ssaHover').innerHTML=`<b>${htmlEsc(s.d[hi])}</b>　開 ${fmt(s.o[hi])}　高 ${fmt(s.h[hi])}　低 ${fmt(s.l[hi])}　收 <b style="color:${ch>=0?'var(--up)':'var(--down)'}">${fmt(s.cl[hi])} (${ch>=0?'+':''}${fmt(ch)}%)</b>　量 ${Number(s.v[hi]).toLocaleString()}張　上/中/下 ${fmt(ser.bb.up[hi])}/${fmt(ser.bb.mid[hi])}/${fmt(ser.bb.lo[hi])}　RSI ${fmt(ser.rsi[hi],1)}　K/D ${fmt(ser.kd.K[hi],1)}/${fmt(ser.kd.D[hi],1)}　SMC ${htmlEsc(smc?.signal?.label||'等待')}`;
 }
 function mouseIndex(e){if(!current)return null;const rect=cv.getBoundingClientRect(),w=rect.width,n=current.cl.length,m=Math.min(n,w<700?70:160),i0=n-m,x=e.clientX-rect.left,x0=w<700?18:56,x1=w-58;if(x<x0||x>x1)return null;return Math.max(i0,Math.min(n-1,i0+Math.floor((x-x0)/((x1-x0)/m))));}
 let drawFrame=0;cv.addEventListener('mousemove',e=>{const next=mouseIndex(e);if(next===hover)return;hover=next;if(!drawFrame)drawFrame=requestAnimationFrame(()=>{drawFrame=0;draw();});});cv.addEventListener('mouseleave',()=>{hover=null;draw();});window.addEventListener('resize',()=>{if(current)draw();});
 let singleBusy=false;
 async function run(query=qEl.value){
   query=String(query||'').trim();
   if(!query){msg.textContent='請輸入股票名稱或代號。';return;}
   if(singleBusy){msg.textContent='上一筆個股資料仍在取得中，請稍候。';return;}
   singleBusy=true;
   const go=document.getElementById('ssaGo');if(go)go.disabled=true;
   msg.textContent='正在取得 '+query+' 的最近交易日日K／盤中資料…遇週末或休市日會自動回退最近交易日。';matches.innerHTML='';
   try{
     const r=await fetchSingle(query);
     if(r.matches&&r.matches.length){renderMatches(r.matches);msg.textContent='找到多個相近股票，請選一檔：';return;}
     const s=r.stock;if(!s)throw Error(r.error||'查無股票');
     s._ssaStale=Boolean(r.stale_fallback);s._ssaProvisional=Boolean(r.provisional);current=s;historicalAnalyses.clear();analysis=SingleStockCore.analyze(s);body.style.display='block';
     msg.textContent=`${s.c} ${s.n||''}｜資料日 ${r.latest_trade_date||s.d.at(-1)}｜${r.source||s.live_source||'日K'}${r.refreshed_at?'｜來源取得時間 '+r.refreshed_at:''}${r.stale_fallback?'｜⚠ 舊快取備援':''}`;
     renderAnalysis(s,analysis,r.source);hover=null;draw();store.set('bb_single_query',`${s.c}.${s.m}`);
   }catch(e){body.style.display='none';msg.textContent='分析失敗：'+(e?.message||String(e));}
   finally{singleBusy=false;if(go)go.disabled=false;}
 }
 document.getElementById('ssaGo').onclick=()=>run();qEl.addEventListener('keydown',e=>{if(e.key==='Enter')run();});document.getElementById('ssaCurrent').onclick=()=>{if(!selCode){msg.textContent='主圖目前沒有選取股票。';return;}qEl.value=selCode;run(selCode);};
 const setPosterMode=mode=>{posterMode=mode==='compact'?'compact':'standard';if(posterStandard)posterStandard.classList.toggle('active',posterMode==='standard');if(posterCompact)posterCompact.classList.toggle('active',posterMode==='compact');if(current&&analysis){let rule=null;try{rule=SelectionRules.classify(current,SP,{})}catch(e){}renderPoster(current,analysis,rule,posterMode);}};
 if(posterStandard)posterStandard.onclick=()=>setPosterMode('standard');
 if(posterCompact)posterCompact.onclick=()=>setPosterMode('compact');
 const posterRefreshBtn=document.getElementById('ssaPosterRefresh');
 if(posterRefreshBtn)posterRefreshBtn.onclick=()=>{if(!current||!analysis){msg.textContent='請先完成個股分析，再更新圖卡。';return;}let rule=null;try{rule=SelectionRules.classify(current,SP,{})}catch(e){}renderPoster(current,analysis,rule,posterMode);msg.textContent=`${current.c} ${current.n||''}｜已重新產生交易計畫圖卡。`;};


 const pngButton=document.getElementById('ssaPosterPng');
 if(pngButton)pngButton.onclick=async()=>{
  if(!current||!analysis||!posterImg?.src){msg.textContent='請先完成個股分析，再下載圖卡。';return;}
  const snapshot={src:posterImg.src,code:current.c,date:current.d.at(-1),mode:posterMode};
  pngButton.disabled=true;pngButton.textContent='準備 PNG…';
  try{
   await document.fonts.ready;
   const image=new Image();image.src=snapshot.src;await image.decode();
   const scale=1.5,canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#302943';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;if(!blob)throw Error('圖片轉換失敗');
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${snapshot.code}_個股研究_${snapshot.date}_${snapshot.mode}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
   msg.textContent=`${snapshot.code}｜已下載 PNG 圖卡（資料日 ${snapshot.date}）。`;
  }catch(e){msg.textContent='PNG 下載失敗：'+e.message;}
  finally{pngButton.disabled=false;pngButton.textContent='下載 PNG';}
 };

 function mergeSingleLiveQuote(stock,q){
   if(!stock||!q||!q.d||q.d>taipeiClock().today||(stock.d?.length&&q.d<stock.d.at(-1)))return stock;
   const out={...stock,d:[...(stock.d||[])],o:[...(stock.o||[])],h:[...(stock.h||[])],l:[...(stock.l||[])],cl:[...(stock.cl||[])],v:[...(stock.v||[])]};
   const vals=[Number(q.o),Number(q.h),Number(q.l),Number(q.cl),Number(q.v||0)];
   if(vals.slice(0,4).some(x=>!Number.isFinite(x)||x<=0))return stock;
   const [o,h,l,c,v]=vals,row=[o,Math.max(h,o,c),Math.min(l,o,c),c,Math.max(0,v)];
   const n=out.d.length;
   if(n&&out.d[n-1]===q.d){const i=n-1;out.o[i]=row[0];out.h[i]=row[1];out.l[i]=row[2];out.cl[i]=row[3];out.v[i]=row[4];}
   else if(!n||q.d>out.d[n-1]){out.d.push(q.d);out.o.push(row[0]);out.h.push(row[1]);out.l.push(row[2]);out.cl.push(row[3]);out.v.push(row[4]);}
   out.live_source=q.source||'盤中快照';out.live_time=q.time||'';out._ssaProvisional=quality?.calendar?.session==='intraday'||quality?.calendar?.session==='closing';return out;
 }
 window.addEventListener('bb:live-patch',e=>{
   if(!current)return;
   const p=e?.detail;if(!p||!Array.isArray(p.quotes))return;
   const q=p.quotes.find(x=>String(x.c)===String(current.c)&&String(x.m)===String(current.m));
   if(!q)return;
   try{
     current=mergeSingleLiveQuote(current,q);
     analysis=SingleStockCore.analyze(current);
     historicalAnalyses.clear();renderAnalysis(current,analysis,`${q.source||'盤中行情'}｜分批行情更新`);hover=null;draw();
     msg.textContent=`${current.c} ${current.n||''}｜資料日 ${current.d.at(-1)}｜盤中自動更新 ${q.time||''}｜全市場分批輪詢`;
   }catch(_e){}
 });

  const oldRecompute=recompute;recompute=function(){const out=oldRecompute.apply(this,arguments);if(current){const fresh=RAW.find(x=>x.c===current.c&&x.m===current.m);if(fresh){current={...fresh,_ssaStale:Boolean(quality.offline||fresh.cached_fallback||(quality.expected_trade_date&&fresh.d.at(-1)<quality.expected_trade_date)),_ssaProvisional:fresh.d.at(-1)===taipeiClock().today&&['intraday','closing'].includes(quality.calendar?.session)};historicalAnalyses.clear();try{analysis=SingleStockCore.analyze(current);renderAnalysis(current,analysis,current.live_source||'目前全市場快取');draw();}catch(e){}}}return out;};
 const last=store.get('bb_single_query','');if(last)qEl.value=last;
})();
