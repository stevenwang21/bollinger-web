/* Data-driven SVG report. No generated price curves or statistical probabilities. */
(()=>{
 'use strict';
 const C={paper:'#302943',white:'#5B4B8A',ink:'#F7F5FB',muted:'#C6C1D9',line:'#8E97B8',teal:'#A6B8D7',soft:'#40375B',red:'#F3A1B5',green:'#95D1B4',gold:'#C6C1D9',sage:'#4B4263',blue:'#8E97B8',rose:'#5B4B8A'};
 const font='"Segoe UI","Microsoft JhengHei","PingFang TC",sans-serif';
 const measure=document.createElement('canvas').getContext('2d');
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clean=x=>String(x??'').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/\s+/g,' ').trim();
 const number=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
 const fmt=(x,d=2)=>{if(number(x)===null)return '—';const [whole,decimal]=Number(x).toFixed(d).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal===undefined?'':'.'+decimal);};
 function width(text,size,weight=400){measure.font=`${weight} ${size}px ${font}`;return measure.measureText(String(text)).width;}
 function fit(text,size,maxWidth,min=14,weight=600){while(size>min&&width(text,size,weight)>maxWidth)size--;return size;}
 function wrap(text,size,maxWidth,weight=400){
  const lines=[];let line='';for(const ch of clean(text)||'—'){if(line&&width(line+ch,size,weight)>maxWidth){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);return lines;
 }
 function text(value,x,y,size=20,fill=C.ink,weight=400,extra=''){
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(clean(value))}</text>`;
 }
 function lines(values,x,y,size=20,color=C.ink,weight=400,lineHeight=Math.round(size*1.6)){
  return values.map((line,i)=>text(line,x,y+i*lineHeight,size,color,weight)).join('');
 }
 const rect=(x,y,w,h,fill=C.white,r=12,stroke=C.line)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
 const rule=(x1,y,x2)=>`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${C.line}"/>`;
 function dataContext(s,quality){
  const date=s.d?.at(-1)||'—',today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const age=(Date.parse(today+'T00:00:00+08:00')-Date.parse(date+'T00:00:00+08:00'))/86400000;
  const historical=quality?.offline||s.cached_fallback||s._ssaStale||(quality?.expected_weekday&&date<quality.expected_weekday)||age>4||date>today||quality?.calendar?.verified_year===false;
  return{date,historical,label:historical?'歷史快取 · 僅供回看':s.live_source?'盤中快照 · 來源可能延遲':'日 K 資料 · 請核對日期'};
 }
 function chart(s,a,y,compact){
  const x=64,w=1312,h=compact?450:492,plotX=104,plotY=y+94,plotW=904,plotH=compact?232:274;
  const n=s.cl?.length||0,start=Math.max(0,n-(compact?90:120)),count=n-start,bb=a.series?.bb||{};
  const values=[...s.h.slice(start),...s.l.slice(start),...(bb.up||[]).slice(start),...(bb.lo||[]).slice(start)].map(number).filter(v=>v!==null);
  let low=Math.min(...values),high=Math.max(...values);if(!values.length){low=0;high=1;}const pad=(high-low)*.07||1;low-=pad;high+=pad;
  const X=i=>plotX+(i-start+.5)*plotW/Math.max(1,count),Y=v=>plotY+(high-v)/(high-low)*plotH;
  const path=arr=>{let out='',active=false;for(let i=start;i<n;i++){const v=number(arr?.[i]);if(v===null){active=false;continue;}out+=`${active?'L':'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)} `;active=true;}return out;};
  let svg=rect(x,y,w,h,C.sage,22)+text('價格與量能',104,y+41,23,C.ink,600)+text(`日 K / 最近 ${count} 根`,1024,y+41,15,C.muted,400,'text-anchor="end"');
  const chartRight=1080;
  svg+=`<line x1="${chartRight}" y1="${y+24}" x2="${chartRight}" y2="${y+h-24}" stroke="${C.line}"/>`;
  for(let k=0;k<5;k++){const v=high-(high-low)*k/4,yy=Y(v);svg+=rule(plotX,yy,plotX+plotW)+text(fmt(v,high>500?0:1),1024,yy+5,13,C.muted);}
  const upper=[],lower=[];for(let i=start;i<n;i++){if(number(bb.up?.[i])!==null&&number(bb.lo?.[i])!==null){upper.push(`${X(i)},${Y(bb.up[i])}`);lower.push(`${X(i)},${Y(bb.lo[i])}`);}}
  svg+=`<defs><clipPath id="priceClip"><rect x="${plotX-8}" y="${plotY-8}" width="${plotW+16}" height="${plotH+16}"/></clipPath></defs><g clip-path="url(#priceClip)">`;
  if(upper.length>1)svg+=`<path d="M${upper.join(' L')} L${lower.reverse().join(' L')} Z" fill="${C.teal}" opacity=".065"/>`;
  for(const [arr,col,dash] of [[bb.up,C.teal,''],[bb.mid,C.gold,''],[bb.lo,C.teal,'5 5'],[a.series?.ma60,'#8E97B8','4 6']])svg+=`<path d="${path(arr)}" fill="none" stroke="${col}" stroke-width="1.8" stroke-dasharray="${dash}"/>`;
  const candleWidth=Math.max(2,Math.min(6.5,plotW/Math.max(1,count)*.58));
  for(let i=start;i<n;i++){const o=number(s.o[i]),c=number(s.cl[i]),hi=number(s.h[i]),lo=number(s.l[i]);if([o,c,hi,lo].includes(null))continue;const col=c>=o?C.red:C.green;svg+=`<line x1="${X(i)}" y1="${Y(hi)}" x2="${X(i)}" y2="${Y(lo)}" stroke="${col}" stroke-width="1.1"/><rect x="${X(i)-candleWidth/2}" y="${Math.min(Y(o),Y(c))}" width="${candleWidth}" height="${Math.max(1.5,Math.abs(Y(o)-Y(c)))}" fill="${col}" rx=".7"/>`;}
  svg+='</g>';
  const volY=plotY+plotH+18,volH=40,volMax=Math.max(1,...s.v.slice(start).map(v=>Number(v)||0));
  svg+=text('成交量（張）',plotX,volY+12,11,C.muted);
  for(let i=start;i<n;i++){const bar=(Number(s.v[i])||0)/volMax*volH;svg+=`<rect x="${X(i)-candleWidth/2}" y="${volY+volH-bar}" width="${candleWidth}" height="${bar}" fill="${s.cl[i]>=s.o[i]?C.red:C.green}" opacity=".45"/>`;}
  for(let k=0;k<4;k++){const i=start+Math.round((count-1)*k/3);svg+=text(s.d[i],X(i),volY+volH+23,12,C.muted,400,`text-anchor="${k===0?'start':k===3?'end':'middle'}"`);}
  svg+=text('布林上／下軌',plotX,y+h-17,13,C.teal)+text('中軌 MA20',plotX+164,y+h-17,13,C.gold)+text('MA60',plotX+295,y+h-17,13,'#8E97B8')+text('紅漲 / 綠跌',plotX+377,y+h-17,13,C.muted);
  svg+=text('關鍵價格',1112,y+40,19,C.ink,600);
  const levelRows=[['上軌',a.metrics.bbUp,C.teal],['中軌',a.metrics.bbMid,C.gold],['下軌',a.metrics.bbLow,C.teal],['近支撐',a.support?.[0]?.[1],C.green],['近壓力',a.resistance?.[0]?.[1],C.red]];
  levelRows.forEach(([label,value,col],i)=>{const yy=y+93+i*57;svg+=text(label,1112,yy,14,C.muted)+text(fmt(value),1336,yy+1,fit(fmt(value),23,156,14),col,600,'text-anchor="end"')+rule(1112,yy+19,1336);});
  const score=a._reportScore;
  svg+=text('研究分 / 100',1112,y+h-67,13,C.muted)+text(score??'—',1336,y+h-58,33,C.ink,600,'text-anchor="end"')+text('規則分數，非勝率',1112,y+h-28,12,C.muted);
  return{svg,height:h};
 }
 function build({s,a,rule:classification,sop,analyst,mode='standard',quality={},source=''}){
  const compact=mode==='compact',m=a.metrics||{},context=dataContext(s,quality),W=1440;
  const parts=[],score=classification?.score??null,price=fmt(m.price),chg=number(m.chg),up=chg===null||chg>=0;
  const name=clean(s.n||s.c),nameSize=fit(name,54,820,27);
  parts.push(text('BOLLINGER / STOCK RESEARCH',64,63,14,C.teal,600,'letter-spacing="2"'));
  parts.push(text(`資料日 ${context.date}  ·  ${s.m==='TWO'?'上櫃':'上市'} ${s.c}`,1376,63,16,C.muted,400,'text-anchor="end"'));
  parts.push(text(name,64,143,nameSize,C.ink,600)+text(s.c,64,182,20,C.muted,400,'letter-spacing="2"'));
  parts.push(text(price,1376,144,fit(price,54,390,30),C.ink,600,'text-anchor="end"'));
  parts.push(text(chg===null?'漲跌幅 —':`${up?'+':''}${fmt(chg)}%`,1376,183,21,up?C.red:C.green,500,'text-anchor="end"'));
  let y=218;
  const decision=(context.historical?'資料當日條件 / ':'')+clean(sop.final)+` · Daily Bias ${clean(a.dailyBias?.label)||'—'} · 多方執行分 ${sop.framework?.total??'—'}/100`;
  const summary=wrap(context.historical?'以下判讀對應資料當日的技術條件。請更新行情後，再評估目前價格與結構。':sop.oneLine,19,1216);
  const summaryHeight=100+summary.length*29;
  parts.push(rect(64,y,1312,summaryHeight,C.soft,12,C.soft)+text('技術摘要',92,y+29,12,C.teal,600,'letter-spacing="1"')+text(decision,92,y+65,fit(decision,26,1216,18),C.ink,600)+lines(summary,92,y+99,19,C.muted,400,29));
  y+=summaryHeight+24;
  const ch=chart(s,{...a,_reportScore:score},y,compact);parts.push(ch.svg);y+=ch.height+24;
  const metrics=[['Daily Bias',clean(a.dailyBias?.label)||'—'],['多方執行分',`${sop.framework?.total??'—'} / 100`],['布林型態',clean(a.pattern?.label)||'—'],['量比 / 20 日',`${fmt(m.volRatio)} 倍`]];
  metrics.forEach(([label,value],i)=>{const x=64+i*328;parts.push(text(label,x+10,y+18,13,C.muted)+text(value,x+10,y+49,fit(value,21,292,13),C.ink,600));if(i<3)parts.push(`<line x1="${x+309}" y1="${y+4}" x2="${x+309}" y2="${y+53}" stroke="${C.line}"/>`);});
  y+=84;
  parts.push(text('技術位置參考',64,y+25,24,C.ink,600)+text('依既有 SOP 推算，並非已成交價或保證目標',1376,y+23,14,C.muted,400,'text-anchor="end"'));y+=49;
  const planRows=[['觀察回測區',sop.entryTxt,C.teal],['結構失效參考',sop.stopText||fmt(sop.stop),C.green],['上方參考 T1',fmt(sop.t1),C.ink],['上方參考 T2',fmt(sop.t2),C.ink]];
  planRows.forEach(([label,value,color],i)=>{const x=64+i*334;parts.push(rect(x,y,310,112,[C.blue,C.rose,C.sage,C.white][i],20)+text(label,x+22,y+31,14,C.muted)+text(value,x+22,y+79,fit(value,32,266,18),color,600));});
  y+=138;
  const rr=number(sop.rr);
  const assumptions=`區間基準 ${sop.planSource||'SNR / OB / FVG'}  ·  結構失效 ${sop.stop!=null?(sop.stopSource||'結構價')+(sop.stopDerived?'（模型緩衝）':''):'等待新結構'}  ·  ${sop.targetFallback?'壓力資料不足的目標顯示為 —':'上方參考取自技術壓力與流動性位置'}  ·  風險報酬 ${rr!==null&&rr>0?'1 : '+fmt(rr,1):'條件不足'}`;
  const assumptionLines=wrap(assumptions,14,1312);parts.push(lines(assumptionLines,64,y,14,C.muted,400,22));y+=assumptionLines.length*22+20;
  if(!compact){
   const gateCount=Math.max(1,sop.gates.length),gateCol=1312/gateCount,gateTextW=Math.max(130,gateCol-24);
   parts.push(rule(64,y,1376)+text(`${gateCount} 項確認條件`,64,y+43,24,C.ink,600)+text('Daily Bias → SMC / SNR → 布林 → 量價 → RR',1376,y+42,14,C.muted,400,'text-anchor="end"'));y+=66;
   const gateLines=sop.gates.map(g=>wrap(g.text,16,gateTextW)),gateHeight=55+Math.max(...gateLines.map(x=>x.length))*27;
   sop.gates.forEach((g,i)=>{const x=64+i*gateCol,color=g.cls==='good'?C.red:g.cls==='bad'?C.green:C.gold;parts.push(text(`0${i+1} / ${g.title}`,x+4,y+18,12,C.muted)+lines(gateLines[i],x+4,y+52,16,color,500,27));if(i<gateCount-1)parts.push(`<line x1="${x+gateCol-12}" y1="${y+3}" x2="${x+gateCol-12}" y2="${y+gateHeight-10}" stroke="${C.line}"/>`);});
   y+=gateHeight+22;
  }
  const observed=clean((analyst.reasons||[]).join('；')||sop.oneLine),risks=a.cautions?.length?clean(a.cautions.slice(0,compact?2:4).join('；')):'目前資料未偵測到主要技術風險警示，仍需核對即時行情。';
  const summaryLines=wrap(observed,compact?18:19,574),riskLines=wrap(risks,compact?18:19,574),detailHeight=96+Math.max(summaryLines.length,riskLines.length)*(compact?28:31);
  parts.push(rect(64,y,644,detailHeight,C.blue,20)+rect(732,y,644,detailHeight,C.rose,20));
  parts.push(text('趨勢與結構',92,y+39,20,C.ink,600)+lines(summaryLines,92,y+79,compact?18:19,C.muted,400,compact?28:31));
  parts.push(text('風險觀察',760,y+39,20,C.red,600)+lines(riskLines,760,y+79,compact?18:19,C.muted,400,compact?28:31));y+=detailHeight+24;
  if(!compact){
   const checks=[['重新轉強',analyst.verify||sop.oneLine],['等待確認',sop.guard],['結構失效',sop.stopRule|| (sop.stop!=null?`若有效跌破 ${fmt(sop.stop)}，重新評估原有結構假設；技術位置會隨新資料變動。`:'目前沒有近端結構失效價，等待新 Swing / SNR 後再建立風險線。')]];
   parts.push(text('下一步觀察',64,y+28,24,C.ink,600));y+=50;
   checks.forEach(([label,value],i)=>{const ls=wrap(value,18,1090);const height=Math.max(62,ls.length*29+24);parts.push(rule(64,y,1376)+text(`0${i+1}`,70,y+30,13,C.teal,600)+text(label,121,y+31,17,C.ink,600)+lines(ls,264,y+31,18,C.muted,400,29));y+=height;});y+=18;
  }
  parts.push(rule(64,y,1376));y+=33;
  const sourceName=clean(source||s.live_source||'Yahoo Finance 日 K / 本機快取');
  const sourceLines=wrap(`資料狀態：${context.label}。來源：${sourceName}。`,13,1312);
  parts.push(lines(sourceLines,64,y,13,C.muted,400,21));y+=sourceLines.length*21+4;
  const link=`https://tw.stock.yahoo.com/quote/${encodeURIComponent(s.c)}.${s.m==='TWO'?'TWO':'TW'}/technical-analysis`;
  parts.push(`<a href="${esc(link)}">${text('Yahoo 個股技術資料 ↗',64,y,13,C.teal,500)}</a>`);y+=29;
  const fine=wrap('技術研究圖卡。支撐、壓力與 ATR 推算是觀察參考；研究分並非勝率，價格可能突破或失守既有區間。',13,1312);
  parts.push(lines(fine,64,y,13,C.muted,400,21));y+=fine.length*21+17;
  parts.push(text('布林研究室 / v6.9.4 · Starry Sapphire · Daily Bias',64,y,12,C.muted)+text(compact?'COMPACT / RESEARCH NOTE':'FULL / RESEARCH REPORT',1376,y,12,C.muted,400,'text-anchor="end"'));
  const H=Math.ceil(y+44);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">${esc(name)} ${esc(s.c)} 個股研究圖卡</title><desc id="desc">資料日 ${esc(context.date)}，${esc(context.label)}。實際日 K、成交量與技術位置參考。</desc><rect width="${W}" height="${H}" fill="${C.paper}"/><g font-family="${esc(font)}" style="font-variant-numeric:tabular-nums">${parts.join('')}</g></svg>`;
 }
 window.StockReport={build,dataContext};
})();
