(()=>{
 const exportButton=document.createElement('button');exportButton.className='btn';exportButton.textContent='匯出設定';
 const importButton=document.createElement('button');importButton.className='btn';importButton.textContent='匯入設定';
 const input=document.createElement('input');input.type='file';input.accept='.json';input.hidden=true;
 document.querySelector('header').append(exportButton,importButton,input);
 const keys=['bb_params','bb_stage','bb_fav','bb_offInd','bb_offMkt','bb_sortKey','bb_sortDir','bb_screen','bb_rules_v1','bb_timing_mode','bb_max_age'];
 exportButton.onclick=()=>{
  const settings={};for(const k of keys){const value=store.get(k,null);if(value!==null)settings[k]=value;}
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'bollinger-settings',version:1,settings},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='布林選股設定.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 importButton.onclick=()=>input.click();
 input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  try{
   if(file.size>1000000)throw Error('設定檔太大');
   const data=JSON.parse(await file.text()),s=data.settings;
   if(data.format!=='bollinger-settings'||data.version!==1||!s||typeof s!=='object'||Array.isArray(s))throw Error('不是支援的布林選股設定檔');
   const clean={}; if(['intraday','close'].includes(s.bb_timing_mode))clean.bb_timing_mode=s.bb_timing_mode;
   if('bb_max_age' in s){const n=Number(s.bb_max_age);if(!Number.isFinite(n)||n<5||n>120)throw Error('快照有效分鐘須介於5至120');clean.bb_max_age=n;}
   for(const k of ['bb_fav','bb_offInd','bb_offMkt'])if(k in s){if(!Array.isArray(s[k])||s[k].length>3000||s[k].some(v=>typeof v!=='string'||v.length>100))throw Error('自選或篩選格式不正確');clean[k]=s[k];}
   if(s.bb_params&&typeof s.bb_params==='object')clean.bb_params=normalizeParams({...DEF,...s.bb_params});
   if(STAGES.some(x=>x.k===s.bb_stage))clean.bb_stage=s.bb_stage;
   if(COLS.some(x=>x.k===s.bb_sortKey))clean.bb_sortKey=s.bb_sortKey;
   if([1,-1].includes(s.bb_sortDir))clean.bb_sortDir=s.bb_sortDir;
   if(['strategy','legacy'].includes(s.bb_screen))clean.bb_screen=s.bb_screen;
   if(s.bb_rules_v1&&typeof s.bb_rules_v1==='object'){
    clean.bb_rules_v1={...SelectionRules.defaults};
    for(const [k,[lo,hi]] of Object.entries(bounds)){const n=Number(s.bb_rules_v1[k]);if(Number.isFinite(n))clean.bb_rules_v1[k]=Math.max(lo,Math.min(hi,n));}
    clean.bb_rules_v1.tracking=Math.round(clean.bb_rules_v1.tracking);
   }
   if(!confirm('將套用匯入的自選與篩選設定，是否繼續？'))return;
   for(const [k,v] of Object.entries(clean))store.set(k,v);
   location.reload();
  }catch(e){alert('匯入失敗：'+e.message);}finally{input.value='';}
 };
})();
