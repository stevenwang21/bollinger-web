/* Event study, not a portfolio simulation. All indicators use signal-time data. */
if(typeof importScripts==='function')importScripts('/selection_rules.js');
const ResearchEngine=(()=>{
 const R=typeof module!=='undefined'?require('./selection_rules.js'):SelectionRules;
 const validDate=d=>{try{return /^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;}catch(_e){return false;}};
 const median=a=>{if(!a.length)return null;const x=[...a].sort((p,q)=>p-q),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;};
 function summarize(a){
  if(!a.length)return {n:0,mean:null,median:null,win:null,worst:null,best:null,avgWin:null,avgLoss:null,profitFactor:null,avgMFE:null,avgMAE:null};
  const nets=a.map(t=>t.net),wins=nets.filter(x=>x>0),loss=nets.filter(x=>x<0),grossProfit=wins.reduce((v,x)=>v+x,0),grossLoss=Math.abs(loss.reduce((v,x)=>v+x,0));
  return {n:a.length,mean:nets.reduce((v,x)=>v+x,0)/a.length,median:median(nets),win:wins.length/a.length*100,worst:Math.min(...nets),best:Math.max(...nets),
   avgWin:wins.length?wins.reduce((v,x)=>v+x,0)/wins.length:null,avgLoss:loss.length?loss.reduce((v,x)=>v+x,0)/loss.length:null,
   profitFactor:grossLoss>0?grossProfit/grossLoss:grossProfit>0?Infinity:null,
   excursionNote:'MFE/MAE 使用入場至退出日完整高低；停損當日先後順序未知，非實際逐筆路徑',avgMFE:a.reduce((v,t)=>v+t.mfe,0)/a.length,avgMAE:a.reduce((v,t)=>v+t.mae,0)/a.length};
 }
 function run(stocks,options={}){
  const cost=Number(options.cost),slip=Number(options.slip),hold=Number(options.hold);
  if(!Number.isFinite(cost)||cost<0||cost>10||!Number.isFinite(slip)||slip<0||slip>10||![1,3,5,10,20].includes(hold))throw Error('成本及單邊滑價須介於0至10%，持有期須為1、3、5、10或20根K棒');
  const rules={...R.defaults,...options.rules},trades=[],counts={signals:0,incomplete:0,invalid:0,skipped:0};
  for(const s of stocks){
   const keys=['d','o','h','l','cl','v'];
   if(keys.some(k=>!Array.isArray(s[k])||s[k].length!==s.cl?.length)||s.d.some((d,i)=>!validDate(d)||(i&&d<=s.d[i-1]))||['o','h','l','cl'].some(k=>s[k].some(x=>!Number.isFinite(x)||x<=0))||s.v.some(x=>!Number.isFinite(x)||x<0)||s.cl.some((c,i)=>s.l[i]>Math.min(s.o[i],c)||s.h[i]<Math.max(s.o[i],c))){counts.invalid++;continue;}
   if(s.cached_fallback){counts.invalid++;continue;}
   const b=R.bands(s.cl,20,2),seen=new Set();
   for(let t=139;t<s.cl.length;t++){
    const x={...s};for(const k of keys)x[k]=s[k].slice(0,t+1);
    let sig,f=null;
    if(options.kind==='buy'){
     f=R.classify(x,rules);
     if(f.group!=='A'||s.cl[t]<=s.cl[t-1]||s.cl[t]<=s.h[t-1]||seen.has(f.signal.date))continue;
     sig=f.signal;seen.add(sig.date);
    }else sig=R.signal(x,t,b,rules);
    if(!sig)continue;
    if(options.from&&s.d[t]<options.from||options.to&&s.d[t]>options.to)continue;
    counts.signals++;
    if(t+hold>=s.cl.length){counts.incomplete++;continue;}
    const entryRaw=s.o[t+1],entry=entryRaw*(1+slip/100),initial=Math.max(b[t].mid,sig.low);
    if(options.stop&&entryRaw<=initial){counts.skipped++;continue;}
    let end=t+hold,rawExit=s.cl[end],reason='固定期滿';
    if(options.stop)for(let j=t+1;j<=t+hold;j++){
     const level=Math.max(b[j-1].mid,sig.low);
     if(s.o[j]<=level){end=j;rawExit=s.o[j];reason='跳空失守（開盤價）';break;}
     if(s.l[j]<=level){end=j;rawExit=level;reason='觸及前日防守';break;}
    }
    let mfe=-Infinity,mae=Infinity;
    for(let j=t+1;j<=end;j++){
     mfe=Math.max(mfe,(s.h[j]/entryRaw-1)*100);
     mae=Math.min(mae,(s.l[j]/entryRaw-1)*100);
    }
    const exit=rawExit*(1-slip/100),gross=(rawExit/entryRaw-1)*100,net=(exit/entry-1)*100-cost;
    const quality=f?.quality||R.qualitySnapshot(x,t,R.bands(x.cl,20,2),rules,{signal:sig});
    trades.push({code:s.c,name:s.n,signal:s.d[t],breakout:sig.date,entryDate:s.d[t+1],exitDate:s.d[end],entry,exit,gross,net,mfe,mae,reason,
     score:quality.score,grade:quality.grade,macdState:quality.macd.state,macdHistPct:quality.macd.histPct,priceVolume:quality.pv.state,alerts:quality.alerts,
     partition:options.split?(s.d[t]>=options.split?'保留期':s.d[end]>=options.split?'跨分界（不納入兩段）':'研究期'):'研究期'});
   }
  }
  const byScore={high:summarize(trades.filter(t=>t.score>=80)),mid:summarize(trades.filter(t=>t.score>=65&&t.score<80)),low:summarize(trades.filter(t=>t.score<65))};
  return {version:R.version,options,counts,summary:summarize(trades),research:summarize(trades.filter(t=>t.partition==='研究期')),holdout:summarize(trades.filter(t=>t.partition==='保留期')),byScore,trades};
 }
 return {run};
})();
if(typeof module!=='undefined')module.exports=ResearchEngine;
if(typeof importScripts==='function')onmessage=e=>{try{postMessage({result:ResearchEngine.run(e.data.stocks,e.data.options)});}catch(err){postMessage({error:err.message});}};
