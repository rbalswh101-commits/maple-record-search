// server.js
// 메이플스토리 캐릭터 기록검색 - 단일 파일 버전 (폴더 없이 배포하기 쉽게 구성)
// 넥슨 오픈 API(https://openapi.nexon.com)를 프록시해서 프론트엔드에 내려줍니다.

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const NEXON_API_KEY = process.env.NEXON_API_KEY;
const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

if (!NEXON_API_KEY) {
  console.warn('\u26a0\ufe0f  NEXON_API_KEY\uac00 \uc124\uc815\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. \ud658\uacbd\ubcc0\uc218\ub97c \ud655\uc778\ud558\uc138\uc694.');
}

async function nexonGet(pathname, params) {
  const url = new URL(BASE_URL + pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, {
    headers: { 'x-nxopen-api-key': NEXON_API_KEY }
  });

  const body = await res.json();
  if (!res.ok) {
    const err = new Error(body.error?.message || 'Nexon API error');
    err.status = res.status;
    err.code = body.error?.name;
    throw err;
  }
  return body;
}

// ---- 프론트엔드 페이지 (HTML을 코드 안에 직접 포함) ----
const PAGE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>메이플 기록실 — 캐릭터 검색</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet">
<style>
  :root{
    --forest-deep:#122720; --forest-mid:#1c3a2e;
    --parchment:#f6ecd2; --parchment-dim:#ece0c2;
    --gold:#c9a227; --gold-bright:#e6c14f;
    --berry:#b4485f; --berry-dim:#8f3549;
    --ink:#2a2118; --sage:#87a893; --line: rgba(246,236,210,0.14);
  }
  *{box-sizing:border-box;}
  body{
    margin:0;
    background:
      radial-gradient(circle at 15% -10%, #1f4433 0%, transparent 45%),
      radial-gradient(circle at 90% 10%, #2a4a35 0%, transparent 40%),
      var(--forest-deep);
    color:var(--parchment);
    font-family:'Pretendard','Noto Sans KR',sans-serif;
    min-height:100vh;
  }
  header{text-align:center; padding:74px 20px 32px;}
  .eyebrow{font-family:'Space Mono',monospace; letter-spacing:0.32em; font-size:11px; color:var(--gold-bright); text-transform:uppercase; margin-bottom:18px;}
  h1{font-family:'Gowun Batang',serif; font-size:clamp(34px,6vw,58px); margin:0 0 12px; color:var(--parchment);}
  h1 span{color:var(--gold-bright);}
  .sub{font-size:15px; color:var(--sage); max-width:440px; margin:0 auto; line-height:1.6;}
  .search-wrap{max-width:560px; margin:36px auto 0; padding:0 20px;}
  .search-box{display:flex; gap:10px; background:rgba(20,42,32,0.6); border:1px solid var(--line); border-radius:14px; padding:8px; backdrop-filter:blur(6px);}
  .search-box input{flex:1; background:transparent; border:none; outline:none; color:var(--parchment); font-size:16px; padding:12px 14px;}
  .search-box input::placeholder{color:rgba(246,236,210,0.35);}
  .search-box button{background:linear-gradient(135deg,var(--gold-bright),var(--gold)); border:none; color:#2a1f08; font-weight:700; font-size:14px; padding:0 22px; border-radius:9px; cursor:pointer; transition:transform .15s ease;}
  .search-box button:hover{transform:translateY(-1px);}
  .search-box button:disabled{opacity:0.6; cursor:default;}
  .hint{text-align:center; font-size:12px; color:rgba(135,168,147,0.7); margin-top:14px;}
  main{max-width:760px; margin:0 auto; padding:40px 20px 100px; min-height:280px;}
  .empty-state, .loading{text-align:center; color:rgba(246,236,210,0.4); font-size:14px; padding:60px 20px;}
  .not-found{text-align:center; padding:50px 20px; color:var(--berry);}
  .not-found .big{font-family:'Gowun Batang',serif; font-size:22px; color:var(--parchment); margin-bottom:8px;}
  .card{background:var(--parchment); color:var(--ink); border-radius:20px; overflow:hidden; box-shadow:0 30px 60px -20px rgba(0,0,0,0.5); animation:riseIn .5s cubic-bezier(.16,1,.3,1);}
  @keyframes riseIn{from{opacity:0; transform:translateY(18px) scale(.98);} to{opacity:1; transform:translateY(0) scale(1);}}
  @media (prefers-reduced-motion: reduce){.card{animation:none;}}
  .card-top{background:linear-gradient(135deg,var(--forest-mid),#23473a); padding:32px 30px 60px; position:relative;}
  .world-tag{font-family:'Space Mono',monospace; font-size:11px; letter-spacing:.15em; color:var(--gold-bright); text-transform:uppercase;}
  .char-name{font-family:'Gowun Batang',serif; font-size:32px; font-weight:700; margin:6px 0 4px;}
  .char-job{font-size:14px; color:var(--sage);}
  .guild-tag{position:absolute; top:32px; right:30px; text-align:right; font-size:12px; color:rgba(246,236,210,.6);}
  .guild-tag b{display:block; color:var(--gold-bright); font-size:14px;}
  .char-avatar{position:absolute; left:30px; bottom:-30px; width:60px; height:80px; image-rendering:pixelated;}
  .stat-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--parchment-dim); margin-top:44px;}
  .stat{background:var(--parchment); padding:20px 26px;}
  .stat .label{font-size:11.5px; color:#8a7a54; margin-bottom:6px;}
  .stat .value{font-family:'Space Mono',monospace; font-size:18px; font-weight:700;}
  .stat .value.pink{color:var(--berry-dim);}
  .card-bottom{padding:22px 30px 28px; border-top:1px solid var(--parchment-dim); font-size:12.5px; color:#8a7a54;}
  footer{text-align:center; padding:30px 20px 50px; font-size:11.5px; color:rgba(135,168,147,.5);}
</style>
</head>
<body>

<header>
  <div class="eyebrow">MAPLE ARCHIVE</div>
  <h1>메이플 <span>기록실</span></h1>
  <p class="sub">모험을 검색하세요. 캐릭터 닉네임을 입력하면 실시간 레벨, 직업, 전투력을 확인할 수 있어요.</p>
</header>

<div class="search-wrap">
  <div class="search-box">
    <input id="searchInput" type="text" placeholder="캐릭터 닉네임을 입력하세요" autocomplete="off">
    <button id="searchBtn">검색</button>
  </div>
  <div class="hint">넥슨 오픈 API와 실시간으로 연동됩니다.</div>
</div>

<main id="main">
  <div class="empty-state">닉네임을 입력하고 검색을 눌러보세요 🍁</div>
</main>

<footer>MAPLE ARCHIVE · Powered by Nexon Open API</footer>

<script>
const input = document.getElementById('searchInput');
const btn = document.getElementById('searchBtn');
const main = document.getElementById('main');

async function runSearch(){
  const q = input.value.trim();
  if(!q){ main.innerHTML = '<div class="empty-state">닉네임을 입력하고 검색을 눌러보세요 🍁</div>'; return; }

  btn.disabled = true;
  main.innerHTML = '<div class="loading">모험가를 찾는 중...</div>';

  try{
    const res = await fetch('/api/character/' + encodeURIComponent(q));
    const data = await res.json();

    if(!res.ok){
      main.innerHTML = \`<div class="not-found"><div class="big">\${escapeHtml(data.error || '오류가 발생했습니다')}</div></div>\`;
      return;
    }

    main.innerHTML = \`
      <div class="card">
        <div class="card-top">
          <div class="world-tag">\${escapeHtml(data.world)} 월드</div>
          <div class="char-name">\${escapeHtml(data.name)}</div>
          <div class="char-job">\${escapeHtml(data.job)}</div>
          <div class="guild-tag">길드<b>\${escapeHtml(data.guild)}</b></div>
          \${data.image ? \`<img class="char-avatar" src="\${data.image}" alt="\${escapeHtml(data.name)}">\` : ''}
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="label">레벨</div><div class="value">\${data.level}</div></div>
          <div class="stat"><div class="label">전투력</div><div class="value">\${data.power}</div></div>
          <div class="stat"><div class="label">경험치</div><div class="value pink">\${data.exp_rate}%</div></div>
          <div class="stat"><div class="label">인기도</div><div class="value">\${data.popularity}</div></div>
        </div>
        <div class="card-bottom">넥슨 오픈 API 실시간 조회 결과</div>
      </div>\`;
  }catch(e){
    main.innerHTML = '<div class="not-found"><div class="big">서버에 연결할 수 없습니다</div></div>';
  }finally{
    btn.disabled = false;
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

btn.onclick = runSearch;
input.addEventListener('keydown', e => { if(e.key === 'Enter') runSearch(); });
</script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.type('html').send(PAGE_HTML);
});

// ---- API ----
app.get('/api/character/:name', async (req, res) => {
  const name = req.params.name.trim();
  if (!name) return res.status(400).json({ error: 'Character name is required.' });

  try {
    const idResult = await nexonGet('/id', { character_name: name });
    const ocid = idResult.ocid;

    const [basic, stat, popularity] = await Promise.all([
      nexonGet('/character/basic', { ocid }),
      nexonGet('/character/stat', { ocid }),
      nexonGet('/character/popularity', { ocid })
    ]);

    const combatPowerStat = stat.final_stat?.find(s => s.stat_name === '\uc804\ud22c\ub825');

    res.json({
      name: basic.character_name,
      world: basic.world_name,
      job: basic.character_class,
      level: basic.character_level,
      guild: basic.character_guild_name || '\uc5c6\uc74c',
      exp_rate: basic.character_exp_rate,
      image: basic.character_image,
      power: combatPowerStat ? combatPowerStat.stat_value : '\uc815\ubcf4 \uc5c6\uc74c',
      popularity: popularity.popularity
    });
  } catch (err) {
    console.error(err);
    if (err.code === 'OPENAPI00004' || err.status === 400) {
      return res.status(404).json({ error: '\ud574\ub2f9 \ub2c9\ub124\uc784\uc758 \uce90\ub9ad\ud130\ub97c \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' });
    }
    if (err.status === 401 || err.status === 403) {
      return res.status(500).json({ error: 'API \ud0a4\uac00 \uc720\ud6a8\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4. \ud658\uacbd\ubcc0\uc218 \uc124\uc815\uc744 \ud655\uc778\ud558\uc138\uc694.' });
    }
    res.status(500).json({ error: '\uc870\ud68c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4.' });
  }
});

app.listen(PORT, () => {
  console.log(`\uc11c\ubc84 \uc2e4\ud589 \uc911: http://localhost:${PORT}`);
});
