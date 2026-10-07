/* Definitions and user-visible provenance; no strategy calls or prices are fabricated. */
(()=>{
 'use strict';
 const guide=document.createElement('details');guide.className='definitionGuide';
 guide.innerHTML=`<summary>讀懂 SMC / SNR · 定義與使用順序</summary><div class="definitionBody"><dl>
 <dt>SNR</dt><dd>Support and Resistance，支撐與壓力。本程式使用左右各 3 根的已確認轉折點聚類；價差容忍值為 max(ATR14 × 0.6, 現價 × 0.6%)，保留 120 根內、距現價 18% 內的區域。S1/S2 在現價下方，R1/R2 在上方。「樣本數」是轉折點數，並非每次觸價的次數。</dd>
 <dt>BOS / CHoCH</dt><dd>BOS 為已知趨勢方向的收盤結構突破；CHoCH 為反向突破的可能轉折提示。初始方向未明時稱為 Break。轉折點須等右側 3 根收完才確認；事件最早從確認後的下一根計算，同一轉折價位只記錄一次突破。盤中當日 K 棒不列為收盤確認事件。</dd>
 <dt>BSL / SSL</dt><dd>分別為結構高點上方／低點下方的潛在流動性位置。Sweep 指影線越過已確認價位、收盤回到原側的價格形態；日 K 無法證明實際委託、機構買賣或誘多意圖。</dd>
 <dt>OB</dt><dd>本程式的簡化 Order Block：已確認結構突破且實體 ≥ 當根 ATR14 × 0.75，回找前 8 根最後一根反向 K。多方區採低點至開盤，空方區採開盤至高點；後續收盤穿越遠端邊界便移除。這是 OHLC 推導的潛在需求／供給區。</dd>
 <dt>FVG</dt><dd>三根 K 的缺口：多方為第 3 根低點 > 第 1 根高點；空方反之。影線穿過遠端邊界代表完全回補，移除該區；進入區域但未完全回補會標示部分回補。日 K 跳空也可能形成 FVG，不代表一定回補。</dd>
 <dt>操作順序</dt><dd>先確認資料日與來源 → 看結構方向 → 等價格到有效區 → 核對 Sweep 後的向上突破 → 評估失效價與實際壓力。回檔候選須先 Sweep、後突破；缺少結構目標時顯示「—」，不補造目標價。Premium / Discount 使用近 60 根高低的相對位置，並非基本面估值。</dd>
 </dl><p class="definitionSources">實作門檻是本程式的模型設定；SMC 並無單一統一規格。定義核對：<a href="https://docs.luxalgo.com/platform/algos/price-action-concepts/market-structures" target="_blank" rel="noopener">結構</a> · <a href="https://docs.luxalgo.com/platform/algos/price-action-concepts/imbalances" target="_blank" rel="noopener">FVG</a> · <a href="https://docs.luxalgo.com/platform/algos/price-action-concepts/order-blocks" target="_blank" rel="noopener">OB</a> · <a href="https://www.tradingview.com/pine-script-docs/concepts/repainting/" target="_blank" rel="noopener">歷史與即時資料差異</a> · <a href="https://www.twse.com.tw/holidaySchedule/holidaySchedule?queryYear=115&response=html" target="_blank" rel="noopener">2026 休市日</a>。所有結果為技術研究條件，需以當日可成交行情核對。</p></div>`;
 document.querySelector('.ssaResearchDisclosure')?.before(guide);
 document.getElementById('ssaQ')?.setAttribute('placeholder','股票代號或名稱 · 2330');
 document.getElementById('ssaGo').textContent='取得資料與分析';
 document.querySelector('header h1 small').textContent='STARRY SAPPHIRE / 6.9.2';
 const sync=()=>{
  if(typeof quality==='undefined')return;
  const header=document.querySelector('.qualitySummary');if(!header)return;
  const date=quality.latest_bar||'—';
  const stale=quality.offline||quality.mock||quality.calendar?.verified_year===false||(quality.expected_weekday&&date<quality.expected_weekday);
  const label=quality.mock?'模擬資料':quality.offline?'歷史快取 · 離線':stale?'行情待更新':quality.calendar?.session==='intraday'?'盤中快照 · 尚未收盤':'日 K 研究資料';
  const badge=header.querySelector('.qualityLabel');if(badge&&badge.textContent!==label)badge.textContent=label;
  const note=header.querySelector('.qualityDateNote');
  const text=quality.calendar?.verified_year===false?'本年度休市日未核對 · 請核對官方交易日曆':stale?`預定最近收盤日 ${quality.expected_weekday||'—'} · 請更新後判讀`:'日期採 Asia/Taipei · 預定休市日已核對';
  if(note&&note!==badge&&note.textContent!==text)note.textContent=text;
 };
 new MutationObserver(sync).observe(document.getElementById('qualityInfo'),{childList:true});
 window.addEventListener('bb:live-patch',sync);setInterval(sync,15000);sync();
})();
