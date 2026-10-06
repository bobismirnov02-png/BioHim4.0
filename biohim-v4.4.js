(() => {
  'use strict';

  const SUBJECTS = {
    biology: {label:'Биология', icon:'🧬'},
    chemistry: {label:'Химия', icon:'🧪'},
    'history-law': {label:'История на държавата и правото', icon:'🏛️'},
    'theory-law': {label:'Обща теория на правото', icon:'⚖️'},
    'human-action': {label:'Човешко действие (икономика)', icon:'📈'}
  };
  const cfg = window.BIOHIM_V4 || {subject:'biology',label:'Биология'};
  const letters = 'ABCDEFGH';
  const esc44 = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const subjectLabel44 = s => SUBJECTS[s]?.label || (s === 'law' ? 'Обща теория на правото' : String(s || 'Предмет'));
  window.biohimSubjectLabel = subjectLabel44;

  // 4.4 migration: the old generic "Право" bucket no longer exists.
  // Preserve old user data by moving it to the closest replacement: Обща теория на правото.
  try {
    let changed = false;
    (state.deckLibrary || []).forEach(d => {
      if (d.subject === 'law') { d.subject = 'theory-law'; changed = true; }
      (d.cards || []).forEach(c => { if (c.subject === 'law') { c.subject = 'theory-law'; changed = true; } });
    });
    (state.deck || []).forEach(c => { if (c.subject === 'law') { c.subject = 'theory-law'; changed = true; } });
    (state.results || []).forEach(r => { if (r.subject === 'law') { r.subject = 'theory-law'; changed = true; } });
    if (changed && typeof save === 'function') save();
  } catch (e) { console.warn('BioHim 4.4 law migration:', e); }

  function normalizeMatchAnswer44(value) {
    const pairs = [];
    String(value || '').split(/[;,]+/).forEach(part => {
      const m = part.trim().match(/^([A-HА-З])\s*[:=\-]\s*(\d{1,2})$/iu);
      if (!m) return;
      let left = m[1].toUpperCase();
      const cyr = {'А':'A','Б':'B','В':'C','Г':'D','Д':'E','Е':'F','Ж':'G','З':'H'};
      left = cyr[left] || left;
      pairs.push([left, Number(m[2])]);
    });
    pairs.sort((a,b)=>letters.indexOf(a[0])-letters.indexOf(b[0]));
    return pairs.map(([a,b])=>`${a}:${b}`).join('; ');
  }
  window.biohim44NormalizeMatchAnswer = normalizeMatchAnswer44;

  window.getQuestionType = function(x){
    return ['mcq','open','yesno','combo','match'].includes(x?.type) ? x.type : 'mcq';
  };
  window.typeLabel = function(t){
    return ({mcq:'Избор от 3 или 4',open:'Отворен отговор',yesno:'Да / Не',combo:'Подточки + комбинация',match:'Свързване'})[t] || 'Въпрос';
  };

  window.normalizeQuestion = function(x, idx = 0){
    const type = getQuestionType(x);
    let opts = Array.isArray(x?.o) ? x.o.map(v=>String(v??'').trim()).slice(0,4) : [];
    while (opts.length && !opts[opts.length-1]) opts.pop();
    const sub = Array.isArray(x?.subpoints) ? x.subpoints.map(v=>String(v??'').trim()).slice(0,8) : [];
    const comboOpts = Array.isArray(x?.comboOptions) ? x.comboOptions.map(v=>String(v??'').replace(/[,;]+/g,' и ').replace(/\s*и\s*/gi,' и ').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,12) : [];
    const matchLeft = Array.isArray(x?.matchLeft) ? x.matchLeft.map(v=>String(v??'').trim()).slice(0,8) : [];
    const matchRight = Array.isArray(x?.matchRight) ? x.matchRight.map(v=>String(v??'').trim()).slice(0,8) : [];
    const rawAnswer = x?.answer ?? x?.correctAnswer ?? x?.correct ?? '';
    const rawCombo = x?.comboAnswer ?? x?.correctCombination ?? x?.combination ?? '';
    const qText = typeof normalizeBlankArtifacts === 'function' ? normalizeBlankArtifacts(String(x?.q??'')) : String(x?.q??'');
    return {
      type,
      q:qText.replace(/\s+/g,' ').trim() || `Въпрос ${idx+1}`,
      o:opts,
      a:typeof normalizeLetter === 'function' ? normalizeLetter(x?.a) : String(x?.a||'').toUpperCase(),
      answer:String(rawAnswer).trim(),
      comboAnswer:String(rawCombo).trim(),
      subpoints:sub,
      comboOptions:comboOpts,
      matchLeft,
      matchRight,
      matchAnswer:normalizeMatchAnswer44(x?.matchAnswer ?? x?.matchingAnswer ?? x?.matches ?? ''),
      e:String(x?.e??'').trim(),
      topic:String(x?.topic??'').trim() || subjectLabel44(document.getElementById('subject')?.value || cfg.subject),
      number:x?.number ?? null,
      source:x?.source || 'OCR',
      materialGenerated:!!x?.materialGenerated || x?.source==='AI-material' || x?.source==='AI тема / урок / глава',
      crop:x?.crop || '', sourceImageName:x?.sourceImageName||'', sourceImageKey:x?.sourceImageKey||'', sourceImageIndex:x?.sourceImageIndex ?? 0
    };
  };

  window.validateQuestion = function(x){
    const errors=[], warnings=[], type=getQuestionType(x);
    if(!x.q || x.q.length<5) errors.push('Липсва или е твърде кратък въпрос.');
    if(type==='mcq'){
      if(![3,4].includes(x.o.length)) errors.push(`Има ${x.o.length} варианта; очакват се 3 или 4.`);
      if(x.o.some(v=>!v)) errors.push('Има празен вариант.');
      if(typeof isPlaceholderOption === 'function' && x.o.some(isPlaceholderOption)) errors.push('Има изкуствен „Вариант A/B/C/D“ — това е блокирано.');
      if(!x.a) errors.push('Няма определен правилен отговор.');
      if(x.a && 'ABCD'.indexOf(x.a)>=x.o.length) errors.push('Правилният отговор сочи липсващ вариант.');
      if(new Set(x.o.map(v=>v.toLowerCase())).size!==x.o.length) warnings.push('Има повтарящи се варианти.');
    }else if(type==='open'){
      if(!x.answer) errors.push('Няма зададен правилен текстов отговор.');
    }else if(type==='yesno'){
      if(!['Да','Не'].includes(x.answer)) errors.push('Правилният отговор трябва да е „Да“ или „Не“.');
    }else if(type==='combo'){
      if(x.subpoints.length<2) errors.push('Добави поне 2 подточки.');
      if(x.subpoints.some(v=>!v)) errors.push('Има празна подточка.');
      if(!x.comboAnswer) errors.push('Няма зададена вярна комбинация.');
      if(x.comboAnswer && x.comboOptions.length && !x.comboOptions.includes(x.comboAnswer)) errors.push('Вярната комбинация не съвпада с нито една комбинация от снимката.');
    }else if(type==='match'){
      if(x.matchLeft.length<2 || x.matchRight.length<2) errors.push('За свързване са нужни поне 2 елемента във всяка колона.');
      if(x.matchLeft.length!==x.matchRight.length) errors.push('Двете колони трябва да имат еднакъв брой елементи.');
      if(x.matchLeft.some(v=>!v)||x.matchRight.some(v=>!v)) errors.push('Има празен елемент в свързването.');
      const canonical=normalizeMatchAnswer44(x.matchAnswer);
      if(!canonical) errors.push('Няма зададен верен отговор за свързването.');
      else {
        const pairs=canonical.split(';').map(v=>v.trim()).filter(Boolean);
        const leftSeen=new Set(),rightSeen=new Set();
        pairs.forEach(p=>{const m=p.match(/^([A-H]):(\d+)$/);if(m){leftSeen.add(m[1]);rightSeen.add(Number(m[2]));}});
        if(leftSeen.size!==x.matchLeft.length) errors.push('Трябва да има връзка за всеки елемент от лявата колона.');
        if([...rightSeen].some(n=>n<1||n>x.matchRight.length)) errors.push('Има връзка към несъществуващ номер.');
        if(rightSeen.size!==x.matchRight.length) errors.push('Всеки елемент от дясната колона трябва да се използва точно веднъж.');
      }
    }
    const latin=(x.q.match(/[A-Za-z]/g)||[]).length,cyr=(x.q.match(/[А-Яа-я]/g)||[]).length;
    if(latin>=4&&latin>Math.max(2,cyr*0.25)) warnings.push('В текста има необичайно много латински букви — провери OCR.');
    return {errors,warnings};
  };

  function mcqEditor44(x,n){
    const count=Math.max(3,Math.min(4,x.o.length||3));
    while(x.o.length<count)x.o.push('');
    const rows=Array.from({length:count},(_,j)=>{const letter='ABCD'[j];return `<label class="opt"><input type="radio" name="correct-${n}" ${x.a===letter?'checked':''} onchange="setAnswer(${n},'${letter}')"><span style="flex:1"><b>${letter})</b> <textarea class="textarea optedit" data-i="${n}" data-opt="${j}" style="min-height:48px">${esc44(x.o[j]||'')}</textarea></span></label>`}).join('');
    const manage=count===3?`<button type="button" class="secondary" onclick="biohim44AddMcqOption(${n})">+ Добави вариант Г</button>`:`<button type="button" class="secondary" onclick="biohim44RemoveMcqOption(${n})">− Премахни вариант Г</button>`;
    return `<div class="opts">${rows}</div><div class="row" style="margin-top:8px">${manage}</div><div class="answer">✓ Правилен отговор: ${x.a?esc44(x.a+') '+(x.o['ABCD'.indexOf(x.a)]||'')):'не е определен'}</div>`;
  }
  function matchEditor44(x,n){
    let count=Math.max(2,Math.min(8,Math.max(x.matchLeft.length,x.matchRight.length,3)));
    while(x.matchLeft.length<count)x.matchLeft.push('');while(x.matchRight.length<count)x.matchRight.push('');
    const rows=Array.from({length:count},(_,j)=>`<div class="biohim44-match-edit-row"><div class="biohim44-match-key">${letters[j]}</div><textarea class="textarea match-left-edit" data-i="${n}" data-match="${j}" style="min-height:48px">${esc44(x.matchLeft[j]||'')}</textarea><div class="biohim44-match-key">${j+1}</div><textarea class="textarea match-right-edit" data-i="${n}" data-match="${j}" style="min-height:48px">${esc44(x.matchRight[j]||'')}</textarea></div>`).join('');
    return `<label class="label" style="margin-top:10px">ЕЛЕМЕНТИ ЗА СВЪРЗВАНЕ</label><div class="biohim44-match-editor">${rows}</div><div class="row" style="margin-top:8px"><button type="button" class="secondary" onclick="biohim44AddMatchPair(${n})">+ Добави двойка</button>${count>2?`<button type="button" class="secondary" onclick="biohim44RemoveMatchPair(${n})">− Премахни двойка</button>`:''}</div><label class="label" style="margin-top:10px">ВЕРЕН ОТГОВОР <span class="muted">напр. A:1; B:3; C:2</span></label><input class="input match-answer-edit" data-i="${n}" value="${esc44(x.matchAnswer||'')}"><div class="answer">✓ Свързване: ${esc44(x.matchAnswer||'не е определено')}</div>`;
  }

  window.renderPreview = function(){
    const box=document.getElementById('questions'); if(!box)return;
    box.innerHTML=questions.length?questions.map((raw,n)=>{
      const x=questions[n]=normalizeQuestion(raw,n),v=validateQuestion(x),type=getQuestionType(x),cls=(v.errors.length?'incomplete ':'')+(v.warnings.length?'needs-review':'');
      const badge=v.errors.length?'<span class="review-badge bad">⚠ Блокиран</span>':v.warnings.length?'<span class="review-badge warn">⚠ Провери</span>':'<span class="review-badge good">✓ Готов</span>';
      let body='';
      if(type==='mcq') body=mcqEditor44(x,n);
      else if(type==='open') body=`<label class="label" style="margin-top:10px">ПРАВИЛЕН ТЕКСТОВ ОТГОВОР</label><textarea class="textarea open-answer" data-answer-i="${n}">${esc44(x.answer||'')}</textarea><div class="answer">✓ При проверка текстът се сравнява с този отговор.</div>`;
      else if(type==='yesno') body=`<div class="boolean-grid"><button type="button" class="boolean-btn ${x.answer==='Да'?'selected':''}" onclick="setAnswer(${n},'Да')">Да</button><button type="button" class="boolean-btn ${x.answer==='Не'?'selected':''}" onclick="setAnswer(${n},'Не')">Не</button></div><div class="answer">✓ Правилен отговор: ${esc44(x.answer||'не е определен')}</div>`;
      else if(type==='combo'){
        const choices=x.comboOptions.length?x.comboOptions:comboChoices(x.subpoints.length);
        body=`<label class="label" style="margin-top:10px">ПОДТОЧКИ</label><div class="subpoints">${Array.from({length:Math.max(2,x.subpoints.length||4)},(_,j)=>`<div class="subpoint-row"><div class="subpoint-num">${j+1}</div><textarea class="textarea subedit" data-i="${n}" data-sub="${j}" style="min-height:48px">${esc44(x.subpoints[j]||'')}</textarea></div>`).join('')}</div><label class="label" style="margin-top:10px">ВЯРНА КОМБИНАЦИЯ</label><select class="select comboedit" data-i="${n}"><option value="">Избери…</option>${choices.map(c=>`<option value="${esc44(c)}" ${x.comboAnswer===c?'selected':''}>${esc44(c)} са верни</option>`).join('')}</select><div class="answer">✓ Правилна комбинация: ${esc44(x.comboAnswer||'не е определена')}</div>`;
      } else body=matchEditor44(x,n);
      return `<div class="qrow ${cls}" id="qrow-${n}"><div class="qhead"><div class="qnum">${esc44(x.number??(n+1))}</div><div style="flex:1"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="flex:1"><div class="row"><span class="type-badge">${typeLabel(type)}</span></div><label class="label" style="margin-top:9px">ВЪПРОС</label><textarea class="textarea qedit" data-i="${n}" style="min-height:72px">${esc44(x.q)}</textarea></div><div style="margin-left:10px">${badge}</div></div>${body}${v.errors.length?`<div class="validation bad">⛔ ${esc44(v.errors.join(' '))}</div>`:''}${v.warnings.length?`<div class="validation warn">⚠ ${esc44(v.warnings.join(' '))}</div>`:''}<div class="confidence">Тема: <b>${esc44(x.topic)}</b>${x.number?` • №${esc44(x.number)}`:''}</div><div class="q-actions"><button class="iconbtn" onclick="removeQuestion(${n})">🗑 Изтрий</button></div></div></div></div>`;
    }).join(''):'<div class="empty">Няма разпознати въпроси.</div>';
    box.querySelectorAll('.qedit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].q=e.target.value}));
    box.querySelectorAll('.optedit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].o[+e.target.dataset.opt]=e.target.value}));
    box.querySelectorAll('.open-answer').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.answerI].answer=e.target.value}));
    box.querySelectorAll('.subedit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].subpoints[+e.target.dataset.sub]=e.target.value}));
    box.querySelectorAll('.comboedit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].comboAnswer=e.target.value}));
    box.querySelectorAll('.match-left-edit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].matchLeft[+e.target.dataset.match]=e.target.value}));
    box.querySelectorAll('.match-right-edit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].matchRight[+e.target.dataset.match]=e.target.value}));
    box.querySelectorAll('.match-answer-edit').forEach(el=>el.addEventListener('change',e=>{questions[+e.target.dataset.i].matchAnswer=normalizeMatchAnswer44(e.target.value);renderPreview();}));
    document.getElementById('preview')?.classList.remove('hidden');
  };
  window.biohim44AddMcqOption=n=>{const x=questions[n];if(x.o.length<4)x.o.push('');renderPreview();};
  window.biohim44RemoveMcqOption=n=>{const x=questions[n];if(x.o.length>3){x.o=x.o.slice(0,3);if(x.a==='D')x.a=null;}renderPreview();};
  window.biohim44AddMatchPair=n=>{const x=questions[n];if(x.matchLeft.length<8){x.matchLeft.push('');x.matchRight.push('');}renderPreview();};
  window.biohim44RemoveMatchPair=n=>{const x=questions[n];if(x.matchLeft.length>2){x.matchLeft.pop();x.matchRight.pop();x.matchAnswer='';}renderPreview();};

  window.addQuestion = function(){
    let type=document.getElementById('questionType')?.value||'open'; if(type==='auto')type='open';
    const base={type,q:'',o:type==='mcq'?['','','']:[],a:null,answer:'',comboAnswer:'',subpoints:type==='combo'?['','','','']:[],comboOptions:[],matchLeft:type==='match'?['','','']:[],matchRight:type==='match'?['','','']:[],matchAnswer:'',e:'',topic:subjectLabel44(cfg.subject),number:null,source:'manual'};
    questions.push(base);renderPreview();document.getElementById('qrow-'+(questions.length-1))?.scrollIntoView({behavior:'smooth'});toast('Добавен е нов въпрос: '+typeLabel(type)+'.');
  };

  // Vision prompt/schema support for the fifth question type.
  window.normalizeVisionQuestions = function(payload){
    const arr=Array.isArray(payload?.questions)?payload.questions:(Array.isArray(payload)?payload:[]);
    return arr.map((x,i)=>normalizeQuestion({...x,number:x.number??(i+1),o:Array.isArray(x.o)?x.o:[],subpoints:Array.isArray(x.subpoints)?x.subpoints:[],comboOptions:Array.isArray(x.comboOptions)?x.comboOptions:[],matchLeft:Array.isArray(x.matchLeft)?x.matchLeft:[],matchRight:Array.isArray(x.matchRight)?x.matchRight:[]},i)).filter(q=>q.q&&q.q.length>=5);
  };
  window.visionExtractionPrompt = function(){
    const subject=subjectLabel44(document.getElementById('subject')?.value||cfg.subject);
    return `Ти си AI Vision модул на учебно приложение BioHim 4.4. Разгледай САМАТА СНИМКА и възстанови всички видими въпроси в реда им.\nПредмет: ${subject}.\nРазличавай пет типа: 1) mcq — 3 или 4 реални отговора A/B/C[/D]; 2) open — отворен въпрос; 3) yesno — Да/Не; 4) combo — подточки + дадени комбинации; 5) match — свързване на две колони. За match попълни matchLeft с лявата колона в ред A,B,C..., matchRight с дясната колона в ред 1,2,3..., а matchAnswer остави празен на първия етап. НЕ измисляй липсващи варианти или елементи. На първия етап не решавай: a, answer, comboAnswer и matchAnswer са празни. Върни само JSON по зададената схема.`;
  };
  window.visionSolvePrompt = function(qs){
    const subject=subjectLabel44(document.getElementById('subject')?.value||cfg.subject);
    return `Ти си вторият AI етап — учител по ${subject}. Определи правилните отговори без да добавяш нови елементи. За mcq избери само A/B/C/D от наличните 3 или 4 варианта. За open попълни кратък верен отговор. За yesno използвай Да/Не. За combo избери една от comboOptions. За match попълни matchAnswer във формат "A:1; B:3; C:2" според вече дадените matchLeft и matchRight. Ако не може надеждно — остави съответния отговор празен. Върни всички въпроси със същите номера и типове.\n\nВЪПРОСИ:\n${JSON.stringify({questions:qs},null,2)}`;
  };
  window.visionToText = function(qs){
    return qs.map(q=>{const n=(q.number??'')+'. ';if(q.type==='mcq')return n+q.q+'\n'+q.o.map((o,i)=>'ABCD'[i]+') '+o).join('\n');if(q.type==='open')return n+q.q;if(q.type==='yesno')return n+q.q+'\nДа\nНе';if(q.type==='match')return n+q.q+'\n'+q.matchLeft.map((s,i)=>letters[i]+') '+s).join('\n')+'\n'+q.matchRight.map((s,i)=>(i+1)+') '+s).join('\n');return n+q.q+'\n'+q.subpoints.map((s,i)=>(i+1)+'. '+s).join('\n')+(q.comboOptions.length?'\n'+q.comboOptions.map(c=>c).join('\n'):'');}).join('\n\n');
  };

  // Final study/test renderer. Earlier versions may prepare the visual card; this layer owns
  // interactive test controls for all five question types and prevents duplicate scoring.
  const prevUpdateCard44=window.updateCard;
  function flipAfterAnswer44(){document.getElementById('card')?.classList.add('flipped');}
  function lockTest44(container){container?.querySelectorAll('button,select,textarea,input').forEach(el=>{el.disabled=true;});}
  function score44(x,ok,container,message){
    if(container?.dataset?.answered==='1')return;
    if(container)container.dataset.answered='1';
    lockTest44(container);toast(message);flipAfterAnswer44();
    if(mode==='test')record(x,ok,'test');
  }
  function renderTestControls44(x,choices){
    if(!choices)return;
    choices.innerHTML='';
    if(mode!=='test')return;
    const type=getQuestionType(x),wrap=document.createElement('div');wrap.className='biohim44-test-controls';
    if(type==='mcq'){
      (x.o||[]).forEach((v,j)=>{const letter='ABCD'[j],b=document.createElement('button');b.type='button';b.className='choice';b.textContent=`${letter}) ${v}`;b.onclick=e=>{e.stopPropagation();const ok=letter===x.a;b.classList.add(ok?'right':'wrong');score44(x,ok,wrap,ok?'✓ Правилен отговор!':'✗ Грешен отговор — картата отива за повторение.');};wrap.appendChild(b);});
    }else if(type==='yesno'){
      ['Да','Не'].forEach(v=>{const b=document.createElement('button');b.type='button';b.className='choice';b.textContent=v;b.onclick=e=>{e.stopPropagation();const ok=v===x.answer;b.classList.add(ok?'right':'wrong');score44(x,ok,wrap,ok?'✓ Правилен отговор!':'✗ Грешен отговор — картата отива за повторение.');};wrap.appendChild(b);});
    }else if(type==='combo'){
      const opts=(x.comboOptions?.length?x.comboOptions:(typeof comboChoices==='function'?comboChoices(x.subpoints?.length||0):[]));
      opts.forEach(v=>{const b=document.createElement('button');b.type='button';b.className='choice';b.textContent=v+' са верни';b.onclick=e=>{e.stopPropagation();const ok=(typeof comboAnswerOk==='function'?comboAnswerOk(v,x.comboAnswer):String(v).trim()===String(x.comboAnswer).trim());b.classList.add(ok?'right':'wrong');score44(x,ok,wrap,ok?'✓ Правилна комбинация!':'✗ Грешна комбинация — картата отива за повторение.');};wrap.appendChild(b);});
    }else if(type==='open'){
      let input=document.getElementById('studyOpenInputFront');
      if(!input){input=document.createElement('textarea');input.className='study-input';input.placeholder='Напиши отговора си…';wrap.appendChild(input);}
      const b=document.createElement('button');b.type='button';b.className='primary';b.textContent='Провери отговора';b.onclick=e=>{e.stopPropagation();const ok=typeof openAnswerOk==='function'?openAnswerOk(input.value,x.answer):String(input.value).trim().toLowerCase()===String(x.answer||'').trim().toLowerCase();score44(x,ok,wrap,ok?'✓ Правилен отговор!':'✗ Отговорът не съвпада — картата отива за повторение.');};wrap.appendChild(b);
    }else if(type==='match'){
      const left=x.matchLeft||[],right=x.matchRight||[];
      const legend=document.createElement('div');legend.className='biohim44-match-legend';legend.innerHTML=`<div class="biohim44-match-legend-title">Свържи буквата с правилния номер</div>${right.map((v,k)=>`<div class="biohim44-match-item"><span class="biohim44-match-badge">${k+1}</span><span class="biohim44-match-text">${esc44(v)}</span></div>`).join('')}`;wrap.appendChild(legend);
      left.forEach((v,j)=>{const row=document.createElement('label');row.className='biohim44-match-response-row';row.innerHTML=`<span class="biohim44-match-left"><span class="biohim44-match-badge">${letters[j]}</span><span class="biohim44-match-text">${esc44(v)}</span></span><span class="biohim44-match-arrow" aria-hidden="true">→</span><select aria-label="Отговор за ${letters[j]}" data-left="${letters[j]}"><option value="">Избери</option>${right.map((_,k)=>`<option value="${k+1}">${k+1}</option>`).join('')}</select>`;wrap.appendChild(row);});
      const b=document.createElement('button');b.type='button';b.className='primary';b.textContent='Провери свързването';b.onclick=e=>{e.stopPropagation();const ans=[...wrap.querySelectorAll('select')].map(sel=>`${sel.dataset.left}:${sel.value}`).join('; '),ok=normalizeMatchAnswer44(ans)===normalizeMatchAnswer44(x.matchAnswer);score44(x,ok,wrap,ok?'✓ Правилно свързване!':'✗ Има грешка — картата отива за повторение.');};wrap.appendChild(b);
    }
    choices.appendChild(wrap);
  }
  window.updateCard=function(){
    if(typeof prevUpdateCard44==='function')prevUpdateCard44();
    let d;try{d=filteredDeck();}catch{return;}if(!Array.isArray(d)||!d.length)return;if(i>=d.length)i=0;
    const x=d[i],type=getQuestionType(x),choices=document.getElementById('choices'),ca=document.getElementById('ca'),ce=document.getElementById('ce'),tag=document.getElementById('tag');
    if(type==='match'){
      const left=x.matchLeft||[],right=x.matchRight||[],cq=document.getElementById('cq');
      if(tag)tag.textContent=(x.topic||subjectLabel44(x.subject||cfg.subject))+' • Свързване';
      if(cq)cq.innerHTML=`<div class="exercise-card-front biohim44-match-card"><div class="exercise-card-question biohim44-match-question">${esc44(x.q)}</div><div class="biohim44-match-study"><section class="biohim44-match-column"><div class="biohim44-match-column-title">Букви / подходи</div>${left.map((v,j)=>`<div class="biohim44-match-item"><span class="biohim44-match-badge">${letters[j]}</span><span class="biohim44-match-text">${esc44(v)}</span></div>`).join('')}</section><section class="biohim44-match-column"><div class="biohim44-match-column-title">Номера / критерии</div>${right.map((v,j)=>`<div class="biohim44-match-item"><span class="biohim44-match-badge">${j+1}</span><span class="biohim44-match-text">${esc44(v)}</span></div>`).join('')}</section></div><div class="exercise-card-type">Свързване</div></div>`;
      if(ca)ca.textContent=x.matchAnswer||'Не е определено';if(ce)ce.textContent=x.e||'Няма добавено обяснение.';
    }
    renderTestControls44(x,choices);
    document.getElementById('card')?.classList.remove('flipped');
    const controls=document.querySelector('.card-controls');if(controls)controls.style.display='none';
  };
  window.mark=function(ok){const d=filteredDeck();if(!d.length)return;const x=d[i],t=getQuestionType(x);const hasAnswer=t==='mcq'?!!x.a:t==='open'?!!x.answer:t==='yesno'?['Да','Не'].includes(x.answer):t==='combo'?!!x.comboAnswer:!!x.matchAnswer;if(!hasAnswer)return toast('Тази карта няма определен правилен отговор.');record(x,ok,'self');next();};
  const prevFlip44=window.flip;
  window.flip=function(e){
    // In test mode the answer is revealed only after an answer is submitted.
    if(mode==='test')return;
    if(typeof prevFlip44==='function')return prevFlip44(e);
  };

  // Keyboard/accessibility support for the flashcard and live status messages.
  const studyCard44=document.getElementById('card');
  if(studyCard44){
    studyCard44.setAttribute('role','button');studyCard44.setAttribute('tabindex','0');studyCard44.setAttribute('aria-label','Флаш карта. Натисни Enter или интервал, за да я обърнеш.');
    studyCard44.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('textarea,input,select,button')){e.preventDefault();window.flip(e);}});
  }
  document.getElementById('status')?.setAttribute('aria-live','polite');
  document.getElementById('toast')?.setAttribute('aria-live','polite');
  document.querySelectorAll('.modal .close').forEach(b=>{if(!b.getAttribute('aria-label'))b.setAttribute('aria-label','Затвори');});

  // Patch visible labels and question-type selector.
  document.querySelectorAll('#questionType option[value="mcq"]').forEach(o=>o.textContent='🔘 Избор от 3 или 4 отговора');
  document.querySelectorAll('#questionType').forEach(sel=>{if(!sel.querySelector('option[value="match"]')){const o=document.createElement('option');o.value='match';o.textContent='🔗 Свързване (A:1, Б:3, В:2)';sel.appendChild(o);}});
  document.querySelectorAll('#materialCardStyle').forEach(sel=>{if(!sel.querySelector('option[value="match"]')){const o=document.createElement('option');o.value='match';o.textContent='🔗 Само въпроси със свързване';sel.appendChild(o);}});
  document.querySelectorAll('.sidebar-foot').forEach(el=>{el.innerHTML=el.innerHTML.replace(/4 типа въпроси/g,'5 типа въпроси').replace(/Версия 4\.\d+(?:\.\d+)?/g,'Версия 4.4');});
  document.querySelectorAll('.logo b').forEach(el=>{if(/BioHim 4\.\d+(?:\.\d+)?/.test(el.textContent))el.textContent=el.textContent.replace(/BioHim 4\.\d+(?:\.\d+)?/,'BioHim 4.4');});
  document.querySelectorAll('.crumb').forEach(el=>{el.innerHTML=el.innerHTML.replace(/BioHim 4\.\d+(?:\.\d+)?/g,'BioHim 4.4');});

  // Refresh after migration and function overrides.
  try{if(typeof renderDeck==='function')renderDeck();if(typeof updateAll==='function')updateAll();if(typeof updateCard==='function')updateCard();}catch(e){console.warn('BioHim 4.4 refresh:',e);}
})();
