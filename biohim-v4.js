
(() => {
  const cfg = window.BIOHIM_V4 || {subject:'biology',label:'Биология',icon:'🧬',color:'#13865b'};
  const subjectEl = document.getElementById('subject');
  if (subjectEl) subjectEl.value = cfg.subject;

  // Global BioHim error dialog (white body, yellow header, blurred backdrop).
  function ensureErrorDialog(){
    if(document.getElementById('biohimErrorOverlay')) return;
    const style=document.createElement('style');
    style.id='biohim-error-style';
    style.textContent=`
      .biohim-error-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,24,19,.24);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:9999}
      .biohim-error-overlay.hidden{display:none!important}
      .biohim-error-box{width:min(560px,calc(100vw - 32px));background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.18);border:1px solid rgba(0,0,0,.06)}
      .biohim-error-head{background:#e5a91f;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px}
      .biohim-error-head-left{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.04em}
      .biohim-error-icon-wrap{width:28px;height:28px;border-radius:999px;background:#fff;display:grid;place-items:center;flex:none;font-size:16px;line-height:1}
      .biohim-error-title{font-size:15px;color:#fff}
      .biohim-error-close{border:0;background:transparent;color:#fff;font-size:24px;line-height:1;font-weight:700;cursor:pointer;padding:0 4px}
      .biohim-error-body{padding:18px 18px 20px;color:#111;line-height:1.55;font-size:15px;white-space:pre-wrap;word-break:break-word}
    `;
    document.head.appendChild(style);
    const overlay=document.createElement('div');
    overlay.id='biohimErrorOverlay';
    overlay.className='biohim-error-overlay hidden';
    overlay.innerHTML=`<div class="biohim-error-box" role="alertdialog" aria-modal="true" aria-labelledby="biohimErrorTitle"><div class="biohim-error-head"><div class="biohim-error-head-left"><div class="biohim-error-icon-wrap">⚠️</div><div id="biohimErrorTitle" class="biohim-error-title">ГРЕШКА</div></div><button type="button" class="biohim-error-close" aria-label="Затвори">×</button></div><div id="biohimErrorBody" class="biohim-error-body"></div></div>`;
    document.body.appendChild(overlay);
    let returnFocus=null;
    const hide=()=>{overlay.classList.add('hidden');if(returnFocus?.focus)requestAnimationFrame(()=>returnFocus.focus());};
    overlay._biohimSetReturnFocus=el=>{returnFocus=el;};
    overlay.querySelector('.biohim-error-close')?.addEventListener('click',hide);
    overlay.addEventListener('click',e=>{ if(e.target===overlay) hide(); });
    window.addEventListener('keydown',e=>{ if(e.key==='Escape' && !overlay.classList.contains('hidden')) hide(); });
  }

  window.showErrorDialog=function(message, details=''){
    ensureErrorDialog();
    const overlay=document.getElementById('biohimErrorOverlay');
    const body=document.getElementById('biohimErrorBody');
    const text=[String(message||'Възникна грешка.'), String(details||'').trim()].filter(Boolean).join('\n\n');
    if(body) body.textContent=text;
    overlay?._biohimSetReturnFocus?.(document.activeElement);
    overlay?.classList.remove('hidden');
    requestAnimationFrame(()=>overlay?.querySelector('.biohim-error-close')?.focus());
  };

  window.addEventListener('error', function(event){
    const msg=event?.error?.message || event?.message;
    if(!msg) return;
    if(/Script error/i.test(msg)) return;
    window.showErrorDialog('Възникна грешка в приложението.', msg);
  });
  window.addEventListener('unhandledrejection', function(event){
    const reason=event?.reason;
    const msg=typeof reason==='string' ? reason : (reason?.message || 'Необработена грешка.');
    window.showErrorDialog('Възникна грешка в приложението.', msg);
  });


  // Every caught pipeline error that reaches setStatus('ERROR', ...) is also shown in the dialog.
  try{
    const previousSetStatus = typeof setStatus === 'function' ? setStatus : null;
    if(previousSetStatus){
      setStatus = function(code,text){
        previousSetStatus(code,text);
        if(String(code).toUpperCase()==='ERROR') window.showErrorDialog('Операцията не беше завършена.', String(text||'Възникна грешка.').replace(/^❌\s*/,''));
      };
    }
  }catch(e){ console.warn('BioHim status dialog hook:',e); }

  // localStorage is intentionally kept for backwards compatibility, but quota errors must never crash the app.
  // If image crops make the state too large, retry with a compact copy without crop previews.
  let storageCompactMode=false, storageWarningShown=false;
  function serializedState(compact=false){
    return JSON.stringify(state, compact ? (key,value)=>key==='crop'?'':value : undefined);
  }
  function persistStateSafely(){
    try{
      localStorage.setItem(storeKey, serializedState(storageCompactMode));
      return true;
    }catch(err){
      const quota=err?.name==='QuotaExceededError'||err?.name==='NS_ERROR_DOM_QUOTA_REACHED'||/quota|storage/i.test(String(err?.message||''));
      if(!quota) throw err;
      try{
        storageCompactMode=true;
        localStorage.setItem(storeKey, serializedState(true));
        if(!storageWarningShown){
          storageWarningShown=true;
          toast('Мястото в браузъра е почти запълнено — тестетата са записани без изрязаните снимки.');
          window.showErrorDialog('Мястото за локални данни е почти запълнено.', 'BioHim запази тестетата и статистиката, но премахна изрязаните изображения от записа, за да не загубиш данните. Експортирай библиотеката си, ако искаш резервно копие.');
        }
        return true;
      }catch(second){
        console.error('BioHim storage save failed:',second);
        window.showErrorDialog('Неуспешно локално записване.', 'Браузърът няма достатъчно свободно място. Експортирай библиотеката и освободи място за сайта.');
        return false;
      }
    }
  }
  try{
    save = function(){ persistStateSafely(); if(typeof updateAll==='function') updateAll(); };
  }catch(e){ console.warn('BioHim safe save hook:',e); }

  function labelFor(s){ const m={biology:'Биология',chemistry:'Химия','history-law':'История на държавата и правото','theory-law':'Обща теория на правото','human-action':'Човешко действие (икономика)',law:'Обща теория на правото'}; return m[s]||'Биология'; }
  function iconFor(s){ const m={biology:'🧬',chemistry:'🧪','history-law':'🏛️','theory-law':'⚖️','human-action':'📈',law:'⚖️'}; return m[s]||'🧬'; }

  // Migrate old statistics so previously recorded card IDs keep their subject when possible.
  try{
    if(!state.streakBySubject || typeof state.streakBySubject!=='object' || Array.isArray(state.streakBySubject)){
      state.streakBySubject={};
      const legacySubject=state.deck?.[0]?.subject;
      if(legacySubject && Number(state.streak)>0) state.streakBySubject[legacySubject]=Number(state.streak)||0;
    }
    const cardSubject = new Map();
    (state.deckLibrary||[]).forEach(d => (d.cards||[]).forEach(c => cardSubject.set(c.id, c.subject||d.subject)));
    (state.results||[]).forEach(r => { if(!r.subject && cardSubject.has(r.id)) r.subject = cardSubject.get(r.id); });
    if(Array.isArray(state.deck) && state.deck.length && state.deck[0].subject !== cfg.subject){
      const latest=(state.deckLibrary||[]).find(d=>d.subject===cfg.subject);
      state.deck=latest?JSON.parse(JSON.stringify(latest.cards||[])):[];
      state.currentDeckId=latest?.id||null;
      state.currentDeckName=latest?.name||'';
    }
    save();
  }catch(e){console.warn('BioHim 4.4 migration:',e)}

  // Subject-specific demo sets.
  const demos = {
    biology:[
      {type:'open',q:'Къде се извършва фотосинтезата?',answer:'В хлоропластите',e:'Фотосинтезата протича в хлоропластите на растителните клетки.',topic:'Клетъчна биология'},
      {type:'yesno',q:'Митохондриите участват в клетъчното дишане.',answer:'Да',e:'Те са основно място за аеробното клетъчно дишане.',topic:'Клетъчна биология'}
    ],
    chemistry:[
      {type:'open',q:'Каква е химичната формула на водата?',answer:'H₂O',e:'Молекулата съдържа два водородни и един кислороден атом.',topic:'Обща химия'},
      {type:'open',q:'Как се нарича частица с отрицателен електричен заряд?',answer:'Електрон',e:'Електронът е субатомна частица с отрицателен заряд.',topic:'Строеж на атома'}
    ],
    'history-law':[{type:'open',q:'Какво изучава историята на държавата и правото?',answer:'Развитието на държавните и правните институции',e:'Дисциплината проследява историческото развитие на държавата и правото.',topic:'Въведение'}],
    'theory-law':[{type:'open',q:'Какво е правна норма?',answer:'Общо правило за поведение, установено или признато от държавата',e:'Правната норма е основен елемент на правната система.',topic:'Правни норми'}],
    'human-action':[{type:'open',q:'Какво означава ограничен ресурс в икономиката?',answer:'Ресурс, който не е достатъчен за удовлетворяване на всички желания',e:'Ограничеността налага избор между алтернативи.',topic:'Основи на икономиката'}]
  };
  window.loadDemo = function(){
    questions=(demos[cfg.subject]||demos.biology).map((x,i)=>normalizeQuestion({...x,o:[],subpoints:[],comboOptions:[],source:'demo'},i));
    document.getElementById('ocrPanel')?.classList.add('hidden');
    setStatus('CHECK',`Демо по ${cfg.label}: готово за проверка.`);setStep(3,2);renderPreview();toast(`Демо: ${cfg.label}.`);
  };

  // Statistics are displayed per subject in the corresponding page.
  record = function(card,ok,source){
    state.results.push({id:card.id,ok,source,time:new Date().toISOString(),question:card.q,topic:card.topic||'Общо',subject:card.subject||cfg.subject});
    if(!ok)state.mistakes[card.id]=(state.mistakes[card.id]||0)+1;else if(state.mistakes[card.id]>0)state.mistakes[card.id]=Math.max(0,state.mistakes[card.id]-1);
    state.streakBySubject=state.streakBySubject&&typeof state.streakBySubject==='object'?state.streakBySubject:{};
    const subject=card.subject||cfg.subject;
    state.streakBySubject[subject]=ok?(Number(state.streakBySubject[subject])||0)+1:0;
    state.streak=state.streakBySubject[subject]; // legacy compatibility
    save();renderDeck();renderFocus();
  };
  renderHistory = function(){
    const el=document.getElementById('history'); if(!el)return;
    const rows=(state.results||[]).filter(r=>r.subject===cfg.subject).slice().reverse().slice(0,30);
    el.innerHTML=rows.length?rows.map(r=>`<div class="history-row"><div><b>${r.ok?'✅':'❌'} ${esc(r.question)}</b><div class="tiny muted">${esc(r.topic)} • ${new Date(r.time).toLocaleString('bg-BG')}</div></div><span class="pill">${r.ok?'знаех':'грешка'}</span></div>`).join(''):`<div class="empty">Все още няма резултати по ${cfg.label}.</div>`;
  };
  renderFocus = function(){
    const topic={};
    (state.results||[]).filter(r=>r.subject===cfg.subject).forEach(r=>{const t=r.topic||'Общо';topic[t]??={ok:0,total:0};topic[t].total++;if(r.ok)topic[t].ok++});
    const arr=Object.entries(topic).map(([t,v])=>({t,p:Math.round(v.ok/v.total*100)})).sort((a,b)=>a.p-b.p).slice(0,4);
    const el=document.getElementById('focusTopics'); if(el)el.innerHTML=arr.length?arr.map(x=>`<div class="topic"><span>${esc(x.t)}</span><b class="${x.p<60?'red':x.p<80?'yellow':'green'}">${x.p}%</b></div>`).join(''):`<div class="empty">След първата учебна сесия по ${cfg.label} тук ще се появят най-слабите теми.</div>`;
  };
  const oldUpdateAll = updateAll;
  updateAll = function(){
    const rows=(state.results||[]).filter(r=>r.subject===cfg.subject),known=rows.filter(r=>r.ok).length,wrong=rows.filter(r=>!r.ok).length;
    const totalEl=document.getElementById('total'), knownEl=document.getElementById('known'), unknownEl=document.getElementById('unknown'), accuracyEl=document.getElementById('accuracy'), streakEl=document.getElementById('streak');
    if(totalEl)totalEl.textContent=(state.deck?.[0]?.subject===cfg.subject?state.deck.length:0)||questions.length||0;
    if(knownEl)knownEl.textContent=known;if(unknownEl)unknownEl.textContent=wrong;if(accuracyEl)accuracyEl.textContent=(known+wrong)?Math.round(known/(known+wrong)*100)+'%':'—';if(streakEl)streakEl.textContent=Number(state.streakBySubject?.[cfg.subject])||0;
    const wrongCurrent=(state.deck||[]).filter(c=>c.subject===cfg.subject&&(state.mistakes[c.id]||0)>0).length;
    const ws=document.getElementById('wrongSummary');if(ws)ws.textContent=wrongCurrent+' карти чакат повторение.';
    const badge=document.getElementById('deckBadge');if(badge)badge.textContent=((state.deck?.[0]?.subject===cfg.subject?state.deck.length:0)||0)+' карти';
    renderHistory();renderFocus();
  };

  window.resetStatistics = function(){
    if(!confirm(`Да изчистя статистиката по ${cfg.label}? Запазените тестета няма да бъдат изтрити.`))return;
    state.results=(state.results||[]).filter(r=>r.subject!==cfg.subject);
    const subjectIds=new Set();
    (state.deckLibrary||[]).filter(d=>d.subject===cfg.subject).forEach(d=>(d.cards||[]).forEach(c=>subjectIds.add(c.id)));
    (state.deck||[]).filter(c=>c.subject===cfg.subject).forEach(c=>subjectIds.add(c.id));
    subjectIds.forEach(id=>delete state.mistakes[id]);
    state.streakBySubject=state.streakBySubject&&typeof state.streakBySubject==='object'?state.streakBySubject:{};state.streakBySubject[cfg.subject]=0;state.streak=0;save();updateAll();renderDeck();
    document.querySelector('.stats')?.classList.add('stats-reset-flash');setTimeout(()=>document.querySelector('.stats')?.classList.remove('stats-reset-flash'),650);
    toast(`Статистиката по ${cfg.label} е изчистена.`);
  };

  // Filter saved deck cards to the current subject while keeping one shared localStorage library.
  function filterSavedDecks(){
    const list=document.getElementById('savedDecksList'); if(!list)return;
    const cards=[...list.querySelectorAll('.saved-deck-card')];
    cards.forEach(card=>card.style.display=card.dataset.subject===cfg.subject?'flex':'none');
    const visible=cards.filter(card=>card.dataset.subject===cfg.subject).length;
    const counter=document.getElementById('savedDeckCount');if(counter)counter.textContent=`${visible} ${visible===1?'тесте':'тестета'}`;
    if(cards.length && !visible && !list.querySelector('.subject-empty')) list.insertAdjacentHTML('beforeend',`<div class="empty subject-empty">Все още няма запазени тестета по ${cfg.label}.</div>`);
    const empty=list.querySelector('.subject-empty');if(empty)empty.style.display=visible?'none':'block';
  }
  const savedList=document.getElementById('savedDecksList');if(savedList)new MutationObserver(filterSavedDecks).observe(savedList,{childList:true,subtree:true});
  setTimeout(filterSavedDecks,0);

  // Учебен материал: една или повече снимки.
  let materialFiles=[];
  let materialEncoded=[];
  const materialFile=document.getElementById('materialFile');
  const materialPreview=document.getElementById('materialPreview');
  const materialStatus=document.getElementById('materialStatus');
  const materialDropzone=document.getElementById('materialDropzone');

  function readAsDataURL(file){
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Неуспешно прочитане на файла.'));r.readAsDataURL(file);});
  }
  function materialFileKey(f){return [f.name,f.size,f.lastModified].join('|')}
  function isSupportedMaterialFile(f){
    const lower=String(f?.name||'').toLowerCase();
    return !!f && String(f.type||'').startsWith('image/');
  }
  async function encodeMaterialFiles(){
    materialEncoded=[];
    for(const f of materialFiles){
      materialEncoded.push({name:f.name,mime:f.type||'application/octet-stream',data:await readAsDataURL(f)});
    }
  }
  function renderMaterialPreview(){
    if(!materialPreview)return;
    if(!materialFiles.length){materialPreview.innerHTML='';materialPreview.classList.add('hidden');return;}
    materialPreview.innerHTML=`<div class="material-preview-grid">${materialFiles.map((f,idx)=>{
      const encoded=materialEncoded.find(x=>x.name===f.name&&x.data);
      return `<div class="preview-file-card"><img src="${encoded?.data||''}" alt="${esc(f.name)}"><button class="preview-remove" type="button" onclick="removeMaterialAttachment(${idx})" title="Премахни">×</button><div class="preview-file-name" title="${esc(f.name)}">${esc(f.name)}</div></div>`;
    }).join('')}</div>`;
    materialPreview.classList.remove('hidden');
  }
  async function setMaterialFiles(filesLike){
    const incoming=Array.from(filesLike||[]).filter(isSupportedMaterialFile);
    const rejected=Array.from(filesLike||[]).filter(f=>!isSupportedMaterialFile(f));
    if(rejected.length){
      const hasPdf=rejected.some(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name||''));
      const message=hasPdf ? 'PDF файловете вече не се поддържат в BioHim.' : 'Неподдържан файлов формат.';
      if(typeof showErrorDialog==='function') showErrorDialog(message, hasPdf ? 'Качи снимки във формат PNG, JPG или WEBP.' : 'Разрешени са само снимки във формат PNG, JPG и WEBP.');
    }
    if(!incoming.length){toast('Избери снимки.');return;}
    const byKey=new Map(materialFiles.map(f=>[materialFileKey(f),f]));
    incoming.forEach(f=>byKey.set(materialFileKey(f),f));
    const next=[...byKey.values()].slice(0,10);
    const tooLarge=next.find(f=>f.size>20*1024*1024);
    if(tooLarge){ if(typeof showErrorDialog==='function') showErrorDialog('Файлът е твърде голям.', `Файлът ${tooLarge.name} е над 20 MB.`); toast(`Файлът ${tooLarge.name} е над 20 MB.`); return;}
    const total=next.reduce((s,f)=>s+f.size,0);
    if(total>30*1024*1024){ if(typeof showErrorDialog==='function') showErrorDialog('Файловете са твърде големи.', 'Общият размер на учебните снимки трябва да е до 30 MB.'); toast('Общият размер на учебните снимки трябва да е до 30 MB.'); return;}
    materialFiles=next;
    if(materialStatus)materialStatus.textContent='Подготвям предпреглед на '+materialFiles.length+' снимк'+(materialFiles.length===1?'а':'и')+'…';
    try{
      await encodeMaterialFiles();
      renderMaterialPreview();
      if(materialStatus)materialStatus.textContent=`✓ Заредени ${materialFiles.length} снимки. BioHim AI ще ги използва като един общ материал.`;
    }catch(e){console.error(e);if(typeof showErrorDialog==='function') showErrorDialog('Не успях да прочета снимките.', e.message || 'Провери файловете и опитай отново.');toast('Не успях да прочета една от снимките.');}
  }
  window.removeMaterialAttachment=async function(index){
    materialFiles.splice(index,1);materialEncoded=[];
    if(materialFile)materialFile.value='';
    if(materialFiles.length)await encodeMaterialFiles();
    renderMaterialPreview();
    if(materialStatus)materialStatus.textContent=materialFiles.length?`✓ Заредени ${materialFiles.length} снимки.`:'Няма избрани снимки.';
  };
  window.clearMaterialAttachments=function(){
    materialFiles=[];materialEncoded=[];if(materialFile)materialFile.value='';renderMaterialPreview();
    if(materialStatus)materialStatus.textContent='Няма избрани снимки.';
  };
  window.clearMaterialAttachment=window.clearMaterialAttachments;

  if(materialFile)materialFile.addEventListener('change',e=>setMaterialFiles(e.target.files));
  if(materialDropzone){
    ['dragenter','dragover'].forEach(ev=>materialDropzone.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();materialDropzone.classList.add('drag');if(e.dataTransfer)e.dataTransfer.dropEffect='copy';}));
    ['dragleave','dragend'].forEach(ev=>materialDropzone.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();materialDropzone.classList.remove('drag');}));
    materialDropzone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();materialDropzone.classList.remove('drag');setMaterialFiles(e.dataTransfer?.files||[]);});
  }

  window.generateFromMaterial = async function(){
    if(working)return;
    const type=document.getElementById('materialType').value;
    const title=document.getElementById('materialTitle').value.trim();
    const count=Math.max(1,Math.min(30,Number(document.getElementById('materialCount').value)||10));
    const cardStyle=document.getElementById('materialCardStyle')?.value||'mixed';
    const difficulty=document.getElementById('materialDifficulty')?.value||'medium';
    if(type==='topic'&&!title&&!materialFiles.length){ if(typeof showErrorDialog==='function') showErrorDialog('Липсват данни за генериране.', 'Въведи тема или качи поне една снимка.'); return toast('Въведи тема или качи снимки.'); }
    if((type==='lesson'||type==='chapter')&&!materialFiles.length){ if(typeof showErrorDialog==='function') showErrorDialog('Липсват снимки.', 'За урок или глава качи поне една снимка.'); return toast('За урок или глава качи поне една снимка.'); }
    if(!window.BioHimAI?.generateMaterial){ if(typeof showErrorDialog==='function') showErrorDialog('BioHim AI модулът не е зареден.', 'Провери интернет връзката и презареди страницата.'); return toast('BioHim AI модулът не е зареден.'); }
    const vs=typeof visionSettings==='function'?visionSettings():{mode:'auto'};
    if(vs.mode==='off'){ if(typeof showErrorDialog==='function') showErrorDialog('BioHim AI е изключен.', 'Включи AI от настройките, за да генерираш флаш карти.'); return toast('BioHim AI е изключен в настройките.'); }

    // Опитът за Puter вход се прави директно от потребителския click, за да не бъде блокиран popup-ът.
    if(vs.mode==='auto'||vs.mode==='puter'){
      try{await window.BioHimAI.ensureSignedIn();}
      catch(e){
        const backupReady=vs.mode==='auto'&&vs.backupProvider&&vs.backupProvider!=='none'&&sessionStorage.getItem('biohim42-'+vs.backupProvider+'-key');
        if(!backupReady){console.error(e);if(materialStatus)materialStatus.textContent='❌ Puter входът не успя: '+e.message;if(typeof showErrorDialog==='function') showErrorDialog('Puter входът не успя.', e.message);return toast('Puter входът не успя: '+e.message);}
      }
    }

    working=true;
    const btn=document.querySelector('#materialGenerator .primary');if(btn)btn.disabled=true;
    if(materialStatus)materialStatus.textContent=`BioHim AI чете ${materialFiles.length||'избраните'} снимки и създава ${count} флаш карти по ${cfg.label}…`;
    try{
      const payload=await window.BioHimAI.generateMaterial({subject:cfg.subject,materialType:type,title,count,cardStyle,difficulty,files:materialFiles});
      questions=normalizeVisionQuestions(payload).map((q,idx)=>({...q,source:'AI-material',materialGenerated:true,crop:'',number:idx+1,topic:q.topic||title||cfg.label}));
      if(!questions.length)throw new Error('BioHim AI не върна флаш карти.');
      document.getElementById('ocrPanel')?.classList.add('hidden');
      renderPreview();setStep(3,2);setStatus('CHECK',`Готово: ${questions.length} BioHim AI флаш карти по ${cfg.label}. Провери ги и създай комплект.`);
      if(materialStatus)materialStatus.textContent=`✓ Създадени ${questions.length} карти от ${materialFiles.length?materialFiles.length+' снимки':'темата'}. Провери ги в секцията отдолу.`;
      document.getElementById('preview')?.scrollIntoView({behavior:'smooth',block:'start'});toast(`✓ ${questions.length} флаш карти са готови.`);updateAll();
    }catch(e){console.error(e);if(materialStatus)materialStatus.textContent='❌ Генерирането не успя: '+e.message;if(typeof showErrorDialog==='function') showErrorDialog('Неуспешно генериране на флаш карти.', e.message || 'Опитай отново.');toast('Неуспешно генериране на флаш карти.');}
    finally{working=false;if(btn)btn.disabled=false;}
  };

  // Page identity and initial refresh.
  const crumb=document.getElementById('crumb');if(crumb)crumb.textContent=cfg.label;
  renderHistory();renderFocus();updateAll();renderDeck();updateCard();filterSavedDecks();
})();
