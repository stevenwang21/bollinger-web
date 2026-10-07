(()=>{
 const btn=document.createElement('button');btn.className='btn';btn.textContent='紀錄與回測';document.querySelector('header').append(btn);
 const panel=document.createElement('dialog');panel.style.cssText='width:min(1000px,90vw);max-height:85vh;overflow:auto;background:#40375B;color:#C6C1D9;border:1px solid #8E97B8;padding:24px';
 panel.innerHTML=`<button id="researchClose" class="btn" style="float:right">關閉</button><h2>訊號紀錄與事件回測</h2>
 <p>本機自動保存每個下載版本＋模式＋規則的資料與分組（最多30份）；請匯出保存重要紀錄。不同設定會另存。</p>
 <div id="archiveStatus"></div><select id="archiveList"></select> <button id="archiveExport" class="btn">匯出選定紀錄</button>
 <hr><p>R9 將「畫面資料」與「回測資料」分離。畫面只保留約1年K棒；可另準備約5年／最多1250根日K做事件研究，避免只有最近約30個可產生訊號的交易日。</p>
 <button id="researchPrepare" class="btn">準備／更新約5年回測資料</button><span id="researchLongStatus" style="margin-left:8px"></span>
 <p>也可匯入本工具匯出的JSON快照（含多年OHLCV）。回測會排除今日尚未完成日K與更新失敗快取。</p>
 <input id="researchImport" type="file" accept=".json"><div id="researchSource">目前工具資料</div>
 <p><label>事件 <select id="researchKind"><option value="break">原始突破</option><option value="buy">A組＋上漲＋突破前日高點（每訊號首次）</option></select></label></p>
 <label>持有K棒 <select id="researchHold"><option>1</option><option>3</option><option selected>5</option><option>10</option><option>20</option></select></label>
 <label>來回成本% <input id="researchCost" type="number" value="0.5" min="0" max="10" step="0.01"></label>
 <label>單邊滑價% <input id="researchSlip" type="number" value="0.1" min="0" max="10" step="0.01"></label>
 <p>成本0.5%、滑價0.1%是可修改的測試假設，不是券商報價或法定稅率。</p>
 <label><input id="researchStop" type="checkbox">採前一日中軌／突破低點較高者防守，跳空用開盤價</label>
 <p><label>訊號起日 <input id="researchFrom" type="date"></label> <label>迄日 <input id="researchTo" type="date"></label> <label>保留期起日 <input id="researchSplit" type="date"></label></p>
 <p>訊號次根開盤進場；未滿持有期另列未完成。進場開盤已失守則略過。保留期僅分段統計，反覆查看或調參後不再是未見資料。</p>
 <button id="researchRun" class="btn primary">執行回測</button> <button id="researchCancel" class="btn">取消</button> <button id="researchExport" class="btn" disabled>匯出完整結果JSON</button>
 <div id="researchResult" style="margin-top:16px;white-space:pre-wrap"></div>
 <p>這是逐事件研究，允許重疊交易，未模擬組合資金、停牌／漲跌停成交限制、除權息與下市偏誤。已增加中位數、平均盈虧、Profit Factor、MFE／MAE及依研究品質分分層統計；平均報酬仍不是帳戶績效，本版不宣稱已證明獲利。</p>`;
 document.body.append(panel);panel.querySelectorAll('input:not([type=checkbox]):not([type=file]),select').forEach(el=>{el.style.cssText='background:#40375B;color:#F7F5FB;border:1px solid #C6C1D9;padding:5px;max-width:100%;color-scheme:light';});btn.onclick=()=>{panel.showModal();list();longStatus();};$('researchClose').onclick=()=>panel.close();
 let dbPromise,archiving=false,lastKey='',imported=null,result=null,worker=null,longData=null,longPoll=null;
 async function longStatus(){try{const s=await requestJSON('/api/research_status');$('researchLongStatus').textContent=s.available?`已備妥 ${s.stock_count} 檔・${s.updated||''}`:(s.state==='running'?`${s.msg} ${s.done}/${s.total}`:s.msg||'尚未準備');if(s.state==='running'){clearTimeout(longPoll);longPoll=setTimeout(longStatus,1200);}return s;}catch(e){$('researchLongStatus').textContent='長期資料狀態讀取失敗：'+e.message;return null;}}
 $('researchPrepare').onclick=async()=>{try{$('researchPrepare').disabled=true;await requestJSON('/api/research_refresh',{method:'POST'});await longStatus();}catch(e){$('researchLongStatus').textContent='啟動失敗：'+e.message;}finally{$('researchPrepare').disabled=false;}};
 const db=()=>dbPromise??=new Promise((resolve,reject)=>{const q=indexedDB.open('bollinger-research',1);q.onupgradeneeded=()=>q.result.createObjectStore('snapshots',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 async function all(){const d=await db();return new Promise((resolve,reject)=>{const q=d.transaction('snapshots').objectStore('snapshots').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
 async function list(){try{const a=await all();$('archiveList').replaceChildren(...a.reverse().map(s=>new Option(`${s.savedAt}｜行情 ${s.updated}｜${s.mode}`,s.id)));}catch(e){$('archiveStatus').textContent='紀錄讀取失敗：'+e.message;}}
 async function save(){
  if(archiving||!RAW.length||!revision||asOf||screenMode!=='strategy')return;
  const key=JSON.stringify([revision,timingMode,SP,maxAge,SelectionRules.version]);if(key===lastKey)return;
  archiving=true;
  try{const d=await db(),existing=await all();
   const snapshot={format:'bollinger-research',id:key,savedAt:new Date().toISOString(),updated,revision,mode:timingMode,rules:{...SP},maxAge,version:SelectionRules.version,quality,stocks:RAW,signals:ROWS.map(r=>({code:r.code,rule:r.rule,explanation:SelectionRules.explain(r.s,r.rule,SP)}))};
   await new Promise((resolve,reject)=>{const tx=d.transaction('snapshots','readwrite'),s=tx.objectStore('snapshots');s.put(snapshot);for(const old of existing.filter(x=>x.id!==key).sort((a,b)=>a.savedAt.localeCompare(b.savedAt)).slice(0,Math.max(0,existing.length-(existing.some(x=>x.id===key)?1:0)-29)))s.delete(old.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存中止'));});
   lastKey=key;$('archiveStatus').textContent='已保存：'+snapshot.savedAt;await list();
  }catch(e){$('archiveStatus').textContent='紀錄保存失敗（可能空間不足），請匯出CSV備份：'+e.message;}finally{archiving=false;}
 }
 const old=recompute;recompute=function(){old();save();};save();
 function download(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 $('archiveExport').onclick=async()=>{const a=(await all()).find(x=>x.id===$('archiveList').value);if(a)download(a,'布林訊號紀錄.json');};
 $('researchImport').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>100000000)throw Error('檔案上限100MB');const d=JSON.parse(await f.text());if(!Array.isArray(d.stocks)||d.stocks.length>10000)throw Error('缺少有效stocks陣列');imported=d;$('researchSource').textContent='匯入：'+f.name+'；使用目前介面規則，非自動套用檔內規則';}catch(e){imported=null;$('researchSource').textContent='匯入失敗：'+e.message;}};
 function stop(){if(worker)worker.terminate();worker=null;$('researchRun').disabled=false;}
 $('researchCancel').onclick=()=>{stop();$('researchResult').textContent='已取消';};
 $('researchRun').onclick=async()=>{
  stop();result=null;$('researchExport').disabled=true;
  let source=imported?.stocks||null,sourceLabel=imported?'匯入多年資料':'';
  if(!source){
   try{const j=await requestJSON('/api/research_data');source=j.stocks||[];sourceLabel=`R9長期回測資料 ${j.updated||''}・目標${j.bars_target||1250}根`;}catch(e){source=RAW;sourceLabel='目前畫面快取（期間較短；建議先按「準備約5年回測資料」）';}
  }
  $('researchSource').textContent=sourceLabel;
  const today=taipeiClock().today,completed=quality.calendar?.expected_completed_date||quality.expected_weekday||today;
  const stocks=source.map(s=>{const x={...s};if(Array.isArray(s.d)){
   const fetched=Date.parse(s.history_fetched_at||s.fetched_at||'');
   const sameDayFinal=Number.isFinite(fetched)&&fetched>=Date.parse(today+'T13:35:00+08:00');
   const n=s.d.filter(d=>d<=completed&&d<=today&&(d!==today||sameDayFinal)).length;
   for(const k of ['d','o','h','l','cl','v'])if(Array.isArray(s[k]))x[k]=s[k].slice(0,n);
  }return x;});
  const options={kind:$('researchKind').value,hold:Number($('researchHold').value),cost:Number($('researchCost').value),slip:Number($('researchSlip').value),stop:$('researchStop').checked,from:$('researchFrom').value,to:$('researchTo').value,split:$('researchSplit').value,rules:{...SP}};
  if($('researchCost').value===''||$('researchSlip').value===''||options.from&&options.to&&options.from>options.to){$('researchResult').textContent='請填寫成本與滑價，並確認日期順序';return;}
  $('researchRun').disabled=true;$('researchResult').textContent='計算中，可取消；選股介面不會被鎖住…';
  worker=new Worker('/backtest.js');worker.onerror=e=>{stop();$('researchResult').textContent='回測失敗：'+e.message;};
  worker.onmessage=e=>{stop();if(e.data.error){$('researchResult').textContent='回測失敗：'+e.data.error;return;}result=e.data.result;result.source={updated:imported?.updated||updated,cutoffInclusive:completed,stockCount:stocks.length,sourceLabel};
   const c=result.counts,fmt=s=>`完成 ${s.n} 筆｜平均 ${s.mean?.toFixed(2)??'—'}%｜中位數 ${s.median?.toFixed(2)??'—'}%｜勝率 ${s.win?.toFixed(1)??'—'}%｜最佳 ${s.best?.toFixed(2)??'—'}%｜最差 ${s.worst?.toFixed(2)??'—'}%｜平均獲利 ${s.avgWin?.toFixed(2)??'—'}%｜平均虧損 ${s.avgLoss?.toFixed(2)??'—'}%｜Profit Factor ${Number.isFinite(s.profitFactor)?s.profitFactor.toFixed(2):s.profitFactor===Infinity?'∞':'—'}｜平均MFE ${s.avgMFE?.toFixed(2)??'—'}%｜平均MAE ${s.avgMAE?.toFixed(2)??'—'}%｜MFE/MAE 含退出日完整高低；停損當日價格先後未知`;
   $('researchResult').textContent=`資料：${sourceLabel}
訊號 ${c.signals}｜期末未完成 ${c.incomplete}｜開盤失守略過 ${c.skipped}｜無效／快取股票 ${c.invalid}
全部：${fmt(result.summary)}
研究期：${fmt(result.research)}
保留期：${fmt(result.holdout)}

依研究品質分：
80分以上：${fmt(result.byScore.high)}
65–79分：${fmt(result.byScore.mid)}
65分以下：${fmt(result.byScore.low)}

MFE=持有期間最大有利幅度；MAE=最大不利幅度。樣本少或期間短不足以證明有效；事件可重疊，未作市場基準比較。`;$('researchExport').disabled=false;
  };worker.postMessage({stocks,options});
 };
 $('researchExport').onclick=()=>{if(result)download(result,'布林事件回測.json');};
})();
