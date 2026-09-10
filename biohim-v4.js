
(() => {
  const cfg = window.BIOHIM_V4 || {subject:'biology',label:'Биология',icon:'🧬',color:'#13865b'};
  const subjectEl = document.getElementById('subject');
  if (subjectEl) subjectEl.value = cfg.subject;

  function labelFor(s){ return s==='law'?'Право':s==='chemistry'?'Химия':'Биология'; }
  function iconFor(s){ return s==='law'?'⚖️':s==='chemistry'?'🧪':'🧬'; }

  // Migrate old statistics so previously recorded card IDs keep their subject when possible.
  try{
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
  }catch(e){console.warn('BioHim 4.2 migration:',e)}

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
    law:[
      {type:'open',q:'Какво представлява Конституцията в правната система?',answer:'Основният закон на държавата',e:'Конституцията има върховна юридическа сила в националната правна система.',topic:'Конституционно право'},
      {type:'open',q:'Кои са трите класически власти при принципа на разделение на властите?',answer:'Законодателна, изпълнителна и съдебна',e:'Принципът разпределя държавната власт между трите основни функции.',topic:'Конституционно право'}
    ]
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
    state.streak=ok?(state.streak||0)+1:0;save();renderDeck();renderFocus();
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
    if(knownEl)knownEl.textContent=known;if(unknownEl)unknownEl.textContent=wrong;if(accuracyEl)accuracyEl.textContent=(known+wrong)?Math.round(known/(known+wrong)*100)+'%':'—';if(streakEl)streakEl.textContent=state.streak||0;
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
    state.streak=0;save();updateAll();renderDeck();
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

  // Учебен материал: една или повече снимки и/или PDF файлове.
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
    return !!f && (String(f.type||'').startsWith('image/') || f.type==='application/pdf' || lower.endsWith('.pdf'));
  }
  async function encodeMaterialFiles(){
    materialEncoded=[];
    for(const f of materialFiles){
      materialEncoded.push({name:f.name,mime:f.type||(/\.pdf$/i.test(f.name)?'application/pdf':'application/octet-stream'),data:await readAsDataURL(f)});
    }
  }
  function renderMaterialPreview(){
    if(!materialPreview)return;
    if(!materialFiles.length){materialPreview.innerHTML='';materialPreview.classList.add('hidden');return;}
    materialPreview.innerHTML=`<div class="material-preview-grid">${materialFiles.map((f,idx)=>{
      const encoded=materialEncoded.find(x=>x.name===f.name&&x.data);
      const pdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);
      return `<div class="preview-file-card">${pdf?'<div class="file-icon">📕</div>':`<img src="${encoded?.data||''}" alt="${esc(f.name)}">`}<button class="preview-remove" type="button" onclick="removeMaterialAttachment(${idx})" title="Премахни">×</button><div class="preview-file-name" title="${esc(f.name)}">${pdf?'PDF • ':''}${esc(f.name)}</div></div>`;
    }).join('')}</div>`;
    materialPreview.classList.remove('hidden');
  }
  async function setMaterialFiles(filesLike){
    const incoming=Array.from(filesLike||[]).filter(isSupportedMaterialFile);
    if(!incoming.length){toast('Избери изображения или PDF файлове.');return;}
    const byKey=new Map(materialFiles.map(f=>[materialFileKey(f),f]));
    incoming.forEach(f=>byKey.set(materialFileKey(f),f));
    const next=[...byKey.values()].slice(0,10);
    const tooLarge=next.find(f=>f.size>20*1024*1024);
    if(tooLarge){toast(`Файлът ${tooLarge.name} е над 20 MB.`);return;}
    const total=next.reduce((s,f)=>s+f.size,0);
    if(total>30*1024*1024){toast('Общият размер на учебните файлове трябва да е до 30 MB.');return;}
    materialFiles=next;
    if(materialStatus)materialStatus.textContent='Подготвям предпреглед на '+materialFiles.length+' файл'+(materialFiles.length===1?'':'а')+'…';
    try{
      await encodeMaterialFiles();
      renderMaterialPreview();
      if(materialStatus)materialStatus.textContent=`✓ Заредени ${materialFiles.length} учебни файла. BioHim AI ще ги използва като един общ материал.`;
    }catch(e){console.error(e);toast('Не успях да прочета един от учебните файлове.');}
  }
  window.removeMaterialAttachment=async function(index){
    materialFiles.splice(index,1);materialEncoded=[];
    if(materialFile)materialFile.value='';
    if(materialFiles.length)await encodeMaterialFiles();
    renderMaterialPreview();
    if(materialStatus)materialStatus.textContent=materialFiles.length?`✓ Заредени ${materialFiles.length} учебни файла.`:'Няма избрани учебни файлове.';
  };
  window.clearMaterialAttachments=function(){
    materialFiles=[];materialEncoded=[];if(materialFile)materialFile.value='';renderMaterialPreview();
    if(materialStatus)materialStatus.textContent='Няма избрани учебни файлове.';
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
    if(type==='topic'&&!title&&!materialFiles.length)return toast('Въведи тема или качи учебни файлове.');
    if((type==='lesson'||type==='chapter')&&!materialFiles.length)return toast('За урок или глава качи поне една снимка или PDF.');
    if(!window.BioHimAI?.generateMaterial)return toast('BioHim AI модулът не е зареден. Провери интернет връзката и презареди страницата.');
    const vs=typeof visionSettings==='function'?visionSettings():{mode:'auto'};
    if(vs.mode==='off')return toast('BioHim AI е изключен в настройките.');

    // Опитът за Puter вход се прави директно от потребителския click, за да не бъде блокиран popup-ът.
    if(vs.mode==='auto'||vs.mode==='puter'){
      try{await window.BioHimAI.ensureSignedIn();}
      catch(e){
        const backupReady=vs.mode==='auto'&&vs.backupProvider&&vs.backupProvider!=='none'&&sessionStorage.getItem('biohim42-'+vs.backupProvider+'-key');
        if(!backupReady){console.error(e);if(materialStatus)materialStatus.textContent='❌ Puter входът не успя: '+e.message;return toast('Puter входът не успя: '+e.message);}
      }
    }

    working=true;
    const btn=document.querySelector('#materialGenerator .primary');if(btn)btn.disabled=true;
    if(materialStatus)materialStatus.textContent=`BioHim AI чете ${materialFiles.length||'избраните'} файла и създава ${count} флаш карти по ${cfg.label}…`;
    try{
      const payload=await window.BioHimAI.generateMaterial({subject:cfg.subject,materialType:type,title,count,cardStyle,difficulty,files:materialFiles});
      questions=normalizeVisionQuestions(payload).map((q,idx)=>({...q,source:'AI-material',materialGenerated:true,crop:'',number:idx+1,topic:q.topic||title||cfg.label}));
      if(!questions.length)throw new Error('BioHim AI не върна флаш карти.');
      document.getElementById('ocrPanel')?.classList.add('hidden');
      renderPreview();setStep(3,2);setStatus('CHECK',`Готово: ${questions.length} BioHim AI флаш карти по ${cfg.label}. Провери ги и създай комплект.`);
      if(materialStatus)materialStatus.textContent=`✓ Създадени ${questions.length} карти от ${materialFiles.length?materialFiles.length+' файла':'темата'}. Провери ги в секцията отдолу.`;
      document.getElementById('preview')?.scrollIntoView({behavior:'smooth',block:'start'});toast(`✓ ${questions.length} флаш карти са готови.`);updateAll();
    }catch(e){console.error(e);if(materialStatus)materialStatus.textContent='❌ Генерирането не успя: '+e.message;toast('Неуспешно генериране на флаш карти.');}
    finally{working=false;if(btn)btn.disabled=false;}
  };

  // Page identity and initial refresh.
  const crumb=document.getElementById('crumb');if(crumb)crumb.textContent=cfg.label;
  renderHistory();renderFocus();updateAll();renderDeck();updateCard();filterSavedDecks();
})();
