(() => {
  'use strict';

  const DEFAULT_PUTER_MODEL='openai/gpt-5.6-luna';
  const DEFAULT_GEMINI_MODEL='gemini-3.8-flash';
  const DEFAULT_GROQ_MODEL='qwen/qwen3.8-27b';
  const SESSION_KEYS={gemini:'biohim42-gemini-key',groq:'biohim42-groq-key'};
  let authPromise=null;
  let lastProvider='';

  const schema={
    type:'object',additionalProperties:false,properties:{questions:{type:'array',items:{
      type:'object',additionalProperties:false,properties:{
        type:{type:'string',enum:['mcq','open','yesno','combo','match']},number:{type:'integer'},q:{type:'string'},
        o:{type:'array',items:{type:'string'},minItems:0,maxItems:4},a:{type:'string',enum:['A','B','C','D','']},answer:{type:'string'},
        subpoints:{type:'array',items:{type:'string'},maxItems:8},comboOptions:{type:'array',items:{type:'string'},maxItems:12},
        comboAnswer:{type:'string'},matchLeft:{type:'array',items:{type:'string'},maxItems:8},matchRight:{type:'array',items:{type:'string'},maxItems:8},matchAnswer:{type:'string'},e:{type:'string'},topic:{type:'string'}
      },required:['type','number','q','o','a','answer','subpoints','comboOptions','comboAnswer','matchLeft','matchRight','matchAnswer','e','topic']
    }}},required:['questions']
  };

  function requirePuter(){
    if(!window.puter?.ai?.chat||!window.puter?.auth)throw new Error('Puter.js не се зареди. Провери интернет връзката и опитай отново.');
  }
  async function ensurePuterLoaded(){
    if(window.puter?.ai?.chat&&window.puter?.auth)return;
    if(window.BioHimPuterReady){
      try{await window.BioHimPuterReady;}catch(e){throw new Error('Puter.js не може да се зареди. Провери интернет връзката.');}
    }
    requirePuter();
  }
  async function ensureSignedIn(){
    await ensurePuterLoaded();
    if(puter.auth.isSignedIn()){try{return await puter.auth.getUser();}catch{return null;}}
    if(!authPromise)authPromise=puter.auth.signIn().finally(()=>{authPromise=null;});
    try{await authPromise;}catch(err){
      const code=err?.error||err?.code||'';
      if(code==='popup_blocked')throw new Error('Браузърът блокира Puter прозореца. Разреши pop-up за сайта и опитай отново.');
      if(code==='auth_window_closed')throw new Error('Puter входът беше отказан или прозорецът беше затворен.');
      throw new Error(err?.msg||err?.message||'Неуспешен вход в Puter.');
    }
    try{return await puter.auth.getUser();}catch{return null;}
  }
  function parseJsonText(text){
    const clean=String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
    if(!clean)throw new Error('AI не върна структурирано съдържание.');
    try{return JSON.parse(clean);}catch{}
    const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
    if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
    throw new Error('AI отговорът не е валиден JSON.');
  }
  function parsePuterResponse(resp){
    const calls=resp?.message?.tool_calls||resp?.tool_calls||[];
    for(const call of calls){
      if(call?.function?.name!=='submit_biohim_questions')continue;
      const raw=call.function.arguments;
      const obj=typeof raw==='string'?JSON.parse(raw):raw;
      if(Array.isArray(obj?.questions))return obj;
    }
    const content=resp?.message?.content??resp?.content??resp?.output_text??'';
    const obj=parseJsonText(typeof content==='string'?content:JSON.stringify(content));
    if(!Array.isArray(obj?.questions))throw new Error('AI отговорът няма масив questions.');
    return obj;
  }
  function puterTools(){return [{type:'function',function:{name:'submit_biohim_questions',description:'Submit the complete structured BioHim question list. Always call this function exactly once.',strict:true,parameters:schema}}];}

  async function puterStructured({prompt,media=null,messages=null,model=DEFAULT_PUTER_MODEL,reasoningEffort='low'}){
    await ensureSignedIn();
    try{
      const options={model:model||DEFAULT_PUTER_MODEL,normalize:true,tools:puterTools(),reasoning_effort:reasoningEffort,max_tokens:12000};
      const format='\n\nФОРМАТ: ЗАДЪЛЖИТЕЛНО извикай submit_biohim_questions точно веднъж. Не връщай обикновен текст.';
      const invoke=async retry=>{
        const extra=retry?'\nТова е повторен опит. Използвай функцията и не връщай свободен текст.':'';
        if(messages){
          const copy=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(x=>({...x})):m.content}));
          const last=copy[copy.length-1];
          if(last?.role==='user'){
            if(Array.isArray(last.content))last.content.push({type:'text',text:format+extra});
            else last.content=String(last.content||'')+format+extra;
          }
          return puter.ai.chat(copy,options);
        }
        const full=String(prompt||'')+format+extra;
        return media?puter.ai.chat(full,media,options):puter.ai.chat(full,options);
      };
      let r=await invoke(false);
      try{return parsePuterResponse(r);}catch(first){console.warn('BioHim 4.4: Puter structured retry',first);r=await invoke(true);return parsePuterResponse(r);}
    }finally{
      schedulePuterUsageRefresh();
    }
  }

  function subjectLabel(subject){const m={biology:'Биология',chemistry:'Химия','history-law':'История на държавата и правото','theory-law':'Обща теория на правото','human-action':'Човешко действие (икономика)',law:'Обща теория на правото'};return m[subject]||'Биология';}
  function buildMaterialPrompt({subject,materialType,title,count,cardStyle,difficulty,files}){
    const n=Math.max(1,Math.min(30,Number(count)||10)),type=materialType||'topic',topic=String(title||'').trim(),list=Array.from(files||[]);
    const names=list.map(f=>f.name).filter(Boolean);
    const style=cardStyle==='open'?'Всички карти да са type=open.':cardStyle==='mcq'?'Всички карти да са type=mcq с 3 или 4 смислени варианта и един правилен A/B/C/D според наличния брой.':cardStyle==='match'?'Всички карти да са type=match. Използвай 3–6 смислени двойки в matchLeft и matchRight и попълни matchAnswer във формат A:1; B:3; C:2.':'Използвай смес от open, mcq, yesno и match; combo само когато материалът естествено го изисква. При mcq използвай 3 или 4 варианта. При match използвай matchLeft, matchRight и matchAnswer във формат A:1; B:3; C:2.';
    const levels={easy:'лесно',medium:'средно',hard:'трудно',university:'университетско'};
    const sourceRule=list.length?`Използвай САМО предоставените ${list.length} файла${names.length?' ('+names.join(', ')+')':''}. Третирай ги като един общ материал. Не добавяй външни факти. Прочети внимателно всички предоставени изображения.`:'Няма приложени файлове. Използвай устойчиви общоприети знания по посочената тема. При правните предмети не измисляй конкретни членове, срокове или променливи нормативни детайли.';
    return `Ти си преподавател по ${subjectLabel(subject)} в BioHim 4.4. Създай точно ${n} качествени флаш карти. Тип източник: ${type}. Тема: ${topic||'не е посочена'}. Трудност: ${levels[difficulty]||'средно'}. ${style} Всеки въпрос да проверява отделно знание и да няма дублиране. За open попълни answer; за mcq попълни o и a; за yesno answer е само Да/Не; за match попълни matchLeft, matchRight и matchAnswer. Полето e да е кратко учебно обяснение, а topic — конкретната подтема. За неизползваните полета използвай празен стринг или празен масив. За mcq са валидни точно 3 или 4 опции. Номерирай от 1. ${sourceRule}`;
  }
  function tempExt(file){
    const m=String(file?.name||'').match(/\.([A-Za-z0-9]{1,8})$/);if(m)return'.'+m[1].toLowerCase();
    if(String(file?.type||'').startsWith('image/'))return'.'+String(file.type).split('/')[1].replace('jpeg','jpg');return'.bin';
  }
  async function puterGenerateMaterial(args){
    await ensureSignedIn();
    const files=Array.from(args.files||[]),uploaded=[];
    try{
      for(let i=0;i<files.length;i++){
        const f=files[i];
        const uploadedItem=await puter.fs.upload([f],'.',{overwrite:false,dedupeName:true});
        const item=Array.isArray(uploadedItem)?uploadedItem[0]:uploadedItem;
        if(!item?.path)throw new Error(`Неуспешно качване на ${f.name||'файл'} в Puter.`);
        await puter.fs.stat(item.path);
        uploaded.push(item.path);
      }
      const content=uploaded.map(path=>({type:'file',puter_path:path}));content.push({type:'text',text:buildMaterialPrompt({...args,files})});
      return await puterStructured({messages:[{role:'user',content}],model:args.puterModel||DEFAULT_PUTER_MODEL,reasoningEffort:['hard','university'].includes(args.difficulty)?'medium':'low'});
    }finally{if(uploaded.length){try{for(const path of uploaded)await puter.fs.delete(path);}catch(e){console.warn('BioHim 4.4: temp Puter cleanup failed',e);}}}
  }

  function getSessionKey(provider){try{return sessionStorage.getItem(SESSION_KEYS[provider])||'';}catch{return'';}}
  function setSessionKey(provider,value){try{if(value)sessionStorage.setItem(SESSION_KEYS[provider],value);else sessionStorage.removeItem(SESSION_KEYS[provider]);}catch{}}
  function hasBackupKey(provider){return !!getSessionKey(provider);}
  function providerLabel(p){return p==='gemini'?'Gemini':p==='groq'?'Groq':'Puter';}
  function readFileDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Неуспешно прочитане на файла.'));r.readAsDataURL(file);});}
  function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Неуспешно отваряне на изображението.'))};img.src=url;});}
  async function fileToProviderDataURL(file,provider){
    if(provider!=='groq'||!String(file?.type||'').startsWith('image/'))return readFileDataURL(file);
    if(file.size<=3.5*1024*1024)return readFileDataURL(file);
    const img=await loadImage(file),max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d',{alpha:false}).drawImage(img,0,0,w,h);
    return c.toDataURL('image/jpeg',0.82);
  }

  async function byokStructured(provider,{prompt,media=null,attachments=[],model='',reasoningEffort='low'}){
    const key=getSessionKey(provider);if(!key)throw new Error(`Няма въведен ${providerLabel(provider)} API ключ за тази браузърна сесия.`);
    let image=null;const files=[];
    if(media)image=await fileToProviderDataURL(media,provider);
    for(const item of Array.from(attachments||[])){
      const f=item?.file||item;
      if(provider==='groq'&&!String(f.type||'').startsWith('image/'))throw new Error('Groq резервният режим приема само изображения.');
      files.push({name:f.name||'file',mime:f.type||'',data:await fileToProviderDataURL(f,provider)});
    }
    if(provider==='groq'&&files.filter(x=>String(x.mime).startsWith('image/')).length+(image?1:0)>3)throw new Error('Groq Qwen 3.8 приема до 3 изображения в една заявка. Използвай Puter или Gemini за повече файлове.');
    const r=await fetch('/api/byok/structured',{method:'POST',headers:{'Content-Type':'application/json','x-biohim-api-key':key},body:JSON.stringify({provider,model,prompt,image,attachments:files,reasoningEffort})});
    const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data={error:raw}}
    if(!r.ok)throw new Error(data?.error||`${providerLabel(provider)} HTTP ${r.status}`);
    if(!Array.isArray(data?.questions))throw new Error(`${providerLabel(provider)} не върна валидни BioHim карти.`);
    return data;
  }

  function settings(){
    const s=(typeof state!=='undefined'&&state?.settings)||{};
    return {
      mode:['auto','puter','gemini','groq','off'].includes(s.aiMode)?s.aiMode:'auto',
      puterModel:s.puterModel||DEFAULT_PUTER_MODEL,
      backupProvider:['gemini','groq','none'].includes(s.backupProvider)?s.backupProvider:'none',
      geminiModel:s.geminiModel||DEFAULT_GEMINI_MODEL,
      groqModel:s.groqModel||DEFAULT_GROQ_MODEL,
      allowOcrFallback:!!s.allowOcrFallback
    };
  }
  function backupReady(s){return s.backupProvider!=='none'&&hasBackupKey(s.backupProvider);}
  function isLikelyPuterQuota(err){const x=String(err?.message||err||'').toLowerCase();return /quota|credit|limit|rate|429|balance|payment|usage|insufficient/.test(x);}
  function modelFor(provider,s){return provider==='gemini'?s.geminiModel:s.groqModel;}
  async function runStructuredTask(args){
    const s=settings();if(s.mode==='off')throw new Error('AI Vision е изключен.');
    if(s.mode==='puter'){lastProvider='Puter';return puterStructured({...args,model:s.puterModel});}
    if(s.mode==='gemini'||s.mode==='groq'){lastProvider=providerLabel(s.mode);return byokStructured(s.mode,{...args,model:modelFor(s.mode,s)});}
    try{
      const out=await puterStructured({...args,model:s.puterModel});lastProvider='Puter';return out;
    }catch(err){
      console.warn('BioHim 4.4: Puter failed',err);
      if(!backupReady(s)){
        const note=isLikelyPuterQuota(err)?'Puter квотата вероятно е изчерпана.':'Puter AI е недостъпен.';
        throw new Error(`${note} Добави личен Gemini/Groq API ключ в ⚙ AI настройки за автоматичен резервен режим. (${err?.message||err})`);
      }
      if(typeof toast==='function')toast(`Puter е недостъпен → преминавам към ${providerLabel(s.backupProvider)}.`);
      const out=await byokStructured(s.backupProvider,{...args,model:modelFor(s.backupProvider,s)});lastProvider=providerLabel(s.backupProvider);return out;
    }
  }
  async function generateMaterial(args){
    const s=settings();if(s.mode==='off')throw new Error('AI е изключен.');
    if(s.mode==='puter'){lastProvider='Puter';return puterGenerateMaterial({...args,puterModel:s.puterModel});}
    const prompt=buildMaterialPrompt(args);
    if(s.mode==='gemini'||s.mode==='groq'){lastProvider=providerLabel(s.mode);return byokStructured(s.mode,{prompt,attachments:Array.from(args.files||[]),model:modelFor(s.mode,s),reasoningEffort:['hard','university'].includes(args.difficulty)?'medium':'low'});}
    try{const out=await puterGenerateMaterial({...args,puterModel:s.puterModel});lastProvider='Puter';return out;}
    catch(err){
      console.warn('BioHim 4.4 material: Puter failed',err);
      if(!backupReady(s)){
        const note=isLikelyPuterQuota(err)?'Puter квотата вероятно е изчерпана.':'Puter AI е недостъпен.';
        throw new Error(`${note} Добави личен Gemini/Groq API ключ в ⚙ AI настройки за резервен режим. (${err?.message||err})`);
      }
      if(typeof toast==='function')toast(`Puter е недостъпен → материалът ще се обработи с ${providerLabel(s.backupProvider)}.`);
      const prompt=buildMaterialPrompt(args),out=await byokStructured(s.backupProvider,{prompt,attachments:Array.from(args.files||[]),model:modelFor(s.backupProvider,s),reasoningEffort:['hard','university'].includes(args.difficulty)?'medium':'low'});lastProvider=providerLabel(s.backupProvider);return out;
    }
  }

  let puterUsageTimer=null;
  function ensurePuterUsageUI(){
    document.querySelectorAll('.sidebar-foot').forEach(foot=>{
      if(foot.querySelector('#puterUsageSidebarWrap'))return;
      const wrap=document.createElement('div');
      wrap.id='puterUsageSidebarWrap';
      wrap.className='puter-usage-mini';
      wrap.innerHTML='<div class="puter-usage-mini-head"><span>☁ Puter квота</span><b id="puterUsageSidebarPct">—</b></div><div class="puter-usage-track"><i id="puterUsageSidebarBar"></i></div><div id="puterUsageSidebar" class="puter-usage-mini-text">Свържи Puter, за да видиш квотата.</div>';
      foot.appendChild(wrap);
    });
  }
  function quotaDisplayValue(value,total){
    const n=Number(value),t=Number(total);
    if(!Number.isFinite(n)||!Number.isFinite(t))return null;
    if(t<=100000)return new Intl.NumberFormat('bg-BG',{maximumFractionDigits:1}).format(Math.max(0,n));
    return null;
  }
  function paintPuterUsage({remaining=null,total=null,error='',signedIn=false,loading=false}={}){
    ensurePuterUsageUI();
    const text=document.getElementById('puterUsageText');
    const details=document.getElementById('puterUsageDetails');
    const bar=document.getElementById('puterUsageBar');
    const sideText=document.getElementById('puterUsageSidebar');
    const sidePct=document.getElementById('puterUsageSidebarPct');
    const sideBar=document.getElementById('puterUsageSidebarBar');

    if(loading){
      if(text)text.textContent='Проверявам квотата…';
      if(details)details.textContent='Данните са за текущия месец.';
      if(sideText)sideText.textContent='Проверявам…';
      if(sidePct)sidePct.textContent='…';
      return;
    }
    if(!signedIn){
      if(text)text.textContent='Свържи Puter, за да видиш квотата.';
      if(details)details.textContent='Квотата е лична за Puter акаунта и се обновява месечно.';
      if(sideText)sideText.textContent='Не е свързан';
      if(sidePct)sidePct.textContent='—';
      if(bar)bar.style.width='0%';
      if(sideBar)sideBar.style.width='0%';
      return;
    }
    if(error){
      if(text)text.textContent='Квотата временно не може да се зареди.';
      if(details)details.textContent=error;
      if(sideText)sideText.textContent='Няма данни';
      if(sidePct)sidePct.textContent='—';
      return;
    }

    const t=Number(total),r=Math.max(0,Number(remaining));
    if(!Number.isFinite(t)||t<=0||!Number.isFinite(r)){
      if(text)text.textContent='Puter не върна данни за месечната квота.';
      if(details)details.textContent='Опитай ↻ Обнови.';
      if(sideText)sideText.textContent='Няма данни';
      if(sidePct)sidePct.textContent='—';
      return;
    }
    const pct=Math.max(0,Math.min(100,(r/t)*100));
    const used=Math.max(0,t-r);
    const rDisplay=quotaDisplayValue(r,t),tDisplay=quotaDisplayValue(t,t),uDisplay=quotaDisplayValue(used,t);
    const summary=(rDisplay!==null&&tDisplay!==null)
      ? `${rDisplay} / ${tDisplay} кредита остават`
      : `${Math.round(pct)}% от месечната квота остава`;
    const detail=(uDisplay!==null&&tDisplay!==null)
      ? `${uDisplay} използвани от ${tDisplay} • месечна квота`
      : `Използвани ${Math.round(100-pct)}% • месечна квота`;

    if(text)text.textContent=summary;
    if(details)details.textContent=detail;
    if(sideText)sideText.textContent=(rDisplay!==null&&tDisplay!==null)?`${rDisplay} / ${tDisplay} остават`: `${Math.round(pct)}% остава`;
    if(sidePct)sidePct.textContent=`${Math.round(pct)}%`;
    if(bar){bar.style.width=`${pct}%`;bar.dataset.level=pct<15?'low':pct<35?'mid':'ok';}
    if(sideBar){sideBar.style.width=`${pct}%`;sideBar.dataset.level=pct<15?'low':pct<35?'mid':'ok';}
  }
  async function refreshPuterUsage(){
    try{
      requirePuter();
      if(!puter.auth.isSignedIn()){paintPuterUsage({signedIn:false});return null;}
      if(typeof puter.auth.getMonthlyUsage!=='function')throw new Error('Тази версия на Puter.js не поддържа getMonthlyUsage().');
      paintPuterUsage({signedIn:true,loading:true});
      const usage=await puter.auth.getMonthlyUsage();
      const info=usage?.allowanceInfo||{};
      paintPuterUsage({signedIn:true,remaining:info.remaining,total:info.monthUsageAllowance});
      return usage;
    }catch(e){
      console.warn('BioHim 4.4: Puter usage unavailable',e);
      paintPuterUsage({signedIn:!!window.puter?.auth?.isSignedIn?.(),error:e?.message||String(e)});
      return null;
    }
  }
  function schedulePuterUsageRefresh(delay=900){
    clearTimeout(puterUsageTimer);
    puterUsageTimer=setTimeout(()=>refreshPuterUsage(),delay);
  }

  async function refreshPuterStatus(){
    const el=document.getElementById('puterStatus');
    try{
      await ensurePuterLoaded();
      if(!puter.auth.isSignedIn()){
        if(el)el.textContent='○ Puter не е свързан. При първата AI операция ще се отвори вход.';
        paintPuterUsage({signedIn:false});
        return;
      }
      const u=await puter.auth.getUser();
      if(el)el.textContent='● Puter е свързан'+(u?.username?': '+u.username:'')+'.';
      await refreshPuterUsage();
    }catch(e){
      if(el)el.textContent='⚠ '+(e?.message||String(e));
      paintPuterUsage({signedIn:!!window.puter?.auth?.isSignedIn?.(),error:e?.message||String(e)});
    }
  }
  function updateBackupUI(){
    const s=settings(),bp=document.getElementById('backupProvider')?.value||s.backupProvider;
    const g=document.getElementById('geminiKeyRow'),q=document.getElementById('groqKeyRow');if(g)g.style.display=bp==='gemini'?'block':'none';if(q)q.style.display=bp==='groq'?'block':'none';
  }
  function updateVisionDiagnostic(){
    const el=document.getElementById('visionDiagnostic');if(!el)return;const s=settings();
    if(s.mode==='off')el.textContent='OCR-only режим. Облачен AI няма да се използва.';
    else if(s.mode==='auto')el.textContent=`✓ Автоматичен режим: Puter е основен${s.backupProvider!=='none'?` → ${providerLabel(s.backupProvider)} е резервен${hasBackupKey(s.backupProvider)?' и ключът е готов':' (липсва ключ)'}`:'; няма настроен резервен доставчик'}.`;
    else if(s.mode==='puter')el.textContent='✓ Само Puter AI. Ако личната квота свърши, заявката ще спре.';
    else el.textContent=`✓ Само ${providerLabel(s.mode)} със собствен ключ за текущата браузърна сесия.`;
    if(lastProvider)el.textContent+=` Последно използван: ${lastProvider}.`;
  }
  function installSettingsUI(){
    const box=document.querySelector('#settingsModal .modal-box');if(!box)return;
    box.innerHTML=`
      <div class="modal-head"><h3>⚙ BioHim AI — версия 4.4</h3><button class="close" onclick="closeSettings()">×</button></div>
      <p class="status" style="margin-bottom:14px"><b>Препоръка:</b> остави „Автоматичен“. BioHim използва Puter първо. Само ако Puter е недостъпен/квотата е изчерпана и си добавил личен резервен ключ, преминава към него.</p>
      <label class="label">AI РЕЖИМ</label>
      <select id="aiMode" class="select">
        <option value="auto">Автоматичен — Puter + резервен доставчик</option>
        <option value="puter">Само Puter AI</option>
        <option value="gemini">Само Gemini — собствен ключ</option>
        <option value="groq">Само Groq — собствен ключ</option>
        <option value="off">Изключен — само OCR fallback</option>
      </select>
      <label class="label" style="margin-top:12px">PUTER MODEL</label>
      <select id="puterModel" class="select">
        <option value="openai/gpt-5.6-luna">GPT-5.6 Luna — бърз</option>
        <option value="openai/gpt-5.6-terra">GPT-5.6 Terra — баланс</option>
        <option value="openai/gpt-5.6-sol">GPT-5.6 Sol — най-високо качество</option>
      </select>
      <div class="toolbar" style="margin-top:10px"><button class="secondary" type="button" onclick="biohimConnectPuter()">🔗 Свържи Puter</button><button class="secondary" type="button" onclick="biohimSignOutPuter()">Изход</button></div>
      <div id="puterStatus" class="status">Проверявам Puter статуса…</div>
      <div class="puter-usage-card">
        <div class="puter-usage-head"><div><b>Месечна Puter квота</b><small>лична за твоя Puter акаунт</small></div><button class="secondary puter-usage-refresh" type="button" onclick="biohimRefreshPuterUsage()" title="Обнови квотата">↻ Обнови</button></div>
        <div id="puterUsageText" class="puter-usage-value">Свържи Puter, за да видиш квотата.</div>
        <div class="puter-usage-track"><i id="puterUsageBar"></i></div>
        <div id="puterUsageDetails" class="tiny muted">Квотата се обновява месечно.</div>
      </div>
      <label class="label" style="margin-top:12px">РЕЗЕРВЕН ДОСТАВЧИК</label>
      <select id="backupProvider" class="select" onchange="biohimBackupChanged()">
        <option value="none">Няма</option><option value="gemini">Google Gemini</option><option value="groq">Groq</option>
      </select>
      <div id="geminiKeyRow" style="display:none;margin-top:10px"><label class="label">GEMINI API KEY</label><input id="geminiKey" class="input" type="password" autocomplete="off" placeholder="Личен Gemini API ключ"><label class="label" style="margin-top:8px">MODEL</label><input id="geminiModel" class="input" value="${DEFAULT_GEMINI_MODEL}"></div>
      <div id="groqKeyRow" style="display:none;margin-top:10px"><label class="label">GROQ API KEY</label><input id="groqKey" class="input" type="password" autocomplete="off" placeholder="Личен Groq API ключ"><label class="label" style="margin-top:8px">MODEL</label><input id="groqModel" class="input" value="${DEFAULT_GROQ_MODEL}"><div class="tiny muted" style="margin-top:5px">Groq резервният режим приема до 3 изображения в една заявка.</div></div>
      <div class="tiny muted" style="margin-top:9px">Личните резервни API ключове се пазят само в sessionStorage — изчезват след затваряне на браузърния таб/сесия и не се записват в BioHim localStorage.</div>
      <label class="label" style="margin-top:12px">OCR FALLBACK</label>
      <label style="display:flex;gap:8px;align-items:center;margin:6px 0 12px"><input id="allowOcrFallback" type="checkbox"><span>Позволи OCR fallback, ако AI Vision се провали</span></label>
      <div id="visionDiagnostic" class="status"></div>
      <div class="toolbar"><button class="secondary" onclick="saveSettings()">Запази</button><button class="primary" onclick="testAI()">Провери BioHim AI</button></div>
      <div id="aiSettingsHint" class="status">Puter работи директно през Puter.js. При резервен Gemini/Groq режим личният ключ се изпраща само за конкретната заявка през BioHim proxy и не се записва на сървъра.</div>`;
  }

  window.visionSettings=settings;
  window.saveVisionSettingsFromUI=function(){
    if(typeof state==='undefined'||!state)return;const old=state.settings||{};
    const mode=document.getElementById('aiMode')?.value||'auto',backupProvider=document.getElementById('backupProvider')?.value||'none';
    state.settings={...old,aiMode:mode,puterModel:document.getElementById('puterModel')?.value||DEFAULT_PUTER_MODEL,backupProvider,geminiModel:document.getElementById('geminiModel')?.value.trim()||DEFAULT_GEMINI_MODEL,groqModel:document.getElementById('groqModel')?.value.trim()||DEFAULT_GROQ_MODEL,allowOcrFallback:!!document.getElementById('allowOcrFallback')?.checked,key:'',endpoint:''};
    setSessionKey('gemini',document.getElementById('geminiKey')?.value.trim()||getSessionKey('gemini'));
    setSessionKey('groq',document.getElementById('groqKey')?.value.trim()||getSessionKey('groq'));
    save();
  };
  window.updateVisionDiagnostic=updateVisionDiagnostic;
  window.biohimBackupChanged=()=>{updateBackupUI();updateVisionDiagnostic();};
  window.openSettings=function(){
    const s=settings();
    const ids={aiMode:s.mode,puterModel:s.puterModel,backupProvider:s.backupProvider,geminiModel:s.geminiModel,groqModel:s.groqModel};for(const[id,v]of Object.entries(ids)){const el=document.getElementById(id);if(el)el.value=v;}
    const g=document.getElementById('geminiKey'),q=document.getElementById('groqKey'),cb=document.getElementById('allowOcrFallback');if(g)g.value=getSessionKey('gemini');if(q)q.value=getSessionKey('groq');if(cb)cb.checked=s.allowOcrFallback;
    updateBackupUI();updateVisionDiagnostic();document.getElementById('settingsModal')?.classList.remove('hidden');refreshPuterStatus();
  };
  window.closeSettings=()=>document.getElementById('settingsModal')?.classList.add('hidden');
  window.saveSettings=function(){saveVisionSettingsFromUI();updateVisionDiagnostic();closeSettings();if(typeof toast==='function')toast('✓ BioHim AI настройките са записани.');};
  window.biohimConnectPuter=async function(){try{const u=await ensureSignedIn();await refreshPuterStatus();if(typeof toast==='function')toast('✓ Puter е свързан'+(u?.username?': '+u.username:'')+'.');}catch(e){console.error(e);if(typeof toast==='function')toast('Puter входът не успя: '+e.message);}};
  window.biohimSignOutPuter=async function(){try{requirePuter();await puter.auth.signOut();await refreshPuterStatus();if(typeof toast==='function')toast('Излезе от Puter.');}catch(e){console.error(e);if(typeof toast==='function')toast('Изходът от Puter не успя.');}};
  window.biohimRefreshPuterUsage=async function(){await refreshPuterUsage();};

  window.aiVisionExtract=async function(file){
    const s=settings();if(s.mode==='off')throw new Error('AI Vision е изключен.');
    const payload=await runStructuredTask({prompt:visionExtractionPrompt(),media:file,reasoningEffort:'low'}),qs=normalizeVisionQuestions(payload);if(!qs.length)throw new Error('AI не разпозна въпроси от снимката.');updateVisionDiagnostic();return{questions:qs};
  };
  window.aiVisionSolve=async function(questions){
    const s=settings();if(s.mode==='off')return questions;
    const payload=await runStructuredTask({prompt:visionSolvePrompt(questions),reasoningEffort:'medium'}),solved=normalizeVisionQuestions(payload),byNum=new Map(solved.map(q=>[String(q.number),q]));updateVisionDiagnostic();
    return questions.map((q,i)=>{const a=byNum.get(String(q.number))||byNum.get(String(i+1));if(!a)return q;return normalizeQuestion({...q,q:a.q||q.q,a:a.a||q.a,answer:a.answer||q.answer,comboAnswer:a.comboAnswer||q.comboAnswer,matchAnswer:a.matchAnswer||q.matchAnswer,e:a.e||q.e,topic:a.topic||q.topic,type:q.type,o:q.o,subpoints:q.subpoints,comboOptions:q.comboOptions,matchLeft:q.matchLeft,matchRight:q.matchRight},i);});
  };
  window.testAI=async function(){
    const s=settings();if(s.mode==='off')return typeof toast==='function'&&toast('AI е изключен.');
    try{const out=await runStructuredTask({prompt:'Върни празен валиден списък questions.',reasoningEffort:'minimal'});await refreshPuterStatus();updateVisionDiagnostic();if(typeof toast==='function')toast(Array.isArray(out?.questions)?`✓ BioHim AI работи чрез ${lastProvider||'избрания доставчик'}.`:'⚠ AI отговорът е неочакван.');}
    catch(e){console.error(e);if(typeof toast==='function')toast('AI тестът не успя: '+e.message);}
  };
  window.BioHimAI={schema,settings,ensureSignedIn,generateMaterial,runStructuredTask,refreshPuterStatus,refreshPuterUsage};
  window.BioHimPuter=window.BioHimAI;

  // 4.4 security migration: remove legacy direct-AI keys/endpoints previously persisted in localStorage.
  try{
    if(typeof state!=='undefined'&&state?.settings&&(state.settings.key||state.settings.endpoint)){
      state.settings={...state.settings,key:'',endpoint:''};
      localStorage.setItem('biohim21-state-v2',JSON.stringify(state));
    }
  }catch(e){console.warn('BioHim 4.4 key migration:',e);}

  // Стартирай Puter login директно от потребителския click, за да не бъде блокиран popup-ът.
  const originalRunPipeline=window.runPipeline;
  if(typeof originalRunPipeline==='function')window.runPipeline=async function(...args){
    const s=settings();
    if(s.mode==='auto'||s.mode==='puter'){
      try{await ensureSignedIn();}
      catch(e){if(s.mode==='puter'||!backupReady(s)){console.error(e);if(typeof setStatus==='function')setStatus('ERROR','❌ '+e.message);if(typeof toast==='function')toast('Puter входът не успя: '+e.message);return;}console.warn('Puter sign-in failed; backup will be used',e);}
    }
    return originalRunPipeline.apply(this,args);
  };

  installSettingsUI();
  document.querySelectorAll('.logo small').forEach(el=>{el.textContent=el.textContent.replace(/Gemini AI|Puter AI\s*•\s*EXP/gi,'BioHim AI');});
  document.querySelectorAll('.sidebar-foot').forEach(el=>{el.innerHTML=el.innerHTML.replace(/Gemini AI Vision|Puter AI Vision/gi,'BioHim AI Gateway');});
  const footer=[...document.querySelectorAll('main > p')].find(p=>/Gemini AI Vision|Puter AI|BioHim AI Gateway/.test(p.textContent));if(footer)footer.textContent='BioHim 4.4 • BioHim AI Gateway • Puter + личен Gemini/Groq fallback • OCR fallback • flashcards • localStorage';
  const status=document.getElementById('status');if(status)status.textContent=status.textContent.replace(/Gemini AI Vision|Puter AI Vision/gi,'BioHim AI');
  document.querySelectorAll('.pill').forEach(el=>{el.textContent=el.textContent.replace(/Gemini генератор|Puter AI генератор/gi,'BioHim AI генератор');});
  ensurePuterUsageUI();
  refreshPuterStatus();
})();
