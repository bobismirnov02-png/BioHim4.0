(() => {
  'use strict';
  const cfg = window.BIOHIM_V4 || {subject:'biology',label:'Биология'};
  const MIX_PREFIX = '__biohim_mix__:';
  const clone43 = v => JSON.parse(JSON.stringify(v));
  const esc43 = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  function isMaterialCard43(x){
    return x?.materialGenerated === true || x?.source === 'AI-material' || x?.source === 'AI тема / урок / глава';
  }
  function typeLabel43(type){
    return type === 'open' ? 'Отворен въпрос' :
      type === 'mcq' ? 'Затворен въпрос • A / B / C / D' :
      type === 'yesno' ? 'Затворен въпрос • Да / Не' :
      'Въпрос с няколко опции';
  }
  function exerciseFront43(x){
    const type = getQuestionType(x);
    let html = `<div class="exercise-card-front"><div class="exercise-card-question">${esc43(x.q)}</div>`;
    if(type === 'mcq' && Array.isArray(x.o) && x.o.length){
      html += `<div class="exercise-text-options">${x.o.slice(0,4).map((opt,j)=>`<div class="exercise-text-option"><b>${'ABCD'[j]})</b><span>${esc43(opt)}</span></div>`).join('')}</div>`;
    }else if(type === 'yesno'){
      html += `<div class="exercise-text-options" style="grid-template-columns:1fr 1fr"><div class="exercise-text-option" style="justify-content:center"><b>Да</b></div><div class="exercise-text-option" style="justify-content:center"><b>Не</b></div></div>`;
    }else if(type === 'combo'){
      if(Array.isArray(x.subpoints) && x.subpoints.length){
        html += `<div class="exercise-text-subpoints">${x.subpoints.map((sp,j)=>`<div><b>${j+1}.</b> ${esc43(sp)}</div>`).join('')}</div>`;
      }
      if(Array.isArray(x.comboOptions) && x.comboOptions.length){
        html += `<div class="exercise-combo-pills">${x.comboOptions.map(v=>`<span>${esc43(v)}</span>`).join('')}</div>`;
      }
    }
    html += `<div class="exercise-card-type">${typeLabel43(type)}</div></div>`;
    return html;
  }

  // 4.3: Section 1 cards now use the recognized written question instead of the image crop.
  const previousUpdateCard43 = window.updateCard;
  window.updateCard = function(){
    if(typeof previousUpdateCard43 === 'function') previousUpdateCard43();
    let d;
    try{ d = filteredDeck(); }catch{ return; }
    if(!Array.isArray(d) || !d.length) return;
    if(i >= d.length) i = 0;
    const x = d[i];
    if(isMaterialCard43(x)) return; // Section 2 keeps its established presentation.
    const cq = document.getElementById('cq');
    if(!cq) return;
    cq.classList.remove('has-crop');
    cq.style.width = '100%';
    cq.style.maxWidth = '100%';
    cq.innerHTML = exerciseFront43(x);
    const choices = document.getElementById('choices');
    if(choices) choices.innerHTML = '';
  };

  function currentSubjectDecks43(){
    return (Array.isArray(state.deckLibrary) ? state.deckLibrary : [])
      .filter(d => (d.subject || cfg.subject) === cfg.subject);
  }
  function cardsCount43(ids){
    const set = new Set(ids);
    return currentSubjectDecks43().filter(d=>set.has(d.id)).reduce((n,d)=>n+(Array.isArray(d.cards)?d.cards.length:0),0);
  }
  function selectedIds43(){
    return [...document.querySelectorAll('#deckMixList input[type="checkbox"]:checked')].map(x=>x.value);
  }
  function refreshMixSummary43(){
    const summary = document.getElementById('deckMixSummary');
    const openBtn = document.getElementById('deckMixOpen');
    if(!summary || !openBtn) return;
    const ids = selectedIds43();
    const cards = cardsCount43(ids);
    summary.textContent = ids.length ? `${ids.length} тестета • ${cards} карти ще бъдат заредени` : 'Не е избрано тесте.';
    openBtn.disabled = !ids.length || !cards;
  }
  function renderMixList43(){
    const list = document.getElementById('deckMixList');
    if(!list) return;
    const decks = currentSubjectDecks43();
    if(!decks.length){
      list.innerHTML = '<div class="empty" style="padding:18px">Няма запазени тестета по този предмет.</div>';
      refreshMixSummary43();
      return;
    }
    list.innerHTML = decks.map(d=>`<label class="deck-mix-row"><input type="checkbox" value="${esc43(d.id)}" checked><div class="deck-mix-row-main"><div class="deck-mix-row-title">${esc43(d.name || 'Без име')}</div><div class="deck-mix-row-meta">${(d.cards||[]).length} карти • ${esc43(d.source || '—')}</div></div></label>`).join('');
    list.querySelectorAll('input').forEach(el=>el.addEventListener('change',refreshMixSummary43));
    refreshMixSummary43();
  }
  function setAll43(checked){
    document.querySelectorAll('#deckMixList input[type="checkbox"]').forEach(el=>{el.checked=checked;});
    refreshMixSummary43();
  }
  function shuffle43(arr){
    for(let j=arr.length-1;j>0;j--){
      const k=Math.floor(Math.random()*(j+1));
      [arr[j],arr[k]]=[arr[k],arr[j]];
    }
    return arr;
  }
  window.biohim43ToggleMixMenu = function(){
    const panel = document.getElementById('deckMixPanel');
    if(!panel) return;
    const willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if(willOpen) renderMixList43();
  };
  window.biohim43SelectAllDecks = ()=>setAll43(true);
  window.biohim43ClearDeckSelection = ()=>setAll43(false);
  window.biohim43OpenSelectedDecks = function(){
    const ids = selectedIds43();
    if(!ids.length) return toast('Избери поне едно тесте.');
    const idSet = new Set(ids);
    const decks = currentSubjectDecks43().filter(d=>idSet.has(d.id));
    let cards = decks.flatMap(d => (Array.isArray(d.cards)?d.cards:[]).map(c=>clone43(c)));
    if(!cards.length) return toast('Избраните тестета нямат карти.');
    if(document.getElementById('deckMixShuffle')?.checked) cards = shuffle43(cards);
    state.deck = cards;
    state.currentDeckId = MIX_PREFIX + cfg.subject;
    state.currentDeckName = `Общо учене • ${decks.length} тестета`;
    cards.forEach(c=>{ if(state.mistakes[c.id] === undefined) state.mistakes[c.id] = 0; });
    save();
    if(typeof renderDeck === 'function') renderDeck();
    if(typeof startStudy === 'function') startStudy();
    document.getElementById('deckMixPanel')?.classList.add('hidden');
    toast(`Заредени ${decks.length} тестета • ${cards.length} карти${document.getElementById('deckMixShuffle')?.checked?' • разбъркани':''}.`);
  };

  function installMixMenu43(){
    const tools = document.getElementById('deckLibraryTools');
    const section = document.getElementById('savedDecksSection');
    if(!tools || !section || document.getElementById('deckMixTrigger')) return;
    const trigger = document.createElement('button');
    trigger.id='deckMixTrigger';
    trigger.className='secondary deck-mix-trigger';
    trigger.type='button';
    trigger.textContent='☰ Общо учене';
    trigger.onclick=window.biohim43ToggleMixMenu;
    tools.prepend(trigger);
    const panel = document.createElement('div');
    panel.id='deckMixPanel';
    panel.className='deck-mix-panel hidden';
    panel.innerHTML=`
      <div class="deck-mix-head"><div><h3>Учи няколко тестета наведнъж</h3><p>Всички запазени тестета по ${esc43(cfg.label)} са избрани по подразбиране. Махни отметката на тези, които не искаш.</p></div><button class="close" type="button" onclick="biohim43ToggleMixMenu()">×</button></div>
      <div class="row" style="margin-bottom:10px"><button class="secondary" type="button" onclick="biohim43SelectAllDecks()">✓ Всички</button><button class="secondary" type="button" onclick="biohim43ClearDeckSelection()">Изчисти избора</button></div>
      <div id="deckMixList" class="deck-mix-list"></div>
      <div class="deck-mix-actions"><label class="deck-mix-shuffle"><input id="deckMixShuffle" type="checkbox"> 🔀 Разбъркай всички карти</label><button id="deckMixOpen" class="primary" type="button" onclick="biohim43OpenSelectedDecks()">▶ Отвори избраните</button><div id="deckMixSummary" class="deck-mix-summary"></div></div>`;
    tools.insertAdjacentElement('afterend', panel);
  }

  const previousRenderDeck43 = window.renderDeck;
  if(typeof previousRenderDeck43 === 'function'){
    window.renderDeck = function(){
      previousRenderDeck43();
      if(String(state.currentDeckId || '').startsWith(MIX_PREFIX)){
        const info = document.getElementById('deckInfo');
        if(info){
          const rename = [...info.querySelectorAll('button')].find(b=>/Преименувай/i.test(b.textContent));
          if(rename) rename.style.display='none';
          const title = info.querySelector('div > div > div');
          if(title && !info.querySelector('.mixed-deck-badge')) title.insertAdjacentHTML('afterend','<span class="mixed-deck-badge">🔀 общ комплект</span>');
        }
      }
    };
  }

  installMixMenu43();
  const savedList43 = document.getElementById('savedDecksList');
  if(savedList43){
    new MutationObserver(()=>{
      const panel=document.getElementById('deckMixPanel');
      if(panel && !panel.classList.contains('hidden')) renderMixList43();
    }).observe(savedList43,{childList:true,subtree:false});
  }
})();
