
(() => {
  const cfg=window.BIOHIM_V4||{subject:'biology',label:'Биология'};
  // Wake the Render service as soon as the page opens, before the user presses Analyze/Generate.
  fetch('/api/health',{cache:'no-store'}).catch(()=>{});
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function esc41(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

  function deckIdFromCard(card){
    if(card?.dataset?.deckId)return card.dataset.deckId;
    const b=card?.querySelector('button[onclick^="loadSavedDeck"]');
    const m=b?.getAttribute('onclick')?.match(/'([^']+)'/);
    return m?.[1]||'';
  }
  window.biohimToggleFavorite=function(id){
    const d=(state.deckLibrary||[]).find(x=>x.id===id);if(!d)return;
    d.favorite=!d.favorite;save();setTimeout(enhanceLibrary,0);
    if(typeof toast==='function')toast(d.favorite?'Добавено в Любими.':'Премахнато от Любими.');
  };
  let libraryObserver=null;
  function enhanceLibrary(){
    const list=document.getElementById('savedDecksList');if(!list)return;
    if(libraryObserver)libraryObserver.disconnect();
    list.querySelectorAll('.saved-deck-card').forEach(card=>{
      const id=deckIdFromCard(card);if(!id)return;
      card.dataset.deckId=id;
      const deck=(state.deckLibrary||[]).find(d=>d.id===id);if(!deck)return;
      card.dataset.createdAt=deck.createdAt||'';
      card.dataset.name=(deck.name||'').toLowerCase();
      card.dataset.favorite=deck.favorite?'1':'0';
      card.classList.toggle('is-favorite',!!deck.favorite);
      const actions=card.querySelector('.saved-deck-actions');if(!actions)return;

      let fav=actions.querySelector('.favbtn');
      if(!fav){fav=document.createElement('button');fav.className='secondary favbtn';fav.type='button';actions.prepend(fav);}
      fav.textContent=deck.favorite?'★ Любимо':'☆ Любимо';
      fav.onclick=()=>window.biohimToggleFavorite(id);

      const buttons=[...actions.querySelectorAll('button')];
      const openBtn=buttons.find(b=>/^Отвори$/i.test(b.textContent.trim()));
      const renameBtn=buttons.find(b=>/^Преименувай$/i.test(b.textContent.trim()));
      const deleteBtn=buttons.find(b=>/^Изтрий$/i.test(b.textContent.trim()));
      if(openBtn){openBtn.removeAttribute('onclick');openBtn.onclick=()=>window.loadSavedDeck(id);}
      if(renameBtn){renameBtn.removeAttribute('onclick');renameBtn.onclick=()=>window.renameSavedDeck(id);}
      if(deleteBtn){deleteBtn.removeAttribute('onclick');deleteBtn.onclick=()=>window.deleteSavedDeck(id);}
    });
    biohimFilterDeckLibrary();
    if(libraryObserver)libraryObserver.observe(list,{childList:true,subtree:false});
  }
  window.biohimFilterDeckLibrary=function(){
    const list=document.getElementById('savedDecksList');if(!list)return;const q=(document.getElementById('deckSearch')?.value||'').trim().toLowerCase(),sort=document.getElementById('deckSort')?.value||'newest';let cards=[...list.querySelectorAll('.saved-deck-card')];
    cards.forEach(c=>{const subjectOk=c.dataset.subject===cfg.subject;const text=c.textContent.toLowerCase();c.style.display=subjectOk&&(!q||text.includes(q))?'flex':'none';});
    cards.sort((a,b)=>sort==='oldest'?String(a.dataset.createdAt).localeCompare(String(b.dataset.createdAt)):sort==='name'?String(a.dataset.name).localeCompare(String(b.dataset.name),'bg'):sort==='favorites'?(Number(b.dataset.favorite)-Number(a.dataset.favorite)||String(b.dataset.createdAt).localeCompare(String(a.dataset.createdAt))):String(b.dataset.createdAt).localeCompare(String(a.dataset.createdAt)));
    cards.forEach(c=>list.appendChild(c));
  };
  window.biohimExportLibrary=function(){const payload={format:'biohim-library',version:'4.4',exportedAt:new Date().toISOString(),decks:state.deckLibrary||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='BioHim-4.4-library.biohim.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};

  const allowedSubjects41=new Set(['biology','chemistry','history-law','theory-law','human-action']);
  const allowedTypes41=new Set(['mcq','open','yesno','combo','match']);
  const safeText41=(v,max=12000)=>String(v??'').slice(0,max);
  const safeId41=v=>/^[A-Za-z0-9_-]{1,180}$/.test(String(v||''))?String(v):'';
  function safeCrop41(v){
    const s=String(v||'');
    if(!s)return'';
    if(s.length>5_500_000)return'';
    return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(s)?s:'';
  }
  function sanitizeCard41(raw,deckSubject){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Невалидна карта в импорт файла.');
    const type=allowedTypes41.has(raw.type)?raw.type:'open';
    const subject=allowedSubjects41.has(raw.subject)?raw.subject:deckSubject;
    const card={
      id:safeId41(raw.id)||('c-import-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)),
      type,subject,q:safeText41(raw.q,12000),topic:safeText41(raw.topic,500),source:safeText41(raw.source,300),createdAt:safeText41(raw.createdAt,80),
      o:Array.isArray(raw.o)?raw.o.slice(0,4).map(x=>safeText41(x,4000)):[],a:/^[A-D]$/.test(String(raw.a||''))?String(raw.a):'',
      answer:safeText41(raw.answer,8000),subpoints:Array.isArray(raw.subpoints)?raw.subpoints.slice(0,8).map(x=>safeText41(x,4000)):[],
      comboOptions:Array.isArray(raw.comboOptions)?raw.comboOptions.slice(0,12).map(x=>safeText41(x,2000)):[],comboAnswer:safeText41(raw.comboAnswer,1000),
      matchLeft:Array.isArray(raw.matchLeft)?raw.matchLeft.slice(0,8).map(x=>safeText41(x,4000)):[],matchRight:Array.isArray(raw.matchRight)?raw.matchRight.slice(0,8).map(x=>safeText41(x,4000)):[],matchAnswer:safeText41(raw.matchAnswer,1000),
      e:safeText41(raw.e,12000),crop:safeCrop41(raw.crop),sourceImageName:safeText41(raw.sourceImageName,300),sourceImageKey:safeText41(raw.sourceImageKey,500),sourceImageIndex:Number.isFinite(Number(raw.sourceImageIndex))?Number(raw.sourceImageIndex):0,
      materialGenerated:raw.materialGenerated===true
    };
    if(!card.q.trim())throw new Error('Импорт файлът съдържа карта без въпрос.');
    return card;
  }
  function sanitizeDeck41(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.cards))throw new Error('Невалидно тесте в импорт файла.');
    if(raw.cards.length>2500)throw new Error('Едно тесте не може да съдържа над 2500 карти.');
    const subject=allowedSubjects41.has(raw.subject)?raw.subject:cfg.subject;
    return {id:safeId41(raw.id),name:safeText41(raw.name,300)||'Импортирано тесте',subject,source:safeText41(raw.source,300),createdAt:safeText41(raw.createdAt,80)||new Date().toISOString(),favorite:raw.favorite===true,cards:raw.cards.map(c=>sanitizeCard41(c,subject))};
  }
  window.biohimImportLibrary=async function(file){
    if(!file)return;
    try{
      if(file.size>25*1024*1024)throw new Error('Импорт файлът е над 25 MB.');
      const data=JSON.parse(await file.text());
      const incoming=Array.isArray(data)?data:Array.isArray(data?.decks)?data.decks:[];
      if(!incoming.length)throw new Error('Няма тестета във файла.');
      if(incoming.length>250)throw new Error('Импортът съдържа твърде много тестета.');
      state.deckLibrary=Array.isArray(state.deckLibrary)?state.deckLibrary:[];
      const ids=new Set(state.deckLibrary.map(d=>d.id));let added=0;
      incoming.forEach(raw=>{let copy=sanitizeDeck41(raw);if(!copy.id||ids.has(copy.id))copy.id='deck-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);ids.add(copy.id);state.deckLibrary.unshift(copy);added++;});
      save();if(typeof renderDeck==='function')renderDeck();setTimeout(enhanceLibrary,20);toast(`Импортирани ${added} тестета.`);
    }catch(e){console.error(e);if(typeof showErrorDialog==='function')showErrorDialog('Файлът не е валиден BioHim импорт.',e?.message||'Провери файла и опитай отново.');toast('Файлът не е валиден BioHim експорт.');}
  };

  const list=document.getElementById('savedDecksList');
  if(list){
    libraryObserver=new MutationObserver(()=>setTimeout(enhanceLibrary,0));
    libraryObserver.observe(list,{childList:true,subtree:false});
  }
  setTimeout(enhanceLibrary,50);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
})();
