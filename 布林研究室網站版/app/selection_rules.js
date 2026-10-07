/* Version 2: Bollinger breakout research rules with MACD + price-volume context.
   Descriptive screening / research tool, not a validated trading system. */
const SelectionRules=(()=>{
 const defaults={period:20,mult:2,look:15,rank:25,expansion:15,breakVolume:1.5,amount:3000,holdVolume:1.5,retention:0.8,maxGain:15,maxDistance:3,tracking:10,midTracking:3,midMinVolume:1.0,midMaxDistance:5,overheatDayGain:7,overheatAboveUpper:2.5,overheatGain5:15,overheatVolume:2,overheatBreakDistance:6,overheatRSI:70,overheatMacdPct:95,overheatTriggerCount:2};
 const indicatorCache=new WeakMap();
 const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
 function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
 function bands(c,N,k){
  return c.map((_,i)=>{
   if(i<N-1)return null;
   const w=c.slice(i-N+1,i+1),mid=avg(w);
   const sd=Math.sqrt(w.reduce((a,b)=>a+(b-mid)**2,0)/N);
   return {mid,up:mid+k*sd,lo:mid-k*sd,bw:mid>0?2*k*sd/mid*100:0};
  });
 }
 function emaSeries(a,n){
  if(!a.length)return [];
  const k=2/(n+1),out=[a[0]];
  for(let i=1;i<a.length;i++)out.push(a[i]*k+out[i-1]*(1-k));
  return out;
 }
 function macdSeries(c){
  const e12=emaSeries(c,12),e26=emaSeries(c,26),dif=c.map((_,i)=>e12[i]-e26[i]),dea=emaSeries(dif,9),hist=dif.map((v,i)=>v-dea[i]);
  return {dif,dea,hist};
 }
 function metrics(s,i,b){
  const priorVol=s.v.slice(i-20,i),v=avg(priorVol);
  const amount=avg(s.cl.slice(i-20,i).map((c,j)=>c*s.v[i-20+j]*1000))/10000;
  return {ratio:v>0?s.v[i]/v:0,amount,
   gain:i>=5?(s.cl[i]/s.cl[i-5]-1)*100:0,distance:b[i]?(s.cl[i]/b[i].up-1)*100:null};
 }
 function priceVolume(s,i,b){
  const m=metrics(s,i,b),prevV=i>0?s.v[i-1]:0,volPrev=prevV>0?s.v[i]/prevV:null;
  const chg=i>0?(s.cl[i]/s.cl[i-1]-1)*100:0,range=s.h[i]-s.l[i],clv=range>0?(s.cl[i]-s.l[i])/range:0.5;
  const upper=range>0?(s.h[i]-Math.max(s.o[i],s.cl[i]))/range:0;
  let obv5=0;for(let j=Math.max(1,i-4);j<=i;j++)obv5+=(s.cl[j]>s.cl[j-1]?1:s.cl[j]<s.cl[j-1]?-1:0)*s.v[j];
  let state='量價中性';
  if(chg>0.5&&volPrev!=null&&volPrev>=1.05)state='價漲量增';
  else if(chg>0.5&&volPrev!=null&&volPrev<=0.95)state='價漲量縮';
  else if(chg<-0.5&&volPrev!=null&&volPrev<=0.95)state='價跌量縮';
  else if(chg<-0.5&&volPrev!=null&&volPrev>=1.05)state='價跌量增';
  const explosiveNoProgress=m.ratio>=3&&Math.abs(chg)<=1.5;
  const heavyUpperShadow=m.ratio>=2&&upper>=0.45;
  const healthyPullback=chg<0&&volPrev!=null&&volPrev<0.9&&b[i]&&s.cl[i]>b[i].mid;
  const reacceleration=i>0&&s.cl[i]>s.h[i-1]&&m.ratio>=1.5;
  let score=0;
  if(state==='價漲量增')score+=5;
  if(m.ratio>=1.5&&m.ratio<=3)score+=4;else if(m.ratio>=1&&m.ratio<1.5)score+=2;else if(m.ratio>3)score+=1;
  if(volPrev!=null&&volPrev>=1.05)score+=3;
  if(clv>=0.7)score+=3;
  if(obv5>0)score+=3;
  if(healthyPullback)score+=3;
  if(reacceleration)score+=4;
  if(state==='價跌量增')score-=5;
  if(explosiveNoProgress)score-=4;
  if(heavyUpperShadow)score-=4;
  const alerts=[];
  if(explosiveNoProgress)alerts.push('爆量但價格推進有限');
  if(heavyUpperShadow)alerts.push('爆量長上影');
  if(state==='價跌量增')alerts.push('價跌量增');
  return {state,change1:chg,volPrev,clv,upperShadow:upper,obv5,explosiveNoProgress,heavyUpperShadow,healthyPullback,reacceleration,score:clamp(score,0,25),rawScore:score,alerts,...m};
 }
 function macdAt(s,i){
  let memo=indicatorCache.get(s.cl);
   const signature=`${s.cl.length}|${s.cl.at(-1)}|${s.cl.at(-2)}`;
   if(!memo||memo.signature!==signature){memo={signature,macd:macdSeries(s.cl)};indicatorCache.set(s.cl,memo);}
   const macd=memo.macd,dif=macd.dif[i],dea=macd.dea[i],hist=macd.hist[i],prevDif=macd.dif[i-1],prevDea=macd.dea[i-1];
  const histUp2=i>=2&&hist>macd.hist[i-1]&&macd.hist[i-1]>macd.hist[i-2];
  const bullCross=i>=1&&dif>dea&&prevDif<=prevDea,deathCross=i>=1&&dif<dea&&prevDif>=prevDea;
  const window=macd.hist.slice(Math.max(0,i-59),i+1),histPct=window.length?window.filter(x=>x<=hist).length/window.length*100:null;
  const priorPrice=s.cl.slice(Math.max(0,i-20),i),priorHist=macd.hist.slice(Math.max(0,i-20),i);
  const priceNewHigh=priorPrice.length?s.cl[i]>=Math.max(...priorPrice):false;
  const histNewHigh=priorHist.length?hist>=Math.max(...priorHist):false;
  const topDivergence=priceNewHigh&&!histNewHigh&&i>0&&hist<macd.hist[i-1];
  let score=0;
  if(dif>dea)score+=4;
  if(hist>0)score+=3;
  if(histUp2)score+=4;
  if(dif>0)score+=3;
  if(histPct!=null&&histPct>=50&&histPct<=90)score+=3;
  if(!topDivergence)score+=3;
  if(histPct!=null&&histPct>=95)score-=4;
  if(topDivergence)score-=5;
  const alerts=[];
  if(histPct!=null&&histPct>=95)alerts.push(`MACD動能位階${histPct.toFixed(0)}%，偏熱`);
  if(topDivergence)alerts.push('價格創20日新高但MACD柱未同步，留意頂背離');
  if(deathCross)alerts.push('MACD死亡交叉');
  const state=deathCross?'死亡交叉':bullCross?'黃金交叉':dif>dea&&histUp2?'多頭加速':dif>dea?'多頭':'偏弱';
  return {dif,dea,hist,histPct,histUp2,bullCross,deathCross,topDivergence,priceNewHigh,histNewHigh,state,score:clamp(score,0,20),rawScore:score,alerts};
 }
 // Independent same-day middle-band category; it can coexist with the original M/A/N groups.
 // Prefix-only calculations preserve historical replay and allow bullish MACD below zero.
 function middleBreakout(s,gate={}){
  const i=(s.cl||[]).length-1,empty={eligible:false,confirmed:false,provisional:!!gate.provisional,date:s.d?.[i]||'',checks:[],reason:'至少需要35根有效日K'};
  if(i<34||s.v?.length!==i+1||s.cl.some(x=>!Number.isFinite(x)||x<=0)||s.v.some(x=>!Number.isFinite(x)||x<0))return empty;
  const mid=avg(s.cl.slice(i-19,i+1)),prevMid=avg(s.cl.slice(i-20,i));
  const obv=[0];for(let j=1;j<=i;j++)obv.push(obv[j-1]+(s.cl[j]>s.cl[j-1]?s.v[j]:s.cl[j]<s.cl[j-1]?-s.v[j]:0));
  const obvMA20=avg(obv.slice(i-19,i+1)),prevObvMA20=avg(obv.slice(i-20,i));
  const macd=macdAt(s,i),crossed=s.cl[i]>mid&&s.cl[i-1]<=prevMid;
  const obvBull=obv[i]>obvMA20&&obv[i]>obv[i-1]&&obvMA20>prevObvMA20;
  const macdBull=macd.dif>macd.dea&&macd.hist>0;
  const checks=[[crossed,'前日收盤≤前日20日中軌，當日收盤>當日20日中軌'],
   [obvBull,'OBV>OBV的20日均線，且OBV與均線皆向上'],[macdBull,'MACD(12,26,9)：DIF>訊號線、柱狀體>0（允許零軸下轉強）']];
  const usable=!gate.reason&&gate.dataStatus!=='Q3',eligible=usable&&crossed&&obvBull&&macdBull;
  return {eligible,confirmed:eligible&&!gate.provisional,provisional:!!gate.provisional,date:s.d[i],i,price:s.cl[i],mid,prevMid,
   obv:obv[i],prevObv:obv[i-1],obvMA20,prevObvMA20,macd,crossed,obvBull,macdBull,checks,reason:usable?'':gate.reason||'資料異常'};
 }
  function rsi14(s,i){
   if(i<14)return null;
   let gain=0,loss=0;
   for(let j=1;j<=14;j++){const d=s.cl[j]-s.cl[j-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
   gain/=14;loss/=14;
   for(let j=15;j<=i;j++){const d=s.cl[j]-s.cl[j-1];gain=(gain*13+Math.max(d,0))/14;loss=(loss*13+Math.max(-d,0))/14;}
   return loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  }
 function overheatSnapshot(s,i,b,p,pv,macd){
  const priorHighs=s.h.slice(Math.max(0,i-20),i),priorHigh=priorHighs.length?Math.max(...priorHighs):null;
  const breakDistance=priorHigh&&priorHigh>0?(s.cl[i]/priorHigh-1)*100:null;
  const rsi=rsi14(s,i),triggers=[];
  if(pv.change1>=p.overheatDayGain)triggers.push(`當日漲幅 ${pv.change1.toFixed(1)}% ≥ ${p.overheatDayGain}%`);
  if(pv.distance!=null&&pv.distance>=p.overheatAboveUpper)triggers.push(`高於布林上軌 ${pv.distance.toFixed(1)}% ≥ ${p.overheatAboveUpper}%`);
  if(pv.gain>=p.overheatGain5)triggers.push(`5日漲幅 ${pv.gain.toFixed(1)}% ≥ ${p.overheatGain5}%`);
  if(pv.ratio>=p.overheatVolume)triggers.push(`20日量比 ${pv.ratio.toFixed(2)} ≥ ${p.overheatVolume}`);
  if(breakDistance!=null&&breakDistance>=p.overheatBreakDistance)triggers.push(`距近20日突破基準 ${breakDistance.toFixed(1)}% ≥ ${p.overheatBreakDistance}%`);
  if(rsi!=null&&rsi>=p.overheatRSI)triggers.push(`RSI14 ${rsi.toFixed(1)} ≥ ${p.overheatRSI}`);
  if(macd.histPct!=null&&macd.histPct>=p.overheatMacdPct)triggers.push(`MACD動能位階 ${macd.histPct.toFixed(0)}% ≥ ${p.overheatMacdPct}%`);
  return {isOverheated:triggers.length>=p.overheatTriggerCount,count:triggers.length,triggers,priorHigh,breakDistance,rsi};
 }
 function atr14(s,i){
  const tr=[];for(let j=Math.max(1,i-13);j<=i;j++)tr.push(Math.max(s.h[j]-s.l[j],Math.abs(s.h[j]-s.cl[j-1]),Math.abs(s.l[j]-s.cl[j-1])));
  return avg(tr);
 }

 // R10.19A Midline Momentum Engine (MME): find earlier MA20/middle-band reclaims that
 // statistically showed better odds of continuing toward the upper band in the bundled
 // event study.  This is a descriptive research score, not a probability forecast.
 function midlineSnapshot(s,i,b,p,gate={}){
  if(i<60||!b[i]||!b[i-1])return null;
  const pv=priceVolume(s,i,b),macd=macdAt(s,i),rsi=rsi14(s,i);
  const close=s.cl[i],mid=b[i].mid,up=b[i].up;
  const crossed=close>mid&&s.cl[i-1]<=b[i-1].mid;
  const crossPct=mid>0?(close/mid-1)*100:null;
  const distUpper=close>0?(up/close-1)*100:null; // positive = room to upper band
  const dayChange=i>0?(close/s.cl[i-1]-1)*100:0;
  const midSlope3=i>=3&&b[i-3]?(mid/b[i-3].mid-1)*100:0;
  const bwDelta=b[i-1]?b[i].bw-b[i-1].bw:0;
  const ma60=avg(s.cl.slice(i-59,i+1));
  const ret20=i>=20?(close/s.cl[i-20]-1)*100:0;
  const histSlope=i>0?macd.hist-macdAt(s,i-1).hist:0;
  const expected=Number(gate.volumeExpectedFraction);
  const paceFactor=gate.provisional&&Number.isFinite(expected)&&expected>0&&expected<=1?expected:1;
  const volumePaceRatio=pv.ratio/paceFactor;
  const volUsed=gate.provisional?volumePaceRatio:pv.ratio;
  let score=0;
  // Position / route to upper band (25)
  if(crossPct>=3)score+=14;else if(crossPct>=2)score+=11;else if(crossPct>=1.5)score+=8;else if(crossPct>=0.5)score+=4;
  if(distUpper>=-0.5&&distUpper<=3)score+=11;else if(distUpper<=5)score+=8;else if(distUpper<=8)score+=4;
  // Volume / candle quality (20)
  if(volUsed>=1&&volUsed<=3)score+=10;else if(volUsed>=0.8)score+=6;
  if(pv.clv>=0.75)score+=6;else if(pv.clv>=0.65)score+=4;
  if(i>0&&close>s.h[i-1])score+=4;
  // Momentum (20)
  if(rsi!=null&&rsi>=55&&rsi<=75)score+=7;else if(rsi!=null&&rsi>=52&&rsi<=78)score+=5;
  if(macd.dif>macd.dea)score+=5;
  if(histSlope>0)score+=4;
  if(macd.histPct!=null&&macd.histPct>=50&&macd.histPct<95)score+=4;
  // Structure (20)
  if(midSlope3>0)score+=5;
  if(bwDelta>=0)score+=4;
  if(ret20>0)score+=4;
  if(close>ma60)score+=3;
  let underDays=0;for(let j=i-1;j>=Math.max(19,i-10);j--){if(b[j]&&s.cl[j]<=b[j].mid)underDays++;else break;}
  if(underDays>=2)score+=4;
  // Risk quality (15)
  let riskScore=15;const riskFlags=[];
  if(pv.gain>15){riskScore-=5;riskFlags.push(`5日漲幅${pv.gain.toFixed(1)}%偏高`);}
  if(rsi!=null&&rsi>78){riskScore-=5;riskFlags.push(`RSI ${rsi.toFixed(1)}過熱`);}
  if(macd.histPct!=null&&macd.histPct>=95){riskScore-=4;riskFlags.push(`MACD熱度${macd.histPct.toFixed(0)}%`);}
  if(pv.heavyUpperShadow){riskScore-=5;riskFlags.push('爆量長上影');}
  if(pv.explosiveNoProgress){riskScore-=5;riskFlags.push('爆量但推進有限');}
  if(dayChange>8){riskScore-=3;riskFlags.push(`單日漲幅${dayChange.toFixed(1)}%偏大`);}
  score+=clamp(riskScore,0,15);
  score=clamp(Math.round(score),0,100);
  let tier='';
  const paceReliable=!gate.provisional||gate.volumePaceReliable!==false;
  // Thresholds were selected on an earlier training window and then checked on a later holdout.
  if(paceReliable&&crossed&&crossPct>=3&&distUpper<=3&&distUpper>=-0.5&&volUsed>=1&&pv.clv>=0.75&&rsi!=null&&rsi>=55)tier='M3';
  else if(paceReliable&&crossed&&crossPct>=2&&distUpper<=3&&distUpper>=-0.5&&volUsed>=1&&pv.clv>=0.65&&rsi!=null&&rsi>=55)tier='M2';
  else if(paceReliable&&crossed&&crossPct>=1.5&&distUpper<=5&&distUpper>=-0.5&&volUsed>=p.midMinVolume&&pv.clv>=0.65&&rsi!=null&&rsi>=52)tier='M1';
  const progress=(up>mid)?clamp((close-mid)/(up-mid)*100,0,140):0;
  return {crossed,tier,score,crossPct,distUpper,dayChange,midSlope3,bwDelta,rsi,volumeRatio:pv.ratio,volumePaceRatio,volumeUsed:volUsed,
   clv:pv.clv,prevHighBreak:i>0&&close>s.h[i-1],macdBull:macd.dif>macd.dea,macdHistSlope:histSlope,macdPct:macd.histPct,
   ret5:pv.gain,ret20,progress,riskScore:clamp(riskScore,0,15),riskFlags,mid,up,low:s.l[i],price:close,date:s.d[i],i,provisional:!!gate.provisional};
 }
 function midlineSignal(s,i,b,p,gate={}){
  const x=midlineSnapshot(s,i,b,p,gate);if(!x||!x.tier)return null;return x;
 }
 function midlineHealth(signal,current,age=0){
  if(!signal||!current)return {state:'unknown',label:'資料不足',score:0,ret:null,progressDelta:null};
  const ret=signal.price>0?(current.price/signal.price-1)*100:0;
  const progressDelta=(Number(current.progress)||0)-(Number(signal.progress)||0);
  if(age<=0)return {state:'signal',label:'訊號初始',score:60,ret,progressDelta};
  // Post-signal continuation rules were checked on a later holdout window.
  // A fade is removed from M rather than remaining in the fast-lane candidate list.
  if(ret<0||progressDelta<-15)return {state:'fade',label:'續攻衰退',score:20,ret,progressDelta};
  if(ret>=1&&progressDelta>=10&&(Number(current.clv)||0)>=0.5)return {state:'accelerating',label:'續攻加速',score:100,ret,progressDelta};
  if(ret>=0&&progressDelta>=0&&(Number(current.clv)||0)>=0.5)return {state:'healthy',label:'續攻健康',score:82,ret,progressDelta};
  if(ret>=0&&progressDelta>=0)return {state:'holding',label:'續攻維持',score:70,ret,progressDelta};
  return {state:'neutral',label:'等待再加速',score:50,ret,progressDelta};
 }
 function findRecentMidline(s,t,b,p,gate={}){
  // Fast path: the expensive momentum snapshot is only evaluated on an actual
  // close-above-middle-band reclaim.  This keeps the full-universe scan quick
  // enough for intraday use while preserving the exact R10.19A thresholds.
  for(let i=t;i>=Math.max(60,t-p.midTracking);i--){
   if(!b[i]||!b[i-1]||!(s.cl[i]>b[i].mid&&s.cl[i-1]<=b[i-1].mid))continue;
   const localGate=(i===t?gate:{}),x=midlineSignal(s,i,b,p,localGate);if(!x)continue;
   // Track only while the reclaim remains structurally intact.
   let failed=false;for(let j=i+1;j<=t;j++)if(!b[j]||s.cl[j]<b[j].mid||s.cl[j]<x.low){failed=true;break;}
   if(!failed)return x;
  }
  return null;
 }
 function trendRisk(s,i,b,p,pv){
  const ma20=avg(s.cl.slice(i-19,i+1)),ma60=avg(s.cl.slice(i-59,i+1));
  const ret20=i>=20?(s.cl[i]/s.cl[i-20]-1)*100:0,ret60=i>=60?(s.cl[i]/s.cl[i-60]-1)*100:0;
  let trend=0;if(s.cl[i]>ma20)trend+=3;if(ma20>ma60)trend+=3;if(s.cl[i]>ma60)trend+=3;if(ret20>0)trend+=3;if(ret60>0)trend+=3;
  const atr=atr14(s,i),atrPct=s.cl[i]>0?atr/s.cl[i]*100:null;
  let risk=0;if(pv.amount>=p.amount)risk+=4;if(atrPct!=null&&atrPct>=1&&atrPct<=8)risk+=2;if(!pv.heavyUpperShadow)risk+=2;if(pv.gain<=p.maxGain)risk+=2;
  return {ma20,ma60,ret20,ret60,trendScore:clamp(trend,0,15),atr,atrPct,riskScore:clamp(risk,0,10)};
 }
 function signal(s,i,b,p){
  if(i<Math.max(139,p.period+119))return null;
  const prior=b.slice(i-p.look,i),history=b.slice(i-120,i);
  if(prior.some(x=>!x)||history.some(x=>!x))return null;
  const min=Math.min(...prior.map(x=>x.bw)),rank=history.filter(x=>x.bw<=min).length/120*100;
  const m=metrics(s,i,b);
  if(rank<=p.rank && s.cl[i]>b[i].up && s.cl[i-1]<=b[i-1].up && b[i].mid>b[i-3].mid &&
    b[i].bw>=min*(1+p.expansion/100) && b[i].bw>b[i-1].bw && m.ratio>=p.breakVolume && m.amount>=p.amount)
   return {i,date:s.d[i],price:s.cl[i],low:s.l[i],volume:s.v[i],rank,min,...m};
  return null;
 }
 function qualitySnapshot(s,i,b,p,f={}){
  const pv=priceVolume(s,i,b),macd=macdAt(s,i),tr=trendRisk(s,i,b,p,pv),overheat=overheatSnapshot(s,i,b,p,pv,macd);
  // R9: reduce double-counting. MACD is a confirmation/risk modifier, not an independent 20-point bucket.
  let breakout=0;
  if(f.signal)breakout+=6;
  if(b[i]&&b[i-3]&&b[i].mid>b[i-3].mid)breakout+=4;
  if(b[i]&&b[i-1]&&b[i].bw>b[i-1].bw)breakout+=3;
  if(b[i]&&s.cl[i]>b[i].up)breakout+=3;
  if(pv.distance!=null&&pv.distance>=-1&&pv.distance<=p.maxDistance)breakout+=2;
  if(f.signal&&f.signal.rank<=p.rank)breakout+=2;
  breakout=clamp(breakout,0,20);

  let volume=0;
  if(pv.state==='價漲量增')volume+=5;
  if(pv.ratio>=1.5&&pv.ratio<=3)volume+=4;else if(pv.ratio>=1&&pv.ratio<1.5)volume+=2;
  if(pv.clv>=0.7)volume+=3;
  if(pv.obv5>0)volume+=3;
  if(pv.healthyPullback)volume+=3;
  if(pv.reacceleration)volume+=4;
  if(pv.state==='價跌量增')volume-=5;
  if(pv.explosiveNoProgress)volume-=4;
  if(pv.heavyUpperShadow)volume-=4;
  volume=clamp(volume,0,20);

  let trend=0;
  if(s.cl[i]>tr.ma20)trend+=5;
  if(tr.ma20>tr.ma60)trend+=5;
  const prior20=i>=24?avg(s.cl.slice(i-24,i-4)):tr.ma20;
  if(tr.ma20>prior20)trend+=5;
  if(tr.ret20>0)trend+=5;
  if(tr.ret60>0)trend+=5;
  trend=clamp(trend,0,25);

  let position=20;
  if(pv.gain>25)position-=14;else if(pv.gain>p.maxGain)position-=8;
  if(pv.distance!=null&&pv.distance>5)position-=10;else if(pv.distance!=null&&pv.distance>p.maxDistance)position-=6;
  if(macd.histPct!=null&&macd.histPct>=95)position-=8;else if(macd.histPct!=null&&macd.histPct>=90)position-=4;
  if(macd.topDivergence)position-=8;
  if(macd.deathCross)position-=10;
  if(pv.heavyUpperShadow)position-=6;
  if(pv.explosiveNoProgress)position-=6;
  if(pv.state==='價跌量增')position-=6;
  if(tr.atrPct!=null&&tr.atrPct>8)position-=4;
  if(overheat.isOverheated)position-=8;
  position=clamp(position,0,20);

  let liquidity=0;
  if(pv.amount>=p.amount*2)liquidity+=8;else if(pv.amount>=p.amount)liquidity+=6;
  if(tr.atrPct!=null&&tr.atrPct>=1&&tr.atrPct<=6)liquidity+=4;else if(tr.atrPct!=null&&tr.atrPct<=8)liquidity+=2;
  if(pv.ratio>=0.8&&pv.ratio<=3)liquidity+=3;
  liquidity=clamp(liquidity,0,15);

  const score=clamp(breakout+volume+trend+position+liquidity,0,100);
  const alerts=[...pv.alerts,...macd.alerts];
  if(overheat.isOverheated)alerts.push(`過熱突破：${overheat.count}項追價風險（${overheat.triggers.join('；')}）`);
  if(pv.gain>p.maxGain)alerts.push(`5日已漲${pv.gain.toFixed(1)}%，追價風險升高`);
  if(pv.distance!=null&&pv.distance>p.maxDistance)alerts.push(`距上軌${pv.distance.toFixed(1)}%，位置偏延伸`);
  const hardRisk=macd.deathCross||macd.topDivergence||pv.explosiveNoProgress||pv.heavyUpperShadow||pv.state==='價跌量增'||pv.gain>25||(pv.distance!=null&&pv.distance>5)||overheat.isOverheated;
  const grade=overheat.isOverheated?'過熱突破・觀察':score>=80&&!hardRisk?'高品質研究候選':score>=65&&!hardRisk?'條件中上':score>=50?'觀察':'偏弱';
  return {score,grade,breakoutScore:breakout,volumeScore:volume,trendScore:trend,positionScore:position,liquidityScore:liquidity,
   macdModifier:{state:macd.state,confirm:macd.dif>macd.dea&&macd.hist>0,risk:macd.deathCross||macd.topDivergence||macd.histPct>=95},
   // Legacy aliases retained so old exports do not break; R9 UI uses the new names above.
   bollingerScore:breakout,priceVolumeScore:volume,macdScore:0,riskScore:position+liquidity,
   pv,macd,trend:tr,overheat,alerts,hardRisk};
 }

 function classify(s,options={},gate={}){
  const p={...defaults,...options},t=s.cl.length-1,b=bands(s.cl,p.period,p.mult);
  const reasons=[];
  if(gate.reason)reasons.push(gate.reason);
  if(s.cl.length<Math.max(140,p.period+120))reasons.push('有效日K不足完整120日帶寬觀察');
  if(reasons.length)return {group:'Q',reasons,checks:[],signal:null,score:null,quality:null};
  const m=metrics(s,t,b);
  // Priority fix: a fresh qualifying breakout must start a new signal before an older signal is tracked.
  const fresh=signal(s,t,b,p);
  if(fresh){
   const f={group:'N',signal:fresh,...m,checks:[],reasons:[],age:0,retention:1,change:0};
   f.quality=qualitySnapshot(s,t,b,p,f);f.score=f.quality.score;f.preferred=false;
   if(f.quality.overheat?.isOverheated){
    f.group='H';
    f.reasons=['今日首次／重新突破，但追價風險偏高；列為過熱觀察，不列直接買進候選',`過熱條件：${f.quality.overheat.triggers.join('；')}`,'等待回測突破區、布林上軌或 OB/FVG 後重新確認'];
   }else{
    f.reasons=['今日首次／重新突破，位置與熱度尚未達過熱門檻；仍等待下一交易日延續確認'];
   }
   return f;
  }
  const pending=gate.provisional?signal(s,t,b,{...p,breakVolume:0}):null;
  if(pending){
   const f={group:'V',signal:pending,...m,checks:[[false,`今日累計量比≥${p.breakVolume}`]],reasons:['今日突破價格條件符合，累計成交量尚未達門檻'],age:0,retention:pending.volume>0?s.v[t]/pending.volume:1,change:0};
   f.quality=qualitySnapshot(s,t,b,p,f);f.score=f.quality.score;f.preferred=false;return f;
  }
  // Earlier lifecycle detector: a qualified middle-band reclaim gets priority over an
  // older, already-stale upper-band signal.  A fresh upper-band breakout above still wins.
  const midSig=findRecentMidline(s,t,b,p,gate);
  let fadedMid=null;
  if(midSig){
   const cur=midlineSnapshot(s,t,b,p,gate)||midSig,age=t-midSig.i,health=midlineHealth(midSig,cur,age);
   const f={group:'M',signal:midSig,midline:{...midSig,current:cur,health},...m,checks:[],reasons:[],age,retention:1,change:(s.cl[t]/midSig.price-1)*100};
   f.quality=qualitySnapshot(s,t,b,p,f);
   // Current continuation health matters more after day 0; this avoids stale M candidates.
   const healthWeight=age>0?health.score:60;
   f.score=clamp(Math.round(midSig.score*0.50+f.quality.score*0.30+healthWeight*0.20),0,100);
   const tierName={M3:'上軌攻擊',M2:'強啟動',M1:'初啟動'}[midSig.tier]||'中軌啟動';
   f.reasons=[`${midSig.date} 中軌突破・${tierName}；中軌動能分 ${midSig.score}/100`,
    `突破中軌 ${midSig.crossPct.toFixed(1)}%，距上軌尚有 ${midSig.distUpper.toFixed(1)}%，${gate.provisional?'盤中量速':'20日量比'} ${midSig.volumeUsed.toFixed(2)}，CLV ${(midSig.clv*100).toFixed(0)}%，RSI ${midSig.rsi?.toFixed(1)??'—'}`,
    age>0?`續攻健康度：${health.label}；訊號後 ${health.ret>=0?'+':''}${health.ret.toFixed(1)}%，中軌→上軌進度變化 ${health.progressDelta>=0?'+':''}${health.progressDelta.toFixed(1)}pct`:`續攻健康度：${health.label}；等待下一交易日確認是否持續向上`,
    `SOP：守住中軌 ${b[t].mid.toFixed(2)} 與訊號低點 ${midSig.low.toFixed(2)}；量價延續再看上軌 ${b[t].up.toFixed(2)}，跌回中軌下立即降級`];
   if(midSig.riskFlags.length)f.reasons.push(`風險：${midSig.riskFlags.join('；')}`);
   f.preferred=midSig.tier==='M3'&&health.state!=='fade'&&f.score>=70&&!f.quality.hardRisk;
   if(health.state!=='fade')return f;
   fadedMid=f; // continue looking for a valid older upper-band lifecycle; otherwise return C below.
  }
  let sig=null;
  for(let i=t-1;i>=Math.max(139,t-p.tracking);i--){sig=signal(s,i,b,p);if(sig)break;}
  if(!sig){
   if(fadedMid){
    fadedMid.group='C';fadedMid.preferred=false;fadedMid.reasons.unshift('中軌突破曾符合M條件，但後續續攻衰退，已自動退出M快速候選池');
    return fadedMid;
   }
   const f={group:'NONE',signal:null,...m,checks:[],reasons:['追蹤區間內無符合全部條件的突破訊號']};
   f.quality=qualitySnapshot(s,t,b,p,f);f.score=f.quality.score;f.preferred=false;return f;
  }
  const retention=sig.volume>0?s.v[t]/sig.volume:0;
  const checks=[
   [s.cl[t]>sig.price,'收盤高於突破日'],[s.cl[t]>b[t].up,'收盤仍在上軌以上'],
   [b[t].mid>b[t-3].mid,'中軌向上'],[b[t].bw>b[t-1].bw,'帶寬高於前日'],
   [m.ratio>=p.holdVolume,`量比≥${p.holdVolume}`],[retention>=p.retention,`成交量／突破日量≥${p.retention}`],
   [m.gain<=p.maxGain,`五日漲幅≤${p.maxGain}%`],[m.distance<=p.maxDistance,`距上軌≤${p.maxDistance}%`]
  ];
  // Once a signal fails during the tracking window it remains failed. A fresh breakout above already resets first.
  let failedAt=null;
  for(let i=sig.i+1;i<=t;i++)if(s.cl[i]<sig.low||s.cl[i]<b[i].mid){failedAt=s.d[i];break;}
  let group;
  if(failedAt)group='D';
  else if(checks.every(x=>x[0]))group='A';
  else if(checks.slice(0,4).every(x=>x[0])&&(!checks[6][0]||!checks[7][0]))group='B';
  else if(gate.provisional&&checks.slice(0,4).every(x=>x[0])&&checks.slice(6).every(x=>x[0]))group='V';
  else group='C';
  const f={group,signal:sig,checks,...m,retention,age:t-sig.i,failedAt,
   change:(s.cl[t]/sig.price-1)*100,
   reasons:failedAt?[`${failedAt}跌破突破日低點或中軌`]:checks.filter(x=>!x[0]).map(x=>x[1]+'：未達')};
  f.quality=qualitySnapshot(s,t,b,p,f);f.score=f.quality.score;
  f.preferred=group==='A'&&f.score>=75&&!f.quality.hardRisk&&f.gain<=p.maxGain&&f.distance<=p.maxDistance;
  return f;
 }
 function compare(a,b){
  const order={A:0,M:1,V:2,N:3,C:4,H:5,B:6,D:7,Q:8,NONE:9};
  const base=order[a.group]-order[b.group];if(base)return base;
  if(a.group==='M'&&b.group==='M'){
   const hr={accelerating:0,healthy:1,holding:2,signal:3,neutral:4,unknown:5},ha=hr[a.midline?.health?.state]??5,hb=hr[b.midline?.health?.state]??5;
   if(ha!==hb)return ha-hb;
   const tr={M3:0,M2:1,M1:2,'':3},ta=tr[a.midline?.tier||'']??3,tb=tr[b.midline?.tier||'']??3;
   if(ta!==tb)return ta-tb;
   const ma=a.midline?.current?.score??a.midline?.score??-Infinity,mb=b.midline?.current?.score??b.midline?.score??-Infinity;
   if(ma!==mb)return mb-ma;
  }
  return Number(b.preferred||false)-Number(a.preferred||false)||
   (b.score??-Infinity)-(a.score??-Infinity)||(a.distance??Infinity)-(b.distance??Infinity)||(b.amount??0)-(a.amount??0);
 }
 function explain(s,f,options={}){
  const p={...defaults,...options},t=s.cl.length-1;
  const unavailable={strength:'資料待確認',flat:'暫不判定買點',held:'暫不判定續抱或賣點',reasons:f.reasons||[],levels:[],rows:[]};
  if(f.group==='Q'||t<21)return unavailable;
  const b=bands(s.cl,20,2),now=b[t],prev=b[t-1],price=s.cl[t],prior=s.cl[t-1];
  const change=(price/prior-1)*100,vr=s.v[t-1]>0?s.v[t]/s.v[t-1]:null;
  const above=price>now.up,wasAbove=prior>prev.up;
  const brokenMid=price<now.mid,brokenSignal=!!f.signal&&price<f.signal.low;
  const fmt=x=>Number.isFinite(x)?x.toFixed(2):'—';
  const q=f.quality||qualitySnapshot(s,t,b,p,f);
  const reasons=[
   `${s.d[t-1]}價格 ${fmt(prior)} → ${s.d[t]}${f.provisional?'最新價格':'收盤'} ${fmt(price)}（${change>=0?'+':''}${fmt(change)}%），${change>0?'價格上升':change<0?'價格回落':'價格持平'}。`,
   `${wasAbove?'前日站上':'前日未站上'}上軌；目前${above?'仍在':'未在'}上軌上方，距上軌 ${fmt((price/now.up-1)*100)}%。`,
   `中軌 ${fmt(prev.mid)} → ${fmt(now.mid)}（${now.mid>prev.mid?'上升':now.mid<prev.mid?'下降':'持平'}）；帶寬 ${fmt(prev.bw)}% → ${fmt(now.bw)}%，帶寬擴張本身不代表看漲。`,
   f.provisional?`今日累計 ${s.v[t].toLocaleString()} 張／前日全天 ${s.v[t-1].toLocaleString()} 張${vr===null?'（前日零量，比例不可計）':`＝${fmt(vr)} 倍`}；未做同時段比較，不據此單獨判為量縮轉弱。`:
    `成交量 ${s.v[t-1].toLocaleString()} → ${s.v[t].toLocaleString()} 張${vr===null?'（前日零量，增減不可計）':`，${vr>=1?'增加':'減少'} ${fmt(Math.abs(vr-1)*100)}%`}。`,
   `MACD：${q.macd.state}，DIF ${fmt(q.macd.dif)}／DEA ${fmt(q.macd.dea)}／柱 ${fmt(q.macd.hist)}，60日動能位階 ${fmt(q.macd.histPct)}%。`,
   `價量：${q.pv.state}，20日量比 ${fmt(q.pv.ratio)}，相對前日量 ${fmt(q.pv.volPrev)}，收盤位置CLV ${fmt(q.pv.clv*100)}%。`,
   `研究品質分 ${q.score}/100（趨勢 ${q.trendScore}/25、突破 ${q.breakoutScore}/20、量價效率 ${q.volumeScore}/20、位置風險 ${q.positionScore}/20、流動性波動 ${q.liquidityScore}/15；MACD改為確認／扣分因子）；僅供排序研究。`
  ];
  if(q.alerts.length)reasons.push(`風險提示：${q.alerts.join('；')}。`);
  let strength=change>0&&price>now.mid&&now.mid>=prev.mid?'相較前日偏強':change<0&&(brokenMid||(wasAbove&&!above))?'相較前日偏弱':change===0?'價格持平・觀察其他條件':'強弱混合・整理觀察';
  let flat='等待買點確認',held='續抱觀察：以中軌與突破日低點檢查是否轉弱';
  if((brokenMid||brokenSignal)&&f.signal){
   flat='不列買點候選';held=f.provisional?'盤中賣點條件觸發：跌破防守條件，評估減碼／退出':'賣點條件觸發：評估減碼／退出';
   reasons.push(`目前${brokenMid?'低於20日中軌':''}${brokenMid&&brokenSignal?'，且':''}${brokenSignal?'低於突破日低點':''}，屬本策略防守條件失守。`);
  }else if(f.group==='D'){
   flat='舊訊號已失效，等待新突破';held='反彈觀察・暫緩加碼，重新評估持有理由';
   reasons.push(`舊突破在 ${f.failedAt||'先前交易日'} 曾失效；目前雖收復防守位置，不能視為原訊號自動恢復。`);
  }else if(f.group==='A'){
   if(change>0&&price>s.h[t-1])flat=f.provisional?'盤中研究候選：本次更新符合延續條件且突破前日高點':'研究候選：延續條件符合且突破前日高點';
   else flat='等待確認：尚未同時價漲並突破前日高點';
   held=change<0?'續抱觀察・今日回落，留意是否失守防守位置':'續抱觀察：延續條件仍符合';
   reasons.push(`前日高點 ${fmt(s.h[t-1])}；目前${price>s.h[t-1]?'已突破':'尚未突破'}。`);
  }else if(f.group==='M'){
   const mm=f.midline?.current||f.midline||{};const tier=f.midline?.tier||mm.tier||'M1';
   flat=tier==='M3'?'中軌上攻動能強：列優先研究，等回測不破／續強確認，不追跳空':'中軌突破候選：等待量價續強與上軌距離收斂';
   held=`偏多續抱觀察；20日中軌 ${fmt(now.mid)} 為第一防守，訊號低點 ${fmt(f.signal?.low)} 為第二防守`;
   reasons.push(`中軌動能 ${tier}｜分數 ${mm.score??f.midline?.score??'—'}/100｜中軌→上軌進度 ${fmt(mm.progress)}%｜距上軌 ${fmt(mm.distUpper)}%。`);
  }else if(f.group==='B'){
   flat='不追價：短期延伸超過設定門檻';held='續抱並檢查防守位置；超出上軌不單獨構成賣點';
  }else if(f.group==='V'){
   flat='本次量能未達門檻，不列突破確認';held='續抱觀察：價格條件符合，本次累計量能未達門檻';
  }else if(f.group==='N'){
   flat='健康新突破觀察，等待下一交易日延續；仍不直接追價';held='續抱觀察：新突破尚未完成次日確認';
  }else if(f.group==='H'){
   flat='過熱突破觀望，不追價；等待回測突破區／上軌／OB-FVG後再評估';held='已有持股可續抱觀察，但提高防守；若跌回突破區下方則降低曝險';
   reasons.push(`本日觸發 ${q.overheat?.count||0} 項追價風險，因此即使突破成立也不視為低風險新倉買點。`);
  }else if(f.group==='NONE'){
   flat='未符合本策略突破條件';held=brokenMid?'趨勢偏弱，但無有效突破訊號；不判為本策略賣點':'本策略無有效突破訊號，不能僅據此認定應續抱';
  }
  const levels=[['前日高點',s.h[t-1]],['前日低點',s.l[t-1]],['20日中軌',now.mid]];
  if(f.signal)levels.push(['突破日低點',f.signal.low]);
  return {strength,flat,held,reasons,levels,change,rows:[
   ['價格',prior,price],['成交量(張)',s.v[t-1],s.v[t]],['20日中軌',prev.mid,now.mid],['帶寬%',prev.bw,now.bw],['研究品質分','—',q.score]
  ],previousDate:s.d[t-1],date:s.d[t]};
 }
 const version='2026.10.07-v6.8-middle-breakout';
 function freshness({nowMs,fetchedMs,maxMinutes=15,checkAge=true}){
  if(!Number.isFinite(fetchedMs)||fetchedMs<=0)return '缺少有效下載時間，請更新資料';
  const age=(nowMs-fetchedMs)/60000;
  if(age < -2)return '下載時間晚於目前時間，請檢查系統時鐘';
  if(checkAge&&age>maxMinutes)return `盤中快照已超過${maxMinutes}分鐘，請更新資料（下載時間不等於行情成交時間）`;
  return '';
 }
 function riskPlan(s,f,input={}){
  if(f.group!=='A'||!f.signal)return {available:false,reason:f.group==='M'?'M組是中軌→上軌動能監測，不提供直接追價部位試算；等A組或回測確認。':'僅為A組有效延續確認提供新倉風險試算；不是買進指令'};
  const t=s.cl.length-1,b=bands(s.cl,20,2),entry=s.cl[t];
  const stop=Math.max(b[t].mid,f.signal.low),distance=entry-stop;
  if(!(distance>0&&Number.isFinite(distance)))return {available:false,reason:'防守參考不低於價格，無法建立有效多頭風險試算'};
  const tr=[];
  for(let i=t-14;i<t;i++)tr.push(Math.max(s.h[i]-s.l[i],Math.abs(s.h[i]-s.cl[i-1]),Math.abs(s.l[i]-s.cl[i-1])));
  const atr=avg(tr),cost=Number(input.costPct),budget=Number(input.budget),capital=Number(input.capital);
  const out={available:true,entry,stop,distance,stopPct:distance/entry*100,atr,atrRatio:atr>0?distance/atr:null,
   twoR:entry+2*distance,shares:null,lots:null,reason:'請輸入單筆損失預算、資金上限與成本緩衝後試算；不替你預設部位'};
  if(input.budget===''||input.capital===''||input.costPct===''||!Number.isFinite(budget)||!Number.isFinite(capital)||!Number.isFinite(cost)||budget<=0||capital<=0||cost<0||cost>10)return out;
  const perShare=distance+entry*cost/100;
  const shares=Math.max(0,Math.floor(Math.min(budget/perShare,capital/(entry*(1+cost/100)))));
  return {...out,shares,lots:Math.floor(shares/1000),costPct:cost,estimatedLoss:shares*perShare,estimatedCapital:shares*entry*(1+cost/100),
   reason:'股數受損失預算與資金上限雙重限制；含自填成本緩衝，但跳空／滑價仍可能超出預算。2R只是假設價格，不是預測目標。'};
 }
 return {defaults,bands,signal,classify,compare,explain,version,freshness,riskPlan,macdAt,priceVolume,qualitySnapshot,midlineSnapshot,midlineSignal,midlineHealth,findRecentMidline,rsi14,middleBreakout};
})();
if(typeof module!=='undefined')module.exports=SelectionRules;
