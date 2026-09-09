
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
  window.biohimExportLibrary=function(){const payload={format:'biohim-library',version:'4.1.3',exportedAt:new Date().toISOString(),decks:state.deckLibrary||[]};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='BioHim-4.1.3-library.biohim.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  window.biohimImportLibrary=async function(file){if(!file)return;try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:Array.isArray(data.decks)?data.decks:[];if(!incoming.length)throw new Error('Няма тестета във файла.');state.deckLibrary=Array.isArray(state.deckLibrary)?state.deckLibrary:[];const ids=new Set(state.deckLibrary.map(d=>d.id));let added=0;incoming.forEach(d=>{if(!Array.isArray(d.cards))return;let copy=clone(d);if(!copy.id||ids.has(copy.id))copy.id='deck-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);ids.add(copy.id);state.deckLibrary.unshift(copy);added++;});save();if(typeof renderDeck==='function')renderDeck();setTimeout(enhanceLibrary,20);toast(`Импортирани ${added} тестета.`);}catch(e){console.error(e);toast('Файлът не е валиден BioHim експорт.');}};

  const list=document.getElementById('savedDecksList');
  if(list){
    libraryObserver=new MutationObserver(()=>setTimeout(enhanceLibrary,0));
    libraryObserver.observe(list,{childList:true,subtree:false});
  }
  setTimeout(enhanceLibrary,50);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
})();
