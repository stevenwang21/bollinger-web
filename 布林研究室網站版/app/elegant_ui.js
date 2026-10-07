// Presentation only: keep the existing IDs, listeners, data and calculation paths.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const header=document.querySelector('header'),main=document.querySelector('main'),footer=document.querySelector('footer');
 header.querySelector('h1').innerHTML='<span class="brandMark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7c3-5 6 5 9 0s6 5 9 0M3 12c3-5 6 5 9 0s6 5 9 0M3 17c3-5 6 5 9 0s6 5 9 0"/></svg></span><span>布林研究室 <small>BOLLINGER STUDIO</small></span>';
 const tools=document.createElement('details');tools.className='utilityMenu';tools.innerHTML='<summary class="btn">工具與設定</summary><div class="utilityContent"></div>';
 const utility=tools.lastElementChild;
 [...header.querySelectorAll('a,button')].filter(el=>!['btnRefresh','btnCsv'].includes(el.id)).forEach(el=>utility.append(el));
 header.append(tools);
 const connectionChip=document.createElement('span');connectionChip.id='connectionChip';connectionChip.className='connectionChip';connectionChip.dataset.state='starting';connectionChip.textContent='準備資料';
 const dataInfo=$('dataInfo');dataInfo.before(connectionChip);
 const syncConnectionChip=()=>{const t=(dataInfo.textContent||'').trim();let state='ready',label='資料已連線';if(!t||/準備|載入/.test(t)){state='starting';label='準備資料';}else if(/正在|更新中/.test(t)){state='updating';label='更新中';}else if(/重新連線|無回應|中斷|失敗/.test(t)){state='error';label='連線異常';}if(state==='ready'&&typeof quality!=='undefined'&&quality?.offline){state='cache';label='歷史快取 · 離線';}else if(state==='ready'&&typeof quality!=='undefined'&&quality?.mock){state='cache';label='模擬測試資料';}connectionChip.dataset.state=state;connectionChip.textContent=label;connectionChip.title=t;};
 new MutationObserver(syncConnectionChip).observe(dataInfo,{childList:true,characterData:true,subtree:true});syncConnectionChip();
 utility.prepend(connectionChip,dataInfo);
 document.addEventListener('click',e=>{if(!tools.contains(e.target))tools.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')tools.open=false;});
 const skip=document.createElement('a');skip.className='skipLink';skip.href='#workspaceContent';skip.textContent='跳至工作區';document.body.prepend(skip);
 const nav=document.createElement('nav');nav.className='workspaceNav';nav.setAttribute('aria-label','研究工作區');nav.setAttribute('role','tablist');
 const names=[['screen','選股工作區'],['radar','強勢雷達'],['single','個股研究'],['candidates','研究清單']];
 nav.innerHTML=names.map(([key,name],i)=>`<button type="button" id="viewTab_${key}" role="tab" aria-controls="view_${key}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-view="${key}">${name}</button>`).join('');
 header.querySelector('h1').after(nav);
 const content=document.createElement('div');content.id='workspaceContent';content.tabIndex=-1;
 $('qualityInfo').after(content);
 const createView=(key,title,desc,eyebrow)=>{
  const view=document.createElement('section');view.id='view_'+key;view.className='workspaceView';view.hidden=key!=='screen';view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby','viewTab_'+key);
  if(title)view.innerHTML=`<div class="viewIntro"><div><div class="eyebrow">${eyebrow}</div><h2>${title}</h2><p>${desc}</p></div><div class="introAside"><b>以條件篩選，依結構觀察</b>資料日期與來源隨分析保留</div></div>`;
  content.append(view);return view;
 };
 const screen=createView('screen','選股工作區','先縮小研究範圍，再從價格、量能與結構確認個股。','MARKET / SCREENER');
 const radar=createView('radar','盤中／盤後強勢雷達','盤中掃描 L1～L4 強勢升級；13:35 後自動切換正式收盤雷達與明日續強候選。','LIVE / POST-CLOSE RADAR');
 const single=createView('single','','','');
 const candidates=createView('candidates','優先研究清單','每次更新自動重新選出候選，與選股顯示模式無關；點選股票查看 K 線與入選理由。','RESEARCH / WATCHLIST');
 const source=document.createElement('details');source.className='sourceDetails';source.innerHTML='<summary>行情來源與自動更新設定</summary>';source.append($('marketDataPanel'));
 const strategyMeta=document.createElement('details');strategyMeta.className='strategyMeta';strategyMeta.innerHTML='<summary>篩選規則與資料檢查</summary>';strategyMeta.append($('strategyNotice'));
 screen.append(source,strategyMeta,main);
 const workspaceSettings=document.createElement('div');workspaceSettings.className='workspaceSettings';workspaceSettings.append(source,strategyMeta);screen.querySelector('.viewIntro').append(workspaceSettings);
 document.addEventListener('click',e=>{if(!source.contains(e.target))source.open=false;if(!strategyMeta.contains(e.target))strategyMeta.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){source.open=false;strategyMeta.open=false;}});

 const icon=(paths)=>`<svg class="uiIcon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
 const refreshIcon=icon('<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3"/>');
 $('btnRefresh').innerHTML=refreshIcon+'一鍵更新全市場';
 $('btnCsv').innerHTML=icon('<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>')+'匯出 CSV';
 tools.querySelector('summary').innerHTML=icon('<path d="m10 3 4 0 .8 2.5 2 .9 2.5-.6 2 3.4-1.7 1.9v2.2l1.7 1.9-2 3.4-2.5-.6-2 .9-.8 2.5h-4l-.8-2.5-2-.9-2.5.6-2-3.4L4.9 13v-2.2L3.2 8.9l2-3.4 2.5.6 2-.9Z"/><circle cx="12" cy="12" r="3"/>')+'工具與設定';
 const dataIcon=icon('<ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 4 14 4 14 0V5M5 12c0 4 14 4 14 0"/>');
 source.querySelector('summary').innerHTML=dataIcon+'行情來源與自動更新設定';
 strategyMeta.querySelector('summary').innerHTML=icon('<path d="M3 6h7m4 0h7M3 12h11m4 0h3M3 18h3m4 0h11"/><circle cx="12" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>')+'篩選規則與資料檢查';
 candidates.append($('recommendationPanel'),$('trackingValidationPanel'),$('recommendationChartPanel'));
 if($('strongRadarPanel'))radar.append($('strongRadarPanel'));
 single.append($('singleStockAnalyzer'));
 const views={screen,radar,single,candidates};
 function setView(key,focus=false){
  if(!views[key])return;
  Object.entries(views).forEach(([k,v])=>v.hidden=k!==key);
  nav.querySelectorAll('button').forEach(b=>{const on=b.dataset.view===key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  if(focus)$('viewTab_'+key).focus();
  if(key==='candidates')renderRecommendations();
  // Canvas dimensions are only valid when their panel has become visible.
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }
 nav.querySelectorAll('button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
 nav.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  const buttons=[...nav.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;
  e.preventDefault();e.stopPropagation();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  setView(buttons[next].dataset.view,true);
 });
 // Put low-frequency filter controls behind named disclosures.
 const aside=document.querySelector('aside'),strategy=$('strategyControls');
 const group=$('ruleGroups'),date=$('asOf');
 const config=document.createElement('details');config.className='filterSection';config.innerHTML='<summary>確認模式與追蹤參數</summary>';
 const advanced=document.createElement('div');
 [...strategy.children].forEach(el=>{if(el!==group&&el!==date&&!(el.tagName==='H3'&&el.textContent==='資料日期'))advanced.append(el);});
 config.append(advanced);strategy.append(config);
 // Keep the data-date input ahead of groups and add a short, quiet label.
 strategy.querySelectorAll('h3').forEach(el=>{if(el.textContent==='資料日期')el.remove();});
 const dateControls=document.createElement('div');dateControls.className='dateControls';const label=document.createElement('h3');label.textContent='資料日期（研究清單共用）';dateControls.append(label,date);strategy.before(dateControls);date.setAttribute('aria-label','資料日期');
 const secondLabel=document.createElement('h3');secondLabel.textContent='追蹤分組';group.before(secondLabel);
 const legacyNodes=[...aside.children].filter(el=>el!==aside.firstElementChild);
 const legacy=document.createElement('details');legacy.className='filterSection';legacy.innerHTML='<summary>搜尋、市場與原型態篩選</summary>';legacy.open=true;legacyNodes.forEach(el=>legacy.append(el));aside.append(legacy);
 const filterContent=document.createElement('div');filterContent.className='filterContent';while(aside.firstChild)filterContent.append(aside.firstChild);
 const filterToggle=document.createElement('button');filterToggle.className='filterToggle';filterToggle.type='button';filterToggle.textContent='篩選條件';filterToggle.setAttribute('aria-expanded','false');filterToggle.onclick=()=>{const open=aside.dataset.open!=='true';aside.dataset.open=String(open);filterToggle.setAttribute('aria-expanded',String(open));};
 aside.append(filterToggle,filterContent);
 // The chart stays prominent; verbose explanations remain available on demand.
 const chart=$('chartPane');
 const chartEmpty=document.createElement('div');chartEmpty.className='chartEmpty';chartEmpty.innerHTML='<span class="emptyMark" aria-hidden="true">○</span><b>選擇一檔股票，檢視價格結構。</b><p>點選左側名單即可切換圖表。若目前分組沒有候選，可調整分組或選擇歷史資料日期。</p>';$('canvasWrap').append(chartEmpty);
 const updateChartEmpty=()=>{chartEmpty.hidden=Boolean(typeof curRow!=='undefined'&&curRow);};new MutationObserver(updateChartEmpty).observe($('chartHead'),{childList:true,subtree:true});updateChartEmpty();
 const chartMore=document.createElement('details');chartMore.className='chartDetails';chartMore.innerHTML='<summary>個股條件、操作說明與風險試算</summary>';
 ['dailyExplain','ruleReasons','aiVisualPanel','riskPanel'].forEach(id=>{if($(id))chartMore.append($(id));});chart.append(chartMore);
 const analyzer=$('singleStockAnalyzer'),head=analyzer.querySelector('.ssaHead');
 head.querySelector('b').innerHTML='個股研究 <span>布林型態、量價與 SMC / SNR 結構診斷</span>';
 head.querySelector('.ssaStatus').textContent='輸入上市／上櫃股票名稱或代號，從技術結構、確認條件到研究圖卡，依序檢視。';
 [...head.children].filter(el=>el.tagName==='DIV').forEach(el=>el.remove());
 const search=document.createElement('div');search.className='ssaSearch';search.innerHTML='<label for="ssaQ">個股名稱或代號</label>';
 search.append($('ssaQ'),$('ssaGo'),$('ssaCurrent'));head.append(search);
 const welcome=document.createElement('div');welcome.className='ssaWelcome';welcome.innerHTML='<div><div class="eyebrow">SINGLE STOCK / RESEARCH</div><h3>讓每一筆觀察，有清楚的脈絡。</h3><p>輸入代號或名稱開始研究。分析完成後，可檢視關鍵價格、指標細節，並下載一張包含來源與資料日期的個股圖卡。</p></div><div class="welcomeSteps"><div><b>01</b>確認資料日期與來源</div><div><b>02</b>檢視價格與結構條件</div><div><b>03</b>匯出研究圖卡</div></div>';
 $('ssaMatches').after(welcome);
 const jump=document.createElement('nav');jump.className='singleJump';jump.setAttribute('aria-label','個股研究段落');jump.innerHTML='<a href="#ssaSOP">重點判讀</a><a href="#ssaCv">技術圖表</a><a href="#ssaImagePanel">研究圖卡</a>';analyzer.querySelector('.ssaChartBox>div:first-child').append(jump);
 const breakdown=document.createElement('details');breakdown.className='ssaResearchDisclosure';breakdown.innerHTML='<summary>查看完整指標、SMC / SNR 與研究分拆解</summary>';
 $('ssaAnalysis').before(breakdown);breakdown.append($('ssaAnalysis'));
 const chartHeading=analyzer.querySelector('.ssaChartBox>div:first-child');chartHeading.firstChild.textContent='價格與結構';
 const chartLayers=document.createElement('label');chartLayers.className='chartLayerToggle';chartLayers.innerHTML='<input type="checkbox" id="ssaStructureMarkers"> 結構標記';chartHeading.insertBefore(chartLayers,jump);chartLayers.firstElementChild.addEventListener('change',()=>window.dispatchEvent(new Event('resize')));
 $('ssaImagePanel').querySelector('h4').textContent='個股研究圖卡';$('ssaImagePanel').querySelector('.ssaImageHint').textContent='與本次分析同步，保留資料日期與來源';
 $('ssaPosterStandard').textContent='完整報告';$('ssaPosterCompact').textContent='精簡圖卡';
 const msgObserver=new MutationObserver(()=>{
  const text=$('ssaMsg').textContent,state=text.startsWith('正在')?'loading':text.includes('失敗：')?'error':'ready';$('ssaMsg').dataset.state=state;
  $('ssaMsg').setAttribute('role',state==='error'?'alert':'status');welcome.hidden=$('ssaBody').style.display!=='none';
 });msgObserver.observe($('ssaMsg'),{childList:true,characterData:true,subtree:true});
 $('ssaQ').setAttribute('aria-label','個股名稱或代號');$('q').setAttribute('aria-label','名單搜尋');
 // Label legacy numeric inputs without changing their update handlers.
 aside.querySelectorAll('.row').forEach(row=>{const input=row.querySelector('input[id]'),label=row.querySelector('label');if(input&&label)label.htmlFor=input.id;});
 const style=document.createElement('style');style.textContent='@media(min-width:701px){.filterToggle{display:none}}';document.head.append(style);
 footer.setAttribute('aria-label','資料來源與研究說明');
 // Keep the primary freshness warning short, while preserving all original diagnostics.
 function compactQuality(){
  syncConnectionChip();
  const node=$('qualityInfo');if(node.querySelector('.qualitySummary'))return;
  const original=node.textContent;if(!original||!quality?.latest_bar)return;
  const summary=document.createElement('div');summary.className='qualitySummary';
  const date=quality.latest_bar,status=quality.realtime_active?'盤中快照':quality.offline?'歷史快取 · 離線檢視':'日 K 資料';
  const u=quality.universe||{};summary.innerHTML=`<span class="qualityLabel">${esc(status)}</span><b>資料日 ${esc(date)}</b><span class="qualityUniverse">${u.complete?`日K載入 ${u.covered||0} / ${u.count||0} 檔${u.history_complete?'':'・尚待補齊'}`:`部分歷史快取 ${u.loaded||RAW.length} 檔・全市場清單尚未建立`}</span><span class="qualityDateNote">請依資料日期判讀</span>`;
  const diagnostics=document.createElement('details');diagnostics.innerHTML='<summary>資料檢查詳情</summary>';const text=document.createElement('p');text.textContent=original;diagnostics.append(text);node.replaceChildren(summary,diagnostics);
 }
 new MutationObserver(compactQuality).observe($('qualityInfo'),{childList:true});compactQuality();
 setView('screen');
})();
