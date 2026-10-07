// Pure technical-analysis core for the R10 single-stock analyzer.
const SingleStockCore=(()=>{
 'use strict';
 const finite=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x));
 const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
 function sma(a,n){const out=new Array(a.length).fill(null);let sum=0;for(let i=0;i<a.length;i++){sum+=a[i];if(i>=n)sum-=a[i-n];if(i>=n-1)out[i]=sum/n;}return out;}
 function ema(a,n){const out=new Array(a.length).fill(null);if(!a.length)return out;const k=2/(n+1);let e=a[0];out[0]=e;for(let i=1;i<a.length;i++){e=a[i]*k+e*(1-k);out[i]=e;}return out;}
 function bands(a,n=20,m=2){const mid=sma(a,n),up=new Array(a.length).fill(null),lo=up.slice(),bw=up.slice();for(let i=n-1;i<a.length;i++){let ss=0;for(let j=i-n+1;j<=i;j++){const d=a[j]-mid[i];ss+=d*d;}const sd=Math.sqrt(ss/n);up[i]=mid[i]+m*sd;lo[i]=mid[i]-m*sd;bw[i]=mid[i]?((up[i]-lo[i])/mid[i]*100):null;}return{mid,up,lo,bw};}
 function macd(a){const e12=ema(a,12),e26=ema(a,26),dif=a.map((_,i)=>e12[i]-e26[i]),dea=ema(dif,9),hist=dif.map((x,i)=>x-dea[i]);return{dif,dea,hist};}
 function rsi(a,n=14){const out=new Array(a.length).fill(null);if(a.length<=n)return out;let gain=0,loss=0;for(let i=1;i<=n;i++){const d=a[i]-a[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}gain/=n;loss/=n;out[n]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];gain=(gain*(n-1)+Math.max(0,d))/n;loss=(loss*(n-1)+Math.max(0,-d))/n;out[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);}return out;}
 function kd(h,l,c,n=9){const K=new Array(c.length).fill(null),D=K.slice(),rsv=K.slice();let pk=50,pd=50;for(let i=n-1;i<c.length;i++){let hh=-Infinity,ll=Infinity;for(let j=i-n+1;j<=i;j++){hh=Math.max(hh,h[j]);ll=Math.min(ll,l[j]);}const x=hh===ll?50:(c[i]-ll)/(hh-ll)*100;pk=pk*2/3+x/3;pd=pd*2/3+pk/3;rsv[i]=x;K[i]=pk;D[i]=pd;}return{K,D,rsv};}
 function atr(h,l,c,n=14){const tr=new Array(c.length).fill(null),out=tr.slice();for(let i=0;i<c.length;i++)tr[i]=i===0?h[i]-l[i]:Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));if(c.length<n)return{tr,atr:out};let x=avg(tr.slice(0,n));out[n-1]=x;for(let i=n;i<c.length;i++){x=(x*(n-1)+tr[i])/n;out[i]=x;}return{tr,atr:out};}
 function obv(c,v){const o=new Array(c.length).fill(0);for(let i=1;i<c.length;i++)o[i]=o[i-1]+(c[i]>c[i-1]?v[i]:c[i]<c[i-1]?-v[i]:0);return o;}
 function pct(v){return v==null||!Number.isFinite(v)?null:v*100;}
 function classifyPattern(s,ser){const t=s.cl.length-1,b=ser.bb,price=s.cl[t],mid=b.mid[t],up=b.up[t],lo=b.lo[t],bw=b.bw[t],prev=b.bw[t-1];if([mid,up,lo,bw,prev].some(x=>x==null))return{key:'insufficient',label:'資料不足',bias:'neutral',description:'布林資料不足20根。'};const widths=b.bw.slice(Math.max(19,t-119),t+1).filter(finite).sort((a,b)=>a-b);const rank=widths.length?((widths.filter(x=>x<=bw).length)/widths.length*100):null;const bwChg=prev?((bw/prev-1)*100):0;const slope3=t>=3?(mid/b.mid[t-3]-1)*100:0;let upTouch=0,loTouch=0;for(let i=Math.max(19,t-4);i<=t;i++){if(s.cl[i]>=b.up[i]*0.99)upTouch++;if(s.cl[i]<=b.lo[i]*1.01)loTouch++;}const pctB=up===lo?.5:(price-lo)/(up-lo);const narrow=rank!=null&&rank<=25;const expanding=bwChg>3;let out;
   if(narrow&&price>up)out=['squeeze_up','收斂後向上突破','bull','通道仍位於近120日偏窄區，但價格已站上上軌，屬壓縮後向上試突破。'];
   else if(narrow&&price<lo)out=['squeeze_down','收斂後向下跌破','bear','通道仍窄，但價格跌破下軌，需留意壓縮後向下擴張。'];
   else if(narrow)out=['squeeze','布林收斂壓縮','neutral','帶寬位於近120日較窄區，方向尚未完全確認。'];
   else if(price>up&&slope3>0&&expanding)out=['bull_open','多頭開口突破','bull','價格站上上軌、中軌向上且帶寬擴張，屬多頭開口。'];
   else if(upTouch>=3&&slope3>0&&price>mid)out=['upper_walk','沿上軌多頭擴張','bull','最近5日多次貼近上軌且中軌上升，屬沿上軌強勢結構。'];
   else if(price>=up*0.97&&price>mid&&slope3>0)out=['upper_hold','上軌附近強勢整理','bull','價格位於上軌附近且中軌向上，趨勢偏多但需檢查乖離與量能。'];
   else if(Math.abs(price/mid-1)<=0.025&&slope3>0)out=['mid_pullback','中軌回測／多頭整理','bull','價格回到中軌附近且中軌仍向上，屬多頭整理區。'];
   else if(price<lo&&slope3<0&&expanding)out=['bear_open','空頭開口跌破','bear','價格跌破下軌、中軌向下且帶寬擴張，屬空頭開口。'];
   else if(loTouch>=3&&slope3<0&&price<mid)out=['lower_walk','沿下軌空頭擴張','bear','最近5日多次貼近下軌且中軌下彎，弱勢延續。'];
   else if(price<=lo*1.03&&price<mid)out=['lower_hold','下軌附近弱勢整理','bear','價格靠近下軌且位於中軌下方，短線結構偏弱。'];
   else if(price<mid&&slope3<=0)out=['below_mid','中軌下方偏弱整理','bear','價格在中軌下方且中軌未上揚，趨勢偏弱。'];
   else if(expanding)out=['expanding','通道擴張・方向未明','neutral','布林帶寬正在擴張，但價格位置與中軌方向尚未形成一致趨勢。'];
   else out=['neutral','通道中性整理','neutral','價格位於通道中段，帶寬與中軌方向未形成明確訊號。'];
   return{key:out[0],label:out[1],bias:out[2],description:out[3],rank,bwChange:bwChg,midSlope3:slope3,pctB,upTouch,loTouch};}

 function pivots(h,l,left=3,right=3){
   const highs=[],lows=[];
   for(let i=left;i<h.length-right;i++){
     let hi=true,lo=true;
     for(let j=i-left;j<=i+right;j++){
       if(j===i)continue;
       if(h[j]>=h[i])hi=false;
       if(l[j]<=l[i])lo=false;
     }
     if(hi)highs.push({i,p:h[i],confirmedAt:i+right});
     if(lo)lows.push({i,p:l[i],confirmedAt:i+right});
   }
   return{highs,lows};
 }
 function clusterLevels(points,tol){
   const groups=[];
   for(const x of points.slice().sort((a,b)=>a.p-b.p)){
     let g=groups.find(z=>Math.abs(z.p-x.p)<=tol);
     if(!g){g={p:x.p,pts:[]};groups.push(g);}
     g.pts.push(x);g.p=avg(g.pts.map(v=>v.p));
   }
   return groups.map(g=>({price:g.p,touches:g.pts.length,lastIndex:Math.max(...g.pts.map(x=>x.i)),types:[...new Set(g.pts.map(x=>x.type))]}));
 }
 function analyzeSMCSNR(s,ser){
   const n=s.cl.length,t=n-1,price=s.cl[t],prevPrice=s.cl[t-1],at=ser.atr[t]||Math.max(price*.02,0.01),tol=Math.max(at*.6,price*.006);
   const cutoff=s._ssaProvisional?t-1:t;
   const pv=pivots(s.h,s.l,3,3),highs=pv.highs.filter(x=>x.confirmedAt<=cutoff),lows=pv.lows.filter(x=>x.confirmedAt<=cutoff);
   const ph1=highs.at(-2)||null,ph2=highs.at(-1)||null,pl1=lows.at(-2)||null,pl2=lows.at(-1)||null;
   let structure='結構整理／混合',structureBias='neutral';
   if(ph1&&ph2&&pl1&&pl2){
     if(ph2.p>ph1.p&&pl2.p>pl1.p){structure='多頭 HH / HL';structureBias='bull';}
     else if(ph2.p<ph1.p&&pl2.p<pl1.p){structure='空頭 LH / LL';structureBias='bear';}
     else if(ph2.p>ph1.p&&pl2.p<pl1.p)structure='擴張震盪（HH + LL）';
     else structure='收斂震盪（LH + HL）';
   }
   const priorPivot=(arr,i)=>{for(let k=arr.length-1;k>=0;k--)if(arr[k].confirmedAt<i)return arr[k];return null;};
   const structureBiasBefore=i=>{
     const hs=highs.filter(x=>x.confirmedAt<i).slice(-2),ls=lows.filter(x=>x.confirmedAt<i).slice(-2);
     if(hs.length<2||ls.length<2)return'neutral';
     if(hs[1].p>hs[0].p&&ls[1].p>ls[0].p)return'bull';
     if(hs[1].p<hs[0].p&&ls[1].p<ls[0].p)return'bear';
     return'neutral';
   };
    const events=[],sweeps=[],brokenHigh=new Set(),brokenLow=new Set();
    let eventTrend='neutral';
    // A 3-right-bar pivot is available AFTER its confirmation close; no future bars.
    for(let i=6;i<=cutoff;i++){
      const ph=priorPivot(highs,i),pl=priorPivot(lows,i);
      const before=eventTrend==='neutral'?structureBiasBefore(i):eventTrend;
      if(ph&&!brokenHigh.has(ph.i)&&s.cl[i]>ph.p&&s.cl[i-1]<=ph.p){
        const kind=before==='bear'?'CHoCH':before==='bull'?'BOS':'Break';
        events.push({i,pivotIndex:ph.i,pivotConfirmedAt:ph.confirmedAt,level:ph.p,close:s.cl[i],type:`${kind} 向上`,kind,direction:'up',bias:'bull',date:s.d[i]});
        brokenHigh.add(ph.i);eventTrend='bull';
      }
      if(pl&&!brokenLow.has(pl.i)&&s.cl[i]<pl.p&&s.cl[i-1]>=pl.p){
        const kind=before==='bull'?'CHoCH':before==='bear'?'BOS':'Break';
        events.push({i,pivotIndex:pl.i,pivotConfirmedAt:pl.confirmedAt,level:pl.p,close:s.cl[i],type:`${kind} 向下`,kind,direction:'down',bias:'bear',date:s.d[i]});
        brokenLow.add(pl.i);eventTrend='bear';
      }
      if(ph&&!brokenHigh.has(ph.i)&&s.h[i]>ph.p&&s.cl[i]<ph.p&&s.cl[i-1]<=ph.p) sweeps.push({i,pivotIndex:ph.i,confirmedAt:ph.confirmedAt,side:'high',type:'上影越過結構高點後收回',bias:'bear',date:s.d[i],level:ph.p,extreme:s.h[i],close:s.cl[i]});
      if(pl&&!brokenLow.has(pl.i)&&s.l[i]<pl.p&&s.cl[i]>pl.p&&s.cl[i-1]>=pl.p) sweeps.push({i,pivotIndex:pl.i,confirmedAt:pl.confirmedAt,side:'low',type:'下影越過結構低點後收回',bias:'bull',date:s.d[i],level:pl.p,extreme:s.l[i],close:s.cl[i]});
    }
   const lastBreak=events.filter(e=>t-e.i<=45).at(-1)||null;
   const recentEvents=events.filter(e=>t-e.i<=45).slice(-8);
   const recentSweeps=sweeps.filter(e=>t-e.i<=45).slice(-8);
   const lastSweep=recentSweeps.at(-1)||null;
   const structureEvent=lastBreak?{...lastBreak}:{type:'無近期 BOS / CHoCH',bias:'neutral',date:null,level:null,i:null,pivotIndex:null,kind:null,direction:null};
   const liquidity=lastSweep?{...lastSweep}:{type:'近期無明顯流動性掃單',bias:'neutral',date:null,level:null,i:null,side:null};

   const pts=[...highs.slice(-24).map(x=>({...x,type:'H'})),...lows.slice(-24).map(x=>({...x,type:'L'}))];
   const levels=clusterLevels(pts,tol).filter(x=>t-x.lastIndex<=120&&Math.abs(x.price/price-1)<=.18);
   const support=levels.filter(x=>x.price<price).sort((a,b)=>b.price-a.price).slice(0,4);
   const resistance=levels.filter(x=>x.price>price).sort((a,b)=>a.price-b.price).slice(0,4);
   const highPools=clusterLevels(highs.slice(-24).filter(x=>!s.h.slice(x.confirmedAt+1).some(h=>h>x.p)).map(x=>({...x,type:'H'})),tol).filter(x=>t-x.lastIndex<=120&&x.price>price&&x.price<=price*1.18).sort((a,b)=>a.price-b.price);
   const lowPools=clusterLevels(lows.slice(-24).filter(x=>!s.l.slice(x.confirmedAt+1).some(l=>l<x.p)).map(x=>({...x,type:'L'})),tol).filter(x=>t-x.lastIndex<=120&&x.price<price&&x.price>=price*.82).sort((a,b)=>b.price-a.price);
   const bsl=highPools[0]||null;
   const ssl=lowPools[0]||null;

    function findOB(dir){
      for(let i=cutoff;i>=Math.max(12,t-70);i--){
        const ai=ser.atr[i]||at,body=Math.abs(s.cl[i]-s.o[i]);
        const event=events.find(e=>e.i===i&&e.direction===(dir==='bull'?'up':'down'));
        if(!event||body<ai*.75)continue;
        for(let j=i-1;j>=Math.max(0,i-8);j--){
          if(dir==='bull'&&s.cl[j]<s.o[j]){
            const low=s.l[j],high=s.o[j];
            if(s.cl.slice(i+1,cutoff+1).some(c=>c<low))break;
            if(Math.abs((low+high)/2/price-1)<=.2)return{type:'bull',i:j,date:s.d[j],low,high,impulse:i,confirmedAt:i,status:'active'};
            break;
          }
          if(dir==='bear'&&s.cl[j]>s.o[j]){
            const low=s.o[j],high=s.h[j];
            if(s.cl.slice(i+1,cutoff+1).some(c=>c>high))break;
            if(Math.abs((low+high)/2/price-1)<=.2)return{type:'bear',i:j,date:s.d[j],low,high,impulse:i,confirmedAt:i,status:'active'};
            break;
          }
        }
      }
      return null;
    }
   const bullOB=findOB('bull'),bearOB=findOB('bear');
   function findFVG(dir){
     for(let i=cutoff;i>=Math.max(2,t-60);i--){
       if(dir==='bull'&&s.l[i]>s.h[i-2]){
         const low=s.h[i-2],high=s.l[i],future=s.l.slice(i+1),filled=future.length&&Math.min(...future)<=low;
         if(!filled&&Math.abs((low+high)/2/price-1)<=.2)return{type:'bull',i,startIndex:i-2,date:s.d[i],low,high,confirmedAt:i,status:future.some(l=>l<high)?'partially_filled':'unfilled'};
       }
       if(dir==='bear'&&s.h[i]<s.l[i-2]){
         const low=s.h[i],high=s.l[i-2],future=s.h.slice(i+1),filled=future.length&&Math.max(...future)>=high;
         if(!filled&&Math.abs((low+high)/2/price-1)<=.2)return{type:'bear',i,startIndex:i-2,date:s.d[i],low,high,confirmedAt:i,status:future.some(h=>h>low)?'partially_filled':'unfilled'};
       }
     }
     return null;
   }
   const bullFVG=findFVG('bull'),bearFVG=findFVG('bear');
   const lb=Math.max(0,t-59),rangeHigh=Math.max(...s.h.slice(lb,t+1)),rangeLow=Math.min(...s.l.slice(lb,t+1)),eq=(rangeHigh+rangeLow)/2;
   const rangePos=rangeHigh>rangeLow?(price-rangeLow)/(rangeHigh-rangeLow):.5;
   const pdZone=rangePos>.55?'Premium（區間上半部）':rangePos<.45?'Discount（區間下半部）':'Equilibrium（均衡附近）';

   let score=0;
   if(structureBias==='bull')score+=2;else if(structureBias==='bear')score-=2;
   if(structureEvent.bias==='bull')score+=2;else if(structureEvent.bias==='bear')score-=2;
   if(liquidity.bias==='bull')score+=1;else if(liquidity.bias==='bear')score-=1;
   if(price>ser.bb.mid[t])score+=1;else score-=1;
   if(ser.macd.dif[t]>ser.macd.dea[t])score+=1;else score-=1;
   const bias=score>=3?'偏多':score<=-3?'偏空':'中性／等待確認';
   const fmt=x=>finite(x)?Number(x).toFixed(2):'—';
   const sup=support[0]?.price??null,res=resistance[0]?.price??null;
   const bullInvalidCandidates=[support[0]?.price,bullOB?.low,pl2?.p].filter(v=>finite(v)&&v<price);
   const bearInvalidCandidates=[resistance[0]?.price,bearOB?.high,ph2?.p].filter(v=>finite(v)&&v>price);
   const invalidBull=bullInvalidCandidates.length?Math.max(...bullInvalidCandidates)-tol*.35:null;
   const invalidBear=bearInvalidCandidates.length?Math.min(...bearInvalidCandidates)+tol*.35:null;

   const inZone=(z,pad=.25)=>!!z&&price>=z.low-tol*pad&&price<=z.high+tol*pad;
   const near=(v,m=1.15)=>finite(v)&&Math.abs(price-v)<=tol*m;
   const latestHighSweep=[...recentSweeps].reverse().find(x=>x.side==='high')||null;
   const latestLowSweep=[...recentSweeps].reverse().find(x=>x.side==='low')||null;
   const latestUpBreak=[...recentEvents].reverse().find(x=>x.direction==='up')||null;
   const latestDownBreak=[...recentEvents].reverse().find(x=>x.direction==='down')||null;
   const age=x=>x&&Number.isInteger(x.i)?t-x.i:999;
   const highSweepFresh=latestHighSweep&&age(latestHighSweep)<=4&&price<latestHighSweep.level;
   const failedUpBreak=latestUpBreak&&age(latestUpBreak)<=5&&price<latestUpBreak.level-tol*.08;
   const protectedLow=lastBreak?.direction==='up'?priorPivot(lows,lastBreak.i)?.p??null:null,
          protectedHigh=lastBreak?.direction==='down'?priorPivot(highs,lastBreak.i)?.p??null:null;
   const brokeProtectedLow=finite(protectedLow)&&price<protectedLow-tol*.10;
   const bearishBreakFresh=latestDownBreak&&age(latestDownBreak)<=6&&price<latestDownBreak.level+tol*.10;
   const bullishBreakFresh=latestUpBreak&&age(latestUpBreak)<=8&&price>latestUpBreak.level;
   let breakoutConfirmed=false,breakoutRetest=false;
   if(bullishBreakFresh){
     const from=Math.max(latestUpBreak.i,t-7),closes=s.cl.slice(from,t+1);
     const holds=closes.every(v=>v>=latestUpBreak.level-tol*.35);
     breakoutRetest=s.l.slice(Math.min(t,latestUpBreak.i+1),t+1).some((v,k)=>v<=latestUpBreak.level+tol*.45&&s.cl[Math.min(t,latestUpBreak.i+1)+k]>=latestUpBreak.level);
     const followThrough=price>=latestUpBreak.level+tol*.15;
     breakoutConfirmed=holds&&(closes.length>=2||followThrough||breakoutRetest);
   }
   const nearDemand=near(support[0]?.price,1.25)||inZone(bullOB,.35)||inZone(bullFVG,.35)||(latestLowSweep&&age(latestLowSweep)<=4&&price>=latestLowSweep.level);
   const bullContext=structureBias==='bull'||(latestUpBreak&&age(latestUpBreak)<=14)||(price>ser.bb.mid[t]&&ser.macd.dif[t]>=ser.macd.dea[t]);
   const bullishReaction=price>=s.o[t]||price>prevPrice||(latestLowSweep&&age(latestLowSweep)<=3);
   const sweepConfirmed=latestLowSweep&&latestUpBreak&&latestUpBreak.i>latestLowSweep.i&&age(latestLowSweep)<=8&&price>latestUpBreak.level;
    const pullbackReady=bullContext&&nearDemand&&bullishReaction&&sweepConfirmed&&rangePos<=.72&&!brokeProtectedLow;

   let signal;
   if(highSweepFresh||failedUpBreak){
     const lv=latestHighSweep?.level??latestUpBreak?.level;
     signal={key:'liquidity_bull_trap',label:'🟢上掃／突破失敗風險',bias:'bear',level:lv,date:(latestHighSweep||latestUpBreak)?.date||s.d[t],reason:highSweepFresh?`上破 ${fmt(lv)} 後收回其下，符合掃上方流動性／假突破特徵`:`突破 ${fmt(lv)} 後數日內重新收回其下，突破失敗`,next:`若無法重新站回 ${fmt(lv)}，優先防範回測下方 S1 / SSL`,invalidation:`重新收穩 ${fmt(lv)} 上方，且後續低點不再跌回突破位`};
   }else if(brokeProtectedLow||bearishBreakFresh||(structureBias==='bear'&&price<ser.bb.mid[t]&&ser.macd.dif[t]<ser.macd.dea[t])){
     const lv=latestDownBreak?.level??protectedLow??support[0]?.price;
     signal={key:'structure_weak',label:'🟢結構轉弱',bias:'bear',level:lv,date:latestDownBreak?.date||s.d[t],reason:latestDownBreak?`${latestDownBreak.type}，收盤位於 ${fmt(latestDownBreak.level)} 附近／下方`:brokeProtectedLow?`收盤跌破 Protected Low ${fmt(protectedLow)}`:'LH/LL 結構且價格、MACD 同步位於弱勢側',next:`先看 S1 ${fmt(support[0]?.price)}；若再失守，依序觀察 S2 / SSL`,invalidation:finite(protectedHigh)?`重新站回 Protected High ${fmt(protectedHigh)} 上方後重新評估`:'重新站回最近結構高點後重新評估'};
   }else if(breakoutConfirmed){
     const lv=latestUpBreak.level;
     signal={key:'breakout_confirmed',label:'🔴突破確認',bias:'bull',level:lv,date:latestUpBreak.date,reason:`${latestUpBreak.type} @ ${fmt(lv)}，目前收盤仍守在突破位上方${breakoutRetest?'，且已出現回測承接':''}`,next:`觀察突破位 ${fmt(lv)} 是否由壓力轉支撐；守穩可續看上方 BSL / R1`,invalidation:`有效收回 ${fmt(lv)} 下方，突破確認取消`};
   }else if(pullbackReady){
     const demandLv=support[0]?.price??bullOB?.high??bullFVG?.high;
     signal={key:'pullback_buy',label:'回檔承接條件成立',bias:'bull',level:demandLv,date:s.d[t],reason:`偏多背景下回到支撐／Demand${latestLowSweep&&age(latestLowSweep)<=4?'，並出現掃下方流動性後收回':''}；目前價格 ${fmt(price)}`,next:`優先確認低點不再跌破 S1 / SSL，已有 Sweep 後的向上結構突破；接下來觀察回測是否守穩`,invalidation:finite(invalidBull)?`有效跌破 ${fmt(invalidBull)} 後，回檔承接情境失效`:'跌破最近結構低點後失效'};
   }else{
     signal={key:'wait',label:'🟡等待',bias:'neutral',level:null,date:s.d[t],reason:`尚未同時滿足回檔承接、突破確認或明確轉弱條件；目前位於 ${pdZone}`,next:`上方觀察 ${fmt(res)}，下方觀察 ${fmt(sup)}；等待價格靠近關鍵區或 BOS / CHoCH`,invalidation:'等待狀態沒有單一失效線，依最新 Swing High / Low 與 SNR 更新'};
   }

   let plan;
   if(signal.key==='breakout_confirmed') plan={bias:'偏多',preferred:`突破後優先觀察 ${fmt(signal.level)} 是否轉為支撐`,trigger:'回測守穩、量價未明顯背離，且後續再創高',invalidation:signal.invalidation,avoid:'突破後若快速跌回原區間，不把單次刺穿視為有效突破'};
   else if(signal.key==='pullback_buy') plan={bias:'偏多',preferred:`回檔至 S1 / Demand / Bull FVG 後觀察承接（近支撐 ${fmt(sup)}）`,trigger:'掃低後已向上突破；回測需求區守穩，再核對量價',invalidation:signal.invalidation,avoid:rangePos>.65?'仍在 Premium，避免只因靠近支撐就重倉追價':'未出現承接反應前，不把「碰到支撐」等同買點'};
   else if(signal.key==='structure_weak') plan={bias:'偏空',preferred:`先防守，觀察反彈至壓力／Supply 是否無法站回（近壓力 ${fmt(res)}）`,trigger:`再度跌破 S1 / SSL，或反彈形成 LH 後轉弱`,invalidation:signal.invalidation,avoid:rangePos<.35?'已在 Discount，避免低位追空':'避免在跌破後第一時間追空，等待反彈／結構確認'};
   else if(signal.key==='liquidity_bull_trap') plan={bias:'偏空',preferred:`先確認假突破位 ${fmt(signal.level)} 是否持續壓制價格`,trigger:'無法站回假突破位，且向下跌破 S1 / 出現 Bearish BOS',invalidation:signal.invalidation,avoid:'若快速重新站回假突破位並守穩，不延續假突破判定'};
   else plan={bias:'中性／等待確認',preferred:`價格位於 ${pdZone}，先觀察 ${fmt(sup)}～${fmt(res)} 區間誰先被有效突破`,trigger:'等待 BOS / CHoCH、SNR 與量價同方向，再把突破方向視為主要情境',invalidation:'震盪結構下不使用單一固定失效線；以最新 Swing High / Low 更新',avoid:'區間中央的風險報酬通常較差，優先等待靠近 SNR、OB/FVG 或結構突破'};

   return{
     structure:{label:structure,bias:structureBias,lastHigh:ph2,lastLow:pl2,protectedHigh,protectedLow,event:structureEvent,events:recentEvents},
     liquidity:{...liquidity,sweeps:recentSweeps,pools:{bsl,ssl}},
     snr:{support,resistance,tolerance:tol},
     orderBlocks:{bull:bullOB,bear:bearOB},
     fvg:{bull:bullFVG,bear:bearFVG},
     range:{high:rangeHigh,low:rangeLow,eq,pos:rangePos,zone:pdZone},
     bias,score,signal,plan,provisional:!!s._ssaProvisional,definitionVersion:"v6.6.0",allEvents:events
   };
 }

 function twTickSize(price){
   const p=Number(price)||0;
   if(p<10)return .01;if(p<50)return .05;if(p<100)return .1;if(p<500)return .5;if(p<1000)return 1;return 5;
 }
 function analyzeDailyBias(s,ser){
   const n=s.cl.length,t=n-1,provisional=!!s._ssaProvisional;
   // During market hours the last bar is C3 (unfinished), so C1/C2 are the two completed bars before it.
   // After close/off-hours the last bar itself is completed C2 and the bias is for the next trading session.
   const c2i=provisional?t-1:t,c1i=c2i-1;
   if(c1i<0)return{bias:'neutral',setup:'insufficient',label:'資料不足',session:provisional?'今日':'下一交易日',baseConfidence:0};
   const c1={i:c1i,date:s.d[c1i],open:s.o[c1i],high:s.h[c1i],low:s.l[c1i],close:s.cl[c1i]};
   const c2={i:c2i,date:s.d[c2i],open:s.o[c2i],high:s.h[c2i],low:s.l[c2i],close:s.cl[c2i]};
   const at=Number(ser.atr[c2i])||Math.max(Number(c2.close)*.02,.01);
   const tick=twTickSize(c2.close),eps=Math.max(tick*2,at*.03);
   const closeAbove=c2.close>c1.high+eps,closeBelow=c2.close<c1.low-eps;
   const sweepHigh=c2.high>c1.high+eps,sweepLow=c2.low<c1.low-eps;
   const c1Bull=c1.close>c1.open,c1Bear=c1.close<c1.open;
   let bias='neutral',setup='inside_range',label='區間內／偏見轉弱',shortLabel='🟡 中性／等待',baseConfidence=25;
   let formula=`C1L < C2C < C1H`,explanation='昨天沒有形成有效掃單或收盤突破，方向優勢不足。',preferred='觀望／等待確認',primaryTarget=null,biasInvalidation=null,invalidationText='沒有單一 Bias 失效線；等待新的掃單、收盤突破或盤中結構確認。';
   if(closeAbove){
     bias='bull';primaryTarget=c2.high;biasInvalidation=c1.high;
     if(c1Bear){setup='strong_bullish_reversal';label='強勢反轉 → 明確偏多';shortLabel='🔴 強勢偏多';baseConfidence=90;explanation='前天偏空，但昨天直接收破前天高點，原方向被否定並轉為多方主導。';}
     else{setup='bullish_continuation';label='收破前高 → 多頭延續';shortLabel='🔴 偏多延續';baseConfidence=82;explanation='昨天收盤接受前天高點上方價格，屬多頭延續而非單純影線刺穿。';}
     formula='C2C > C1H + buffer';preferred='優先找多';invalidationText=`若後續收盤重新跌回 C1H ${c1.high.toFixed(2)} 下方，突破接受度轉弱。`;
   }else if(closeBelow){
     bias='bear';primaryTarget=c2.low;biasInvalidation=c1.low;
     if(c1Bull){setup='strong_bearish_reversal';label='強勢反轉 → 明確偏空';shortLabel='🟢 強勢偏空';baseConfidence=90;explanation='前天偏多，但昨天直接收破前天低點，原方向被否定並轉為空方主導。';}
     else{setup='bearish_continuation';label='收破前低 → 空頭延續';shortLabel='🟢 偏空延續';baseConfidence=82;explanation='昨天收盤接受前天低點下方價格，屬空頭延續而非單純盤中跌破。';}
     formula='C2C < C1L - buffer';preferred='優先防守／找空方風險';invalidationText=`若後續收盤重新站回 C1L ${c1.low.toFixed(2)} 上方，跌破接受度轉弱。`;
   }else if(sweepHigh&&sweepLow){
     setup='double_liquidity_sweep';label='雙向流動性掃蕩 → 方向不明';shortLabel='🟡 雙掃／等待';baseConfidence=35;formula='C2H > C1H 且 C2L < C1L，C2C 仍在 C1 區間';explanation='昨天同時掃掉前高與前低，最後又回到原區間，容易形成雙邊陷阱。';preferred='等待 BOS / CHoCH 再決定';
   }else if(sweepLow&&c2.close>c1.low){
     bias='bull';setup='sweep_low_reclaim';label='掃前低後收回 → 偏多';shortLabel='🔴 掃低收上';baseConfidence=75;formula='C2L < C1L - buffer 且 C2C > C1L';explanation='昨天拿走前低下方流動性後重新收回，賣方延續失敗，今日優先找多。';preferred='優先找多';primaryTarget=c2.high;biasInvalidation=c1.low;invalidationText=`若後續收盤再跌破 C1L ${c1.low.toFixed(2)}，Reclaim 劇本轉弱。`;
   }else if(sweepHigh&&c2.close<c1.high){
     bias='bear';setup='sweep_high_rejection';label='掃前高後收回 → 偏空';shortLabel='🟢 掃高收下';baseConfidence=75;formula='C2H > C1H + buffer 且 C2C < C1H';explanation='昨天拿走前高上方流動性後收回，買方延續失敗，今日優先防守空方風險。';preferred='優先防守／找空方風險';primaryTarget=c2.low;biasInvalidation=c1.high;invalidationText=`若後續收盤再站回 C1H ${c1.high.toFixed(2)} 上方，Rejection 劇本轉弱。`;
   }
   const pdh=c2.high,pdl=c2.low,session=provisional?'今日':'下一交易日';
   let targetReached=false;
   if(provisional&&bias==='bull'&&Number.isFinite(primaryTarget))targetReached=s.h[t]>=primaryTarget-eps;
   if(provisional&&bias==='bear'&&Number.isFinite(primaryTarget))targetReached=s.l[t]<=primaryTarget+eps;
   const targetLabel=bias==='bull'?'PDH 昨日高點':bias==='bear'?'PDL 昨日低點':'—';
   return{bias,setup,label,shortLabel,session,baseConfidence,formula,explanation,preferred,primaryTarget,targetLabel,targetReached,
     biasInvalidation,invalidationText,pdh,pdl,buffer:eps,tick,c1,c2,provisional,
     ruleVersion:'daily-bias-v1.0',note:'Daily Bias 只決定方向優先權，不等於直接進場；進場仍需 SMC/SNR、布林、量價與 RR 配合。'};
 }

 function dailyBias(s){if(!s||!Array.isArray(s.cl)||s.cl.length<16)throw Error('至少需要16根日K才能計算 Daily Bias buffer');const at=atr(s.h,s.l,s.cl,14);return analyzeDailyBias(s,{atr:at.atr});}

 function analyze(s){if(!s||!Array.isArray(s.cl)||s.cl.length<65)throw Error('至少需要65根日K才能做完整技術分析');const n=s.cl.length,t=n-1;const bb=bands(s.cl,20,2),ma5=sma(s.cl,5),ma20=sma(s.cl,20),ma60=sma(s.cl,60),vma5=sma(s.v,5),vma20=sma(s.v,20),mc=macd(s.cl),rs=rsi(s.cl,14),kk=kd(s.h,s.l,s.cl,9),at=atr(s.h,s.l,s.cl,14),ob=obv(s.cl,s.v);const ser={bb,ma5,ma20,ma60,vma5,vma20,macd:mc,rsi:rs,kd:kk,atr:at.atr,obv:ob};const pattern=classifyPattern(s,ser);const price=s.cl[t],prev=s.cl[t-1],chg=(price/prev-1)*100,ret5=t>=5?(price/s.cl[t-5]-1)*100:null,ret20=t>=20?(price/s.cl[t-20]-1)*100:null,ret60=t>=60?(price/s.cl[t-60]-1)*100:null;const maState=ma5[t]>ma20[t]&&ma20[t]>ma60[t]?'多頭排列':ma5[t]<ma20[t]&&ma20[t]<ma60[t]?'空頭排列':ma5[t]>ma20[t]&&price>ma20[t]?'短多／中期混合':ma5[t]<ma20[t]&&price<ma20[t]?'短空／中期混合':'均線糾結';const ma20Slope=t>=5?(ma20[t]/ma20[t-5]-1)*100:null;const hist=mc.hist[t],histPrev=mc.hist[t-1],gold=t>0&&mc.dif[t]>mc.dea[t]&&mc.dif[t-1]<=mc.dea[t-1],death=t>0&&mc.dif[t]<mc.dea[t]&&mc.dif[t-1]>=mc.dea[t-1];let macdState=gold?'MACD 黃金交叉':death?'MACD 死亡交叉':mc.dif[t]>mc.dea[t]&&hist>0?(hist>histPrev?'MACD 多頭加速':'MACD 多頭但動能放緩'):mc.dif[t]<mc.dea[t]&&hist<0?(hist<histPrev?'MACD 空頭加速':'MACD 空頭但跌勢收斂'):'MACD 中性';const r=rs[t],K=kk.K[t],D=kk.D[t];const kdState=K!=null&&D!=null?(K>D?(K>=80?'KD高檔偏多':'KD偏多'):(K<=20?'KD低檔偏空':'KD偏空')):'資料不足';const volRatio=vma20[t-1]?s.v[t]/vma20[t-1]:null;const vol5Ratio=vma5[t-1]?s.v[t]/vma5[t-1]:null;const pv=chg>0&&volRatio>=1.2?'價漲量增':chg>0&&volRatio<0.8?'價漲量縮':chg<0&&volRatio>=1.2?'價跌量增':chg<0&&volRatio<0.8?'價跌量縮':'價量中性';const atrVal=at.atr[t],atrPct=atrVal?atrVal/price*100:null;const high20=Math.max(...s.h.slice(Math.max(0,t-19),t+1)),low20=Math.min(...s.l.slice(Math.max(0,t-19),t+1));const high60=Math.max(...s.h.slice(Math.max(0,t-59),t+1)),low60=Math.min(...s.l.slice(Math.max(0,t-59),t+1));const obv5=t>=5?ob[t]-ob[t-5]:null;const risks=[];if(pattern.pctB>1.05)risks.push('價格明顯超出布林上軌，短線乖離偏大');if(r!=null&&r>=75)risks.push(`RSI14 ${r.toFixed(1)}，進入高檔區`);if(K!=null&&D!=null&&K>=85&&D>=85)risks.push('KD 位於高檔鈍化區，需防震盪加劇');if(ret5!=null&&ret5>15)risks.push(`5日已上漲 ${ret5.toFixed(1)}%，追價風險升高`);if(volRatio!=null&&volRatio>=4)risks.push(`成交量為20日均量 ${volRatio.toFixed(1)} 倍，屬極端放量`);if(atrPct!=null&&atrPct>7)risks.push(`ATR14 約 ${atrPct.toFixed(1)}%，波動偏高`);if(pv==='價跌量增')risks.push('價跌量增，賣壓放大');if(death)risks.push('MACD 今日死亡交叉');const positives=[];if(pattern.bias==='bull')positives.push(pattern.description);if(maState==='多頭排列')positives.push('MA5 > MA20 > MA60，多頭排列');if(mc.dif[t]>mc.dea[t]&&hist>0)positives.push(`MACD柱為正，${hist>histPrev?'且動能增強':'但動能較前日放緩'}`);if(r!=null&&r>=50&&r<75)positives.push(`RSI14 ${r.toFixed(1)}，位於偏強但未極端區`);if(pv==='價漲量增')positives.push(`價漲量增，成交量約20日均量 ${volRatio.toFixed(2)} 倍`);if(obv5!=null&&obv5>0)positives.push('OBV近5日淨方向為正');const cautions=[];if(pattern.bias==='bear')cautions.push(pattern.description);if(maState==='空頭排列')cautions.push('MA5 < MA20 < MA60，空頭排列');if(price<ma20[t])cautions.push('收盤低於20日均線／布林中軌');if(r!=null&&r<40)cautions.push(`RSI14 ${r.toFixed(1)}，動能偏弱`);cautions.push(...risks);const support=[['布林中軌',bb.mid[t]],['布林下軌',bb.lo[t]],['MA60',ma60[t]],['近20日低點',low20]].filter(x=>finite(x[1])&&x[1]<price).sort((a,b)=>Math.abs(price-a[1])-Math.abs(price-b[1]));const resistance=[['布林上軌',bb.up[t]],['近20日高點',high20],['近60日高點',high60]].filter(x=>finite(x[1])&&x[1]>price).sort((a,b)=>Math.abs(price-a[1])-Math.abs(price-b[1]));const smc=analyzeSMCSNR(s,ser);const metrics={price,prev,chg,ret5,ret20,ret60,maState,ma20Slope,macdState,dif:mc.dif[t],dea:mc.dea[t],hist,rsi:r,K,D,kdState,volRatio,vol5Ratio,pv,atr:atrVal,atrPct,obv5,high20,low20,high60,low60,bw:bb.bw[t],bbUp:bb.up[t],bbMid:bb.mid[t],bbLow:bb.lo[t],pctB:pattern.pctB};const dailyBias=analyzeDailyBias(s,ser);return{series:ser,pattern,metrics,positives,cautions:[...new Set(cautions)],risks:[...new Set(risks)],support,resistance,smc,dailyBias};}
 return{sma,ema,bands,macd,rsi,kd,atr,obv,analyze,classifyPattern,analyzeSMCSNR,analyzeDailyBias,dailyBias,pivots};
})();
if(typeof module!=='undefined')module.exports=SingleStockCore;
