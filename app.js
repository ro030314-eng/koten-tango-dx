(() => {
  'use strict';
  const DB = window.KOTEN_DX_DATA;
  const MAIN = document.getElementById('main');
  const STORAGE_KEY = 'koten-tango-dx-progress-v1';
  const DAY = 24 * 60 * 60 * 1000;
  const keys = new Set((DB?.words || []).map(w => w.id));
  const wordMap = new Map((DB?.words || []).map(w => [w.id, w]));
  const contrastPairs=[['をかし','あはれなり'],['うつくし','らうたし'],['すさまじ','すごし'],['つれなし','つらし'],['おぼつかなし','こころもとなし'],['はかなし','はかばかし'],['きよらなり','きよげなり'],['まめなり','まめまめし'],['あした','あす'],['つとめて','あかつき'],['よひ','よべ'],['あからさまなり','かりそめなり'],['いみじ','ゆゆし'],['あさまし','めざまし'],['やがて','いつしか'],['のたまふ','まうす'],['さうす','けいす'],['おはす','まうづ'],['かなし','なつかし'],['ゆかし','なつかし'],['やさし','うつくし'],['なほ','さらに']];
  const contrastFor = word => [...new Set(contrastPairs.flatMap(pair=>pair.includes(word)?pair.filter(x=>x!==word):[]))].map(x=>DB.words.find(w=>w.word===x)).filter(Boolean);
  const exampleMap = new Map();
  (DB?.contexts || []).forEach(c => { if (!exampleMap.has(c.wordId)) exampleMap.set(c.wordId, c); });
  const categories = [...new Set((DB?.words || []).map(w => w.category))];
  const grammarCats = [...new Set((DB?.mini || []).map(q => q.category))];
  const cultureCats = [...new Set((DB?.culture || []).map(q => q.category))];
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = x => Number(x || 0).toLocaleString('ja-JP');
  const $ = sel => document.querySelector(sel);
  const shuffle = arr => { let a = [...arr]; for (let i = a.length-1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
  const pad = n => String(n).padStart(2,'0');
  const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const friendly = level => ['','基礎','標準','発展'][level] || '標準';
  const meta = (label, cls='') => `<span class="pill ${cls}">${safe(label)}</span>`;
  const button = (label, action, cls='btn-outline', extra='') => `<button type="button" class="btn ${cls}" data-action="${safe(action)}" ${extra}>${label}</button>`;

  if (!DB || !Array.isArray(DB.words) || !Array.isArray(DB.contexts) || !Array.isArray(DB.mini) || !Array.isArray(DB.culture)) {
    MAIN.innerHTML = '<section class="panel"><h1>学習データを読み込めませんでした</h1><p>data.js と app.js が index.html と同じフォルダにあるか確認してください。</p></section>';
    return;
  }

  function initialStore() {return {version:1, goal:10, words:{}, bookmarks:[], days:{}, totalAnswers:0, totalCorrect:0, totalCards:0};}
  function sanitizeStore(input) {
    const out = initialStore();
    if (!input || typeof input !== 'object') return out;
    if ([5,10,15,20,30].includes(Number(input.goal))) out.goal = Number(input.goal);
    out.bookmarks = Array.isArray(input.bookmarks) ? [...new Set(input.bookmarks.filter(x => typeof x === 'string' && keys.has(x)))].slice(0,DB.words.length) : [];
    if (input.words && typeof input.words === 'object') {
      for (const [key,v] of Object.entries(input.words)) {
        if (!keys.has(key) || typeof v !== 'object' || !v) continue;
        out.words[key] = {
          reps: clamp(v.reps,0,1000), misses:clamp(v.misses,0,1000),
          interval:clamp(v.interval,0,365), dueAt:clamp(v.dueAt,0,4102444800000),
          lastAt:clamp(v.lastAt,0,4102444800000), lastCorrect:!!v.lastCorrect
        };
      }
    }
    if (input.days && typeof input.days === 'object') {
      for (const [k,v] of Object.entries(input.days).slice(-1200)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof v !== 'object' || !v) continue;
        out.days[k] = {answers:clamp(v.answers,0,100000),correct:clamp(v.correct,0,100000),cards:clamp(v.cards,0,100000)};
      }
    }
    out.totalAnswers=clamp(input.totalAnswers,0,9999999);
    out.totalCorrect=Math.min(out.totalAnswers,clamp(input.totalCorrect,0,9999999));
    out.totalCards=clamp(input.totalCards,0,9999999);
    return out;
  }
  function clamp(x,min,max){ const v=Number(x); return Number.isFinite(v)?Math.max(min,Math.min(max,Math.floor(v))):min; }
  let store;
  try {store=sanitizeStore(JSON.parse(localStorage.getItem(STORAGE_KEY)));} catch(e){store=initialStore();}
  function persist(){ try {localStorage.setItem(STORAGE_KEY,JSON.stringify(store));} catch(e){console.warn('学習記録の保存に失敗しました',e);} }
  function todayStats(){ return store.days[localDay()] || {answers:0,correct:0,cards:0}; }
  function addDay(field,count=1){const d=localDay();if(!store.days[d]) store.days[d]={answers:0,correct:0,cards:0};store.days[d][field]=(store.days[d][field]||0)+count;}
  function isDue(w){const p=store.words[w.id];return p && p.dueAt<=Date.now();}
  function dueWords(){return DB.words.filter(isDue);}
  function newWords(){return DB.words.filter(w=>!store.words[w.id]);}
  function weakWords(){return DB.words.filter(w=>{let p=store.words[w.id];return p&&(p.misses>0 || !p.lastCorrect);});}
  function streak(){let d = new Date(), n=0; if (!store.days[localDay(d)] || !sumDay(store.days[localDay(d)])) d.setDate(d.getDate()-1);for(let i=0;i<365;i++){let k=localDay(d);if(!store.days[k] || !sumDay(store.days[k]))break;n++;d.setDate(d.getDate()-1);}return n;}
  function sumDay(d){return Number(d?.answers||0)+Number(d?.cards||0);}
  function gradeWord(id,rating){
    const old=store.words[id] || {reps:0,misses:0,interval:0,dueAt:0,lastAt:0,lastCorrect:false};
    const p={...old,lastAt:Date.now(),lastCorrect:rating!==0};
    if(rating===0){p.reps=0;p.misses++;p.interval=0;p.dueAt=Date.now()+3*60*1000;}
    else if(rating===1){p.reps=Math.max(1,p.reps);p.interval=1;p.dueAt=Date.now()+DAY;}
    else {p.reps++;p.interval=p.reps<=1?2:p.reps===2?4:p.reps===3?8:p.reps===4?15:30;p.dueAt=Date.now()+p.interval*DAY;}
    store.words[id]=p;persist();
  }

  const state = {page:'home', modal:null, session:null, cards:null, detailId:null, dictSearch:'',dictCategory:'all', quizLevel:'all', quizCount:'10', miniCat:'all', cultureCat:'all', cultureLevel:'all', cultureCount:'10', contextLevel:'all', lastListLength:0};
  function nav(page){state.page=page;state.session=null;state.cards=null;state.detailId=null;state.modal=null;render(true);}
  function updateNav(){document.querySelectorAll('[data-action="nav"]').forEach(el=>{const active=el.dataset.page===state.page;el.classList.toggle('active',active);if(active) el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#header-streak').textContent=`✦ ${streak()}日連続`;}
  function render(scroll=false){
    updateNav();
    let output;
    if(state.detailId) output=detailPage();
    else if(state.page==='home') output=homePage();
    else if(state.page==='cards') output=cardsPage();
    else if(['quiz','context','mini','culture'].includes(state.page)) output=state.session?(state.session.index>=state.session.items.length?resultPage():questionPage()):practiceSetup();
    else if(state.page==='words') output=wordsPage();
    else output=homePage();
    MAIN.innerHTML=output;
    renderModal();
    if(scroll) window.scrollTo({top:0,behavior:'instant'});
  }
  function homePage(){
    const stats=todayStats();const n=stats.answers+stats.cards;const progress=Math.min(100,Math.round(n/store.goal*100));
    const due=dueWords().length, fresh=newWords().length, tracked=Object.keys(store.words).length;
    const wordOfDay=DB.words[Math.floor((Date.now()/DAY)%DB.words.length)];
    return `
    <section class="hero">
      <div>
        <div class="eyebrow">A LITTLE EVERY DAY · KOTEN TANGO DX</div>
        <h1>覚えた、を<br><em>増やそう。</em></h1>
        <p>古文単語は、眺めるだけじゃ覚えられない。<br>思い出して、間違えて、もう一度。<br>忘れかけた頃に出会える、あなたの古典学習室。</p>
        <div class="hero-actions">${button('✦ まずは今日の10問','quick','btn-primary')} ${button('▤ 単語カードをめくる','nav','btn-light','data-page="cards"')}</div>
      </div>
      <div class="hero-art" aria-hidden="true"><div class="flash-illustration"><span class="huge">をかし</span><div class="underline"></div><small>趣がある、おもしろい</small><span class="badge-sticker">覚えるぞ！</span></div></div>
    </section>
    <section class="section-space grid3 kpi-grid" aria-label="学習の状況">
      <div class="panel kpi"><div class="kpi-icon">✍</div><div><strong>${num(n)}<small class="muted"> / ${store.goal}</small></strong><span>今日の学習</span></div></div>
      <div class="panel kpi"><div class="kpi-icon">↻</div><div><strong>${num(due)}</strong><span>復習待ち</span></div></div>
      <div class="panel kpi"><div class="kpi-icon">✦</div><div><strong>${num(tracked)}<small class="muted"> / ${DB.words.length}</small></strong><span>学習した語</span></div></div>
    </section>
    <section class="section-space grid2">
      <div class="panel"><div class="section-title"><h2>今日の学習ペース</h2>${meta(progress>=100?'目標達成！':'あと'+Math.max(0,store.goal-n)+'回','pink')}</div><div class="mini-progress"><div style="width:${progress}%"></div></div><p class="muted small">カードの復習も、テストの回答も、1回ずつカウント。毎日ちょっとずつでOK。</p>${button('✦ 続けて学習する','quick','btn-soft')}</div>
      <div class="panel"><div class="section-title"><h2>今日のひとこと</h2>${meta('単語ピックアップ','gold')}</div><p class="muted tiny">見た目から意味を思い出してみよう</p><div class="pillline" style="justify-content:space-between"><div><div class="serif" style="font-size:29px;font-weight:900">${safe(wordOfDay.word)}</div><p class="muted small" style="margin:3px 0">${safe(wordOfDay.reading)}</p></div>${button('意味を見る','detail','btn-outline btn-small',`data-id="${wordOfDay.id}"`)}</div></div>
    </section>
    <section class="section-space"><div class="section-title"><h2>今日はどう学ぶ？</h2><span class="muted small">苦手も得意も、ここから。</span></div><div class="grid3">
      ${learnCard('▤','単語カード','意味を思い出してからめくる。復習のタイミングも自動管理。','cards','カードで覚える')}
      ${learnCard('✓','4択テスト','似た意味に惑わされず、中心の意味を選ぼう。','quiz','4択で確認')}
      ${learnCard('✎','文脈で解く','短い作例の中で、言葉が何を意味するか考えよう。','context','読解力を鍛える')}
      ${learnCard('◈','古典ミニ演習','助動詞・敬語・活用・和歌・漢文を軽くチェック。','mini','文法も学ぶ')}
      ${learnCard('⛩','古典常識','${DB.culture.length}問。宮中・装束・年中行事など、古文の世界を知る。','culture','古典の世界へ')}
      ${learnCard('⌕','単語帳',`${DB.words.length}語から検索。苦手な語はブックマークできる。`,'words','単語を調べる')}
      ${learnCard('↻','苦手をやり直す',`今まで間違えた語：${weakWords().length}語。もう一度挑戦。`,'weak','復習に挑戦')}
    </div></section>
    <section class="section-space inline-banner"><div><strong>初めての人は、ここから。</strong><p class="small muted">${num(fresh)}語がまだ未学習。最初は正解率より、思い出す回数を増やすのがコツ。</p></div>${button('単語帳を開く','nav','btn-outline','data-page="words"')}</section>`;
  }
  function learnCard(emoji,title,desc,page,cta){return `<div class="panel learn-card"><span class="learn-emoji" aria-hidden="true">${emoji}</span><h3>${title}</h3><p>${desc}</p><span class="card-bottom">${cta} →</span><button type="button" class="stretched" data-action="${page==='weak'?'weak':'nav'}" ${page==='weak'?'':`data-page="${page}"`} aria-label="${title}"></button></div>`;}
  function pageHead(eyebrow,title,desc,extra=''){return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${extra}</div>`;}
  function cardsPage(){
    if(state.cards){const s=state.cards;if(s.index>=s.items.length) return cardResult();const w=wordMap.get(s.items[s.index]);if(!w)return '<div class="empty">カードを表示できません。</div>';let eg=exampleMap.get(w.id);
      return `<div class="quiz-shell">
        <div class="quiz-top"><div>${meta('単語カード','pink')} <strong>${s.index+1} / ${s.items.length} 枚</strong></div><button class="subtle-link" data-action="stopCards">終了する</button></div>
        <div class="progress-track"><div class="progress-fill" style="width:${s.index/s.items.length*100}%"></div></div>
        <button class="word-stage ${s.flipped?'is-flipped':''}" data-action="flip" type="button" aria-label="${s.flipped?'意味を表示中':'タップして意味を見る'}"><div class="stage-center">
        ${s.flipped?`<span class="stage-badge">答え合わせ</span><div class="stage-word" style="font-size:29px;margin:14px 0">${safe(w.word)}</div><div class="stage-meaning">${safe(w.meaning)}</div><p class="small muted" style="margin:12px auto">${safe(w.nuance)}</p>`:`<span class="stage-badge">${safe(w.category)}・${friendly(w.level)}</span><div class="stage-word">${safe(w.word)}</div><div class="reading">${safe(w.reading)}</div>`}</div>
        <div class="stage-foot">${s.flipped?'意味を見ずに答えられた？ 下のボタンで記録しよう':'カードをタップ・クリックしてめくる　↻'}</div></button>
        ${s.flipped?`<div class="word-note"><strong>💡 覚えるコツ</strong><br>${safe(w.hook)}</div>${eg?`<div class="example-box">${highlightWord(eg.sentence,w.word)}<small>訳：${safe(eg.translation)}（DXオリジナル作例）</small></div>`:''}
          <div class="grade-buttons">
            ${button('↻ まだ…','cardGrade','btn-outline','data-rating="0"')}
            ${button('△ あやふや','cardGrade','btn-soft','data-rating="1"')}
            ${button('✓ 覚えた！','cardGrade','btn-teal','data-rating="2"')}
          </div>`:`<div class="instructions" style="margin-top:17px">答えを見ずに意味を声に出してから、カードをめくってみよう。<br><span class="muted tiny">キーボード：Spaceで裏返し、答えを見たら1・2・3で自己判定</span></div>`}
      </div>`;
    }
    let due=dueWords().length, n=newWords().length;
    return `${pageHead('MEMORY CARDS','単語カード','声に出して思い出す。3段階の自己判定で、次の復習日を調整。')}
    <div class="grid2"><div class="panel stack"><div class="pillline">${meta('いちばんおすすめ','pink')}${meta(`${due}語が復習待ち`,'green')}</div><h2>今日の復習カード</h2><p class="muted">復習期限が来た単語から優先。まだ学んでいない単語も補充します。</p>${button('復習カード15枚を始める','startCards','btn-primary','data-mode="due"')}</div>
    <div class="panel stack"><div class="pillline">${meta('すきま時間に','gold')}${meta(`${n}語が未学習`)}</div><h2>新しい単語に出会う</h2><p class="muted">未学習の単語を中心に15枚。まずは知らない語と仲良くなろう。</p>${button('新しい15枚を始める','startCards','btn-outline','data-mode="new"')}</div></div>
    <section class="section-space panel"><h2>忘れかけたころに再会する</h2><p class="muted">「まだ…」なら数分後、「あやふや」なら翌日、「覚えた！」なら少し先に復習を設定する。間隔は端末内の学習記録をもとに決まるよ。</p><div class="pillline">${meta('まだ… → すぐ復習','pink')}${meta('あやふや → 明日','gold')}${meta('覚えた！ → 数日後','green')}</div></section>`;
  }
  function cardResult(){const s=state.cards;return `<div class="quiz-shell panel result-summary"><div class="result-emblem">✦</div><h1>カード、おつかれさま！</h1><p class="muted">${s.items.length}枚をめくったね。明日以降も会いに来よう。</p><div class="result-huge">${s.items.length}<small style="font-size:25px">枚</small></div><div class="pillline" style="justify-content:center;margin-top:20px">${meta('今日の積み重ね','gold')}${meta('復習予定を更新','green')}</div><div class="pillline" style="justify-content:center;margin-top:27px">${button('ホームに戻る','nav','btn-outline','data-page="home"')}${button('もう15枚','startCards','btn-primary','data-mode="new"')}</div></div>`;}
  function selectCards(mode){let pool=[];if(mode==='due'){pool=[...shuffle(dueWords()),...shuffle(newWords()),...shuffle(DB.words)];}else{pool=[...shuffle(newWords()),...shuffle(DB.words)];} const ids=[...new Set(pool.map(w=>w.id))].slice(0,15);state.page='cards';state.cards={items:ids,index:0,flipped:false,retries:{}};state.session=null;render(true);}
  function cardGrade(rating){const s=state.cards;if(!s||!s.flipped)return;const id=s.items[s.index];gradeWord(id,rating);store.totalCards++;addDay('cards');if(rating===0 && (s.retries[id]||0)<1 && s.items.length<22){s.items.push(id);s.retries[id]=(s.retries[id]||0)+1;}persist();s.index++;s.flipped=false;render(true);}
  function practiceSetup(){
    if(state.page==='quiz') return `${pageHead('THE QUIZ ROOM','4択テスト','間違えやすい語でも、中心的な意味を思い出せる？')}
    <section class="panel stack"><div class="pillline">${meta(`${DB.words.length}語収録`,'green')}${meta('意味を選ぶ4択','pink')}</div><h2>出題設定</h2><div class="settings-strip"><div class="field"><label for="quiz-level">難易度</label><select id="quiz-level" data-field="quizLevel"><option value="all" ${state.quizLevel==='all'?'selected':''}>すべて</option><option value="1" ${state.quizLevel==='1'?'selected':''}>基礎</option><option value="2" ${state.quizLevel==='2'?'selected':''}>標準</option><option value="3" ${state.quizLevel==='3'?'selected':''}>発展</option></select></div><div class="field"><label for="quiz-count">出題数</label><select id="quiz-count" data-field="quizCount">${[5,10,20,30].map(n=>`<option value="${n}" ${state.quizCount==String(n)?'selected':''}>${n}問</option>`).join('')}</select></div><div class="setup-actions">${button('4択テストを始める','startQuiz','btn-primary')}</div></div><div class="instructions">答えを選ぶと、その場で正解と覚え方を確認。間違えた語は復習リストに記録します。</div></section>
    <section class="section-space grid2"><div class="panel stack"><h3>苦手をピンポイントで</h3><p class="muted small">間違い履歴のある単語を優先して10問。</p>${button('↻ 苦手10問','weak','btn-outline')}</div><div class="panel stack"><h3>ちょっと難しめ</h3><p class="muted small">発展ランクの単語を10問。</p>${button('★ 発展10問','advanced','btn-outline')}</div></section>`;
    if(state.page==='context')return `${pageHead('IN CONTEXT','文脈で解く','単語だけでなく、短い文章で正しい意味をつかむ練習。')}
    <div class="panel stack"><div class="pillline">${meta(`${DB.contexts.length}問のオリジナル例文`,'green')}${meta('使い方を考える','pink')}</div><h2>文の中で思い出せる？</h2><p class="muted">古文の短い作例を読み、強調された語がその文で表す意味を選ぼう。解答後には現代語訳も表示するよ。</p><div class="callout">例文は学習用のオリジナル文。古典作品の本文を引用したものではありません。</div><div class="pillline">${button('文脈10問を始める','startContext','btn-primary')}</div></div>`;
    if(state.page==='culture'){
      const available=DB.culture.filter(q=>(state.cultureCat==='all'||q.category===state.cultureCat)&&(state.cultureLevel==='all'||String(q.level)===state.cultureLevel)).length;
      return `${pageHead('KOTEN CULTURE','古典常識','時代背景が見えると、古文は読みやすくなる。暮らし・宮中・季節・和歌の知識を実戦で。',meta(`${DB.culture.length}問`,'green'))}
      <section class="panel stack culture-intro"><div class="pillline">${meta('全12分野','gold')}${meta('解説つき4択','green')}</div><h2>古典の世界へ、ようこそ。</h2><p class="muted">『源氏物語』の御簾、旧暦の七月、後朝の文。覚えた知識が、物語の意味をつなぐ。</p>
      <div class="settings-strip"><div class="field"><label for="culture-cat">分野</label><select id="culture-cat" data-field="cultureCat"><option value="all" ${state.cultureCat==='all'?'selected':''}>すべての分野</option>${cultureCats.map(c=>`<option value="${safe(c)}" ${state.cultureCat===c?'selected':''}>${safe(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="culture-level">難易度</label><select id="culture-level" data-field="cultureLevel"><option value="all" ${state.cultureLevel==='all'?'selected':''}>すべて</option>${[1,2,3].map(n=>`<option value="${n}" ${state.cultureLevel===String(n)?'selected':''}>${friendly(n)}</option>`).join('')}</select></div>
      <div class="field"><label for="culture-count">出題数</label><select id="culture-count" data-field="cultureCount">${[5,10,20,30].map(n=>`<option value="${n}" ${state.cultureCount===String(n)?'selected':''}>${n}問</option>`).join('')}</select></div>
      <div class="setup-actions">${button('古典常識を解く →','startCulture','btn-primary')}</div></div><div class="instructions">この条件で <strong>${available}問</strong> が候補。解答すると背景知識を解説します。<br>※古典の時代や立場による違いは、問題文と解説の条件に合わせて考えてね。</div></section>
      <section class="section-space"><div class="section-title"><h2>分野から選ぶ</h2><span class="muted small">気になるテーマを直接練習</span></div><div class="grid3">
      ${cultureCats.map((c,i)=>`<div class="panel learn-card culture-card"><div class="learn-emoji">${['🏯','🏡','👘','💌','🌸','🕰','🎋','⛩','🧳','📜','🌱','🎶'][i%12]}</div><h3>${safe(c)}</h3><p>${DB.culture.filter(q=>q.category===c).length}問の古典常識。読む前に知っておきたい背景を確認。</p><span class="card-bottom">この分野を解く →</span><button type="button" class="stretched" data-action="startCultureCat" data-category="${safe(c)}" aria-label="${safe(c)}の問題を解く"></button></div>`).join('')}</div></section>`;
    }
    return `${pageHead('KOTEN PLUS','古典ミニ演習','古文単語だけじゃない。助動詞・敬語・和歌・漢文の基礎も。')}
    <div class="panel stack"><div class="pillline">${meta(`${DB.mini.length}問収録`,'green')}${meta('さくっと10問','pink')}</div><h2>今日はどの分野？</h2><div class="settings-strip"><div class="field"><label for="mini-category">演習ジャンル</label><select id="mini-category" data-field="miniCat"><option value="all">すべての分野</option>${grammarCats.map(c=>`<option ${state.miniCat===c?'selected':''} value="${safe(c)}">${safe(c)}</option>`).join('')}</select></div><div class="setup-actions">${button('ミニ演習を始める','startMini','btn-primary')}</div></div></div>
    <section class="section-space grid3">${grammarCats.map((c,i)=>`<div class="panel learn-card"><div class="learn-emoji">${['✎','⌘','◈','♜','❀','◎','文'][i%7]}</div><h3>${safe(c)}</h3><p>${DB.mini.filter(q=>q.category===c).length}問のミニチェック</p><span class="card-bottom">この分野に挑戦 →</span><button type="button" class="stretched" data-action="startMini" data-category="${safe(c)}" aria-label="${safe(c)}の問題を解く"></button></div>`).join('')}</section>`;
  }
  function startPractice(kind, opts={}){
    let pool=[];
    if(kind==='quiz'){
      const level=opts.level || state.quizLevel;
      pool=DB.words.filter(w=>level==='all'||String(w.level)===String(level));
      if(opts.weak){const weakIds=new Set(weakWords().map(w=>w.id));const first=shuffle(pool.filter(w=>weakIds.has(w.id)));const rest=shuffle(pool.filter(w=>!weakIds.has(w.id)));pool=[...first,...rest];}
      else pool=shuffle(pool);
    } else if(kind==='context') pool=shuffle(DB.contexts);
    else if(kind==='culture'){
      const category=opts.category||state.cultureCat, level=opts.level||state.cultureLevel;
      pool=shuffle(DB.culture.filter(q=>(category==='all'||q.category===category)&&(level==='all'||String(q.level)===String(level))));
    } else {const category=opts.category||state.miniCat;pool=shuffle(DB.mini.filter(q=>category==='all'||q.category===category));}
    const count=Number(opts.count || (kind==='quiz'?state.quizCount:kind==='culture'?state.cultureCount:10));
    const items=pool.slice(0,Math.max(1,Math.min(30,count)));
    if(!items.length){alert('該当する問題がありません。条件を変えてください。');return;}
    state.page=kind;
    state.session={kind,items,index:0,selected:null,options:[],answer:'',correct:0,answers:[],priority:opts.weak||false};
    prepQuestion();render(true);
  }
  function prepQuestion(){const s=state.session;if(!s||s.index>=s.items.length)return;const q=s.items[s.index];let correct,choices;
    if(s.kind==='mini'||s.kind==='culture'){correct=q.options[q.correct];choices=shuffle(q.options);}
    else if(s.kind==='quiz'){correct=q.meaning;choices=shuffle([correct,...q.distractors]);}
    else {correct=q.meaning;choices=shuffle([correct,...q.distractors]);}
    s.selected=null;s.answer=correct;s.options=choices;
  }
  function questionPage(){
    const s=state.session,q=s.items[s.index],isWord=s.kind==='quiz',isContext=s.kind==='context',isMini=s.kind==='mini',isCulture=s.kind==='culture';
    const w=isContext?wordMap.get(q.wordId):(isWord?q:null);
    const questionText=isWord?`<div class="question-word">${safe(q.word)}</div><div class="reading">${safe(q.reading)}</div><div class="question-prompt">この古語の中心的な意味は？</div>`:isContext?`<div class="question-prompt context">${highlightWord(q.sentence,q.focus || w?.word)}</div><div class="question-prompt small muted">強調した古語の、この文脈での意味は？</div>`:`<div class="question-prompt" style="font-size:22px;line-height:1.85;text-align:left;margin-top:22px">${safe(q.prompt)}</div>`;
    const correct=s.selected===s.answer;const reveal=s.selected!==null;
    const choices=s.options.map((option,i)=>{
      const isRight=option===s.answer,isChosen=option===s.selected;
      const cls=reveal?(isRight?'correct':isChosen?'wrong':'faded'):'';
      return `<button type="button" class="choice ${cls}" data-action="answer" data-choice="${safe(option)}" ${reveal?'disabled':''} aria-label="${'ABCD'[i]}. ${safe(option)}"><span class="choice-index">${'ABCD'[i]}</span><span>${safe(option)}</span>${reveal&&isRight?'<span style="margin-left:auto">✓</span>':reveal&&isChosen&&!isRight?'<span style="margin-left:auto">✕</span>':''}</button>`;
    }).join('');
    const feedback=reveal?`<div class="feedback ${correct?'':'bad'}"><strong>${correct?'🎉 正解！ その調子。':'もう一度覚え直そう！'}</strong>${!correct?`<div class="answer-value">正解：${safe(s.answer)}</div>`:''}
      <p>${(isMini||isCulture)?safe(q.explanation):isContext?`現代語訳：${safe(q.translation)}`:`${safe(w.nuance)}`}</p>
      ${!(isMini||isCulture)?`<p><strong>💡 覚えるコツ：</strong>${safe(w.hook)}</p>`:''}
      <div class="nextrow">${!(isMini||isCulture)?button('単語を詳しく見る','detail','btn-outline btn-small',`data-id="${w.id}"`):''}${button(s.index===s.items.length-1?'結果を見る →':'次の問題 →','next','btn-primary')}</div></div>`:'';
    return `<section class="quiz-shell"><div class="quiz-top"><div class="pillline">${meta(isCulture?'古典常識':isMini?'古典ミニ演習':isContext?'文脈で解く':'4択テスト','pink')}${meta((isCulture||isMini)?q.category:isWord?friendly(w.level):'オリジナル例文')}${isCulture?meta(friendly(q.level),'gold'):''}</div><button class="subtle-link" data-action="leavePractice">終了する</button></div>
      <div class="side-points"><strong>問題 ${s.index+1} / ${s.items.length}</strong><span class="muted small">正解 ${s.correct}問</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.round((s.index+Number(reveal))/s.items.length*100)}%"></div></div>
      <div class="question-card"><div class="question-label">QUESTION ${pad(s.index+1)} / ${pad(s.items.length)}</div>${questionText}<div class="choice-list">${choices}</div>${feedback}</div><p class="lesson-note" style="text-align:center;margin-top:17px">${reveal?'解説を確認したら次の問題へ。':'キーボード 1〜4：選択肢を回答'}</p></section>`;
  }
  function highlightWord(sentence,word){
    if(!word)return safe(sentence);
    const index=sentence.indexOf(word);
    if(index<0)return safe(sentence);
    return safe(sentence.slice(0,index))+'<mark class="highlight-word">'+safe(word)+'</mark>'+safe(sentence.slice(index+word.length));
  }
  function answerQuestion(choice){const s=state.session;if(!s||s.selected!==null||s.index>=s.items.length||!s.options.includes(choice))return;
    const q=s.items[s.index];const correct=choice===s.answer;s.selected=choice;
    if(correct)s.correct++;
    const label=(s.kind==='mini'||s.kind==='culture')?q.prompt:s.kind==='quiz'?q.word:q.sentence;
    const item={label,selected:choice,answer:s.answer,correct,explanation:s.kind==='culture'?q.explanation:'',wordId:(s.kind==='mini'||s.kind==='culture')?null:(s.kind==='quiz'?q.id:q.wordId)};
    s.answers.push(item);
    store.totalAnswers++;if(correct)store.totalCorrect++;addDay('answers');if(correct)addDay('correct');
    if(item.wordId)gradeWord(item.wordId,correct?1:0);
    persist();render(false);
  }
  function resultPage(){const s=state.session;const pct=Math.round(s.correct/s.items.length*100);return `<div class="quiz-shell">
    <section class="panel result-summary"><div class="result-emblem">${pct>=80?'🏵':pct>=50?'✦':'✎'}</div><div class="eyebrow">SESSION COMPLETE</div><h1 style="font-size:34px;margin:9px auto">今日もよくがんばった！</h1><p class="muted">${pct>=80?'かなり身についているね。この調子で！':pct>=50?'間違えたものこそ次の得点源。復習しよう。':'ここからがスタート。もう一度会えば覚えやすくなる。'}</p><div class="result-huge">${s.correct}<small style="font-size:25px;color:var(--muted)"> / ${s.items.length}</small></div><p class="muted">正答率 ${pct}%</p>
    <div class="pillline" style="justify-content:center;margin-top:24px">${button('↻ もう10問','retry','btn-primary')}${button('⌂ ホーム','nav','btn-outline','data-page="home"')}</div></section>
    <section class="panel section-space"><div class="section-title"><h2>答え合わせ</h2>${meta(`${s.answers.length}問`)}</div><ul class="result-list">${s.answers.map(a=>`<li><span style="min-width:0">${safe(a.label)}<small class="muted" style="display:block">${safe(a.answer)}</small>${a.explanation?`<small class="muted" style="display:block;margin-top:3px;line-height:1.7">${safe(a.explanation)}</small>`:''}</span><span class="${a.correct?'good':'bad'}">${a.correct?'✓ 正解':'× 見直し'}</span></li>`).join('')}</ul></section></div>`;}
  function wordsPage(){const list=filteredWords();return `${pageHead('THE WORD LIBRARY','単語帳','気になる古語を検索して、意味・語感・注意点を確認。',meta(`${DB.words.length}語`,'green'))}
    <div class="search-area"><input id="dict-search" aria-label="古語を検索" type="search" placeholder="古語・読み・意味で検索…" value="${safe(state.dictSearch)}" autocomplete="off" data-field="dictSearch"><select aria-label="分野で絞り込み" data-field="dictCategory" id="dict-cat"><option value="all">すべての種類</option><option value="fav" ${state.dictCategory==='fav'?'selected':''}>★ 保存した語</option><option value="weak" ${state.dictCategory==='weak'?'selected':''}>↻ 苦手な語</option>${categories.map(c=>`<option value="${safe(c)}" ${state.dictCategory===c?'selected':''}>${safe(c)}</option>`).join('')}</select></div>
    <div class="section-title"><span id="dictionary-count" class="muted small">${list.length}語が見つかりました</span><span class="muted tiny">単語をタップして詳しく見る →</span></div><div class="word-list" id="dictionary-list">${renderWordItems(list)}</div>`;}
  function filteredWords(){const q=state.dictSearch.trim().toLowerCase();const bookmarkIds=new Set(store.bookmarks);const weakIds=new Set(weakWords().map(w=>w.id));
    return DB.words.filter(w=>{if(state.dictCategory==='fav'&&!bookmarkIds.has(w.id))return false;if(state.dictCategory==='weak'&&!weakIds.has(w.id))return false;if(state.dictCategory!=='all'&&state.dictCategory!=='fav'&&state.dictCategory!=='weak'&&w.category!==state.dictCategory)return false;
      if(q && ![w.word,w.reading,w.meaning,w.nuance].some(x=>x.toLowerCase().includes(q)))return false;return true;});}
  function renderWordItems(list){if(!list.length)return '<div class="panel empty"><span class="empty-emoji">⌕</span>該当する単語はありません。条件を変えてみよう。</div>';
    return list.map(w=>`<button class="word-row" data-action="detail" data-id="${w.id}" type="button"><span class="word-cell"><span class="term">${safe(w.word)}</span><span class="pill" style="font-size:10px;margin-left:5px">${friendly(w.level)}</span><span class="meaning" style="display:block">${safe(w.meaning)}</span></span>${store.bookmarks.includes(w.id)?'<span style="color:var(--coral)">★</span>':''}<span class="arrow">›</span></button>`).join('');}
  function detailPage(){const w=wordMap.get(state.detailId);if(!w)return wordsPage();const example=exampleMap.get(w.id);const fav=store.bookmarks.includes(w.id);const p=store.words[w.id];
    return `<div class="word-detail"><button class="subtle-link" data-action="backDetail">← ${state.page==='words'?'単語帳':'学習画面'}にもどる</button>
    <div class="detail-hero" style="margin-top:15px"><div class="pillline" style="justify-content:center">${meta(w.category,'pink')}${meta(friendly(w.level))}${p?meta('学習済み','green'):meta('未学習')}</div><div class="detail-term">${safe(w.word)}</div><p class="reading">${safe(w.reading)}</p><div class="separator"></div><div class="detail-meaning">${safe(w.meaning)}</div><p class="muted" style="text-align:center;margin:13px auto">${safe(w.nuance)}</p><div class="pillline" style="justify-content:center;margin-top:24px">${button(fav?'★ 保存を解除':'☆ 苦手リストに保存','bookmark','btn-outline',`data-id="${w.id}"`)}</div></div>
    <div class="panel section-space"><div class="eyebrow">MEMORY HOOK</div><h2>💡 覚えるコツ</h2><p>${safe(w.hook)}</p>${example?`<div class="separator"></div><div class="eyebrow">IN A SENTENCE</div><h2>✎ 作例で確認</h2><div class="example-box">${highlightWord(example.sentence,example.focus || w.word)}<small>訳：${safe(example.translation)}</small></div><p class="tiny muted">この例文は学習用のオリジナル作例です。</p>`:''}</div>${contrastFor(w.word).length?`<section class="panel section-space"><div class="eyebrow">DON'T MIX THEM UP</div><h2>まぎらわしい単語と比べる</h2><p class="muted small">違いを言葉にすると、記憶に残りやすくなるよ。</p>${contrastFor(w.word).map(other=>`<button class="word-row" style="width:100%;margin-top:10px" data-action="detail" data-id="${other.id}"><span class="word-cell"><span class="term">${safe(other.word)}</span><span class="meaning" style="display:block">${safe(other.meaning)}</span></span><span class="arrow">›</span></button>`).join('')}</section>`:''}</div>`;
  }
  function renderModal(){let old=$('#modal-root');if(old)old.remove();if(!state.modal)return;
    let inner='';if(state.modal==='settings')inner=`<h2>⚙ 学習データ・設定</h2><p class="muted small">学習記録はこの端末のブラウザに保存します。機種変更前にはバックアップを。</p><div class="setting-row"><div><strong>一日の目標</strong><div class="muted small">カード＋クイズの学習回数</div></div><select data-field="dailyGoal" aria-label="一日の学習目標">${[5,10,15,20,30].map(x=>`<option value="${x}" ${store.goal===x?'selected':''}>${x}回</option>`).join('')}</select></div><div class="setting-row"><div><strong>これまでのクイズ</strong><div class="muted small">${num(store.totalAnswers)}問回答・${num(store.totalCorrect)}問正解</div></div></div><div class="setting-row"><div><strong>これまでの単語カード</strong><div class="muted small">${num(store.totalCards)}回復習</div></div></div><div class="separator"></div><div class="stack">${button('↓ 学習記録をバックアップ','export','btn-outline')}<label class="btn btn-outline" style="text-align:center">↑ バックアップから復元<input id="import-data" type="file" accept="application/json,.json" hidden></label>${button('学習記録をリセット','reset','btn-soft')}</div><p class="lesson-note" style="margin-top:15px">データの転送先はありません。バックアップを作成するとJSONファイルが端末に保存されます。復元すると現在の記録を置き換えます。</p>`;
    const node=document.createElement('div');node.id='modal-root';node.className='modal-backdrop';node.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="設定"><button class="close" type="button" data-action="closeModal" aria-label="閉じる">×</button>${inner}</div>`;document.body.appendChild(node);
  }
  function updateDictList(){const list=filteredWords();const node=$('#dictionary-list'),count=$('#dictionary-count');if(node)node.innerHTML=renderWordItems(list);if(count)count.textContent=`${list.length}語が見つかりました`;}
  function exportStore(){const blob=new Blob([JSON.stringify({application:'koten-tango-dx',savedAt:new Date().toISOString(),progress:store},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`koten-tango-dx-backup-${localDay()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
  function importStore(file){if(!file)return;if(file.size>4*1024*1024){alert('ファイルが大きすぎます。');return;}const r=new FileReader();r.onload=()=>{try{const json=JSON.parse(String(r.result));if(json?.application!=='koten-tango-dx'||!json?.progress||!json.progress.words){throw new Error('古典単語DXのバックアップファイルではありません。');}if(!confirm('今の学習記録をバックアップの記録で置き換えますか？'))return;store=sanitizeStore(json.progress);persist();state.modal=null;render(true);alert('学習記録を復元しました。');}catch(e){alert('バックアップを読み込めませんでした：'+e.message);}};r.onerror=()=>alert('ファイルを読み込めませんでした。');r.readAsText(file);}

  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-action]');if(!el)return;
    const action=el.dataset.action;
    if(action==='nav'){nav(el.dataset.page);return;}
    if(action==='settings'){state.modal='settings';renderModal();return;}
    if(action==='closeModal'){state.modal=null;renderModal();return;}
    if(action==='detail'){state.detailId=el.dataset.id;render(true);return;}
    if(action==='backDetail'){state.detailId=null;render(true);return;}
    if(action==='bookmark'){const id=el.dataset.id;if(!keys.has(id))return;store.bookmarks=store.bookmarks.includes(id)?store.bookmarks.filter(x=>x!==id):[...store.bookmarks,id];persist();render(false);return;}
    if(action==='startCards'){selectCards(el.dataset.mode||'due');return;}
    if(action==='flip'){if(state.cards){state.cards.flipped=!state.cards.flipped;render(false);}return;}
    if(action==='cardGrade'){cardGrade(Number(el.dataset.rating));return;}
    if(action==='stopCards'){state.cards=null;render(true);return;}
    if(action==='startQuiz'){startPractice('quiz');return;}
    if(action==='quick'){startPractice('quiz',{count:10});return;}
    if(action==='advanced'){startPractice('quiz',{count:10,level:'3'});return;}
    if(action==='weak'){startPractice('quiz',{count:10,weak:true});return;}
    if(action==='startContext'){startPractice('context',{count:10});return;}
    if(action==='startMini'){startPractice('mini',{count:10,category:el.dataset.category||state.miniCat});return;}
    if(action==='startCulture'){startPractice('culture');return;}
    if(action==='startCultureCat'){state.cultureCat=el.dataset.category;state.cultureLevel='all';startPractice('culture',{count:10,category:el.dataset.category,level:'all'});return;}
    if(action==='answer'){answerQuestion(el.dataset.choice);return;}
    if(action==='next'){const s=state.session;if(s&&s.selected!==null){s.index++;prepQuestion();render(true);}return;}
    if(action==='retry'){if(state.session){const kind=state.session.kind;startPractice(kind,{count:10});}return;}
    if(action==='leavePractice'){state.session=null;render(true);return;}
    if(action==='export'){exportStore();return;}
    if(action==='reset'){if(confirm('すべての学習記録を消去します。元には戻せません。よろしいですか？')){store=initialStore();persist();state.modal=null;render(true);}return;}
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='import-data'){importStore(el.files?.[0]);return;}
    if(!el.dataset.field)return;
    switch(el.dataset.field){
      case 'quizLevel':state.quizLevel=el.value;break;
      case 'quizCount':state.quizCount=el.value;break;
      case 'miniCat':state.miniCat=el.value;break;
      case 'cultureCat':state.cultureCat=el.value;render(false);break;
      case 'cultureLevel':state.cultureLevel=el.value;render(false);break;
      case 'cultureCount':state.cultureCount=el.value;break;
      case 'dictCategory':state.dictCategory=el.value;updateDictList();break;
      case 'dailyGoal':store.goal=Number(el.value);persist();renderModal();break;
    }
  });
  document.addEventListener('input',event=>{if(event.target.dataset.field==='dictSearch'){state.dictSearch=event.target.value;updateDictList();}});
  document.addEventListener('keydown',event=>{
    if(event.target.closest('input,textarea,select,[contenteditable]')||state.modal)return;
    if(state.page==='cards'&&state.cards){if(event.code==='Space'){event.preventDefault();state.cards.flipped=!state.cards.flipped;render(false);}else if(state.cards.flipped&&['Digit1','Digit2','Digit3'].includes(event.code)){cardGrade(Number(event.code.slice(-1))-1);}return;}
    if(state.session&&state.session.index<state.session.items.length){
      if(state.session.selected===null&&/^Digit[1-4]$/.test(event.code)){const i=Number(event.code.slice(-1))-1;answerQuestion(state.session.options[i]);}
      else if(state.session.selected!==null && event.code==='Enter'){const s=state.session;s.index++;prepQuestion();render(true);}
    }
  });
  render();
  if ('serviceWorker' in navigator && location.protocol==='https:') {
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
