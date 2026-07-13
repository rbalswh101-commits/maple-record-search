// server.js
// 메이플스토리 캐릭터 기록검색 - 단일 파일 버전 (아이템 상세정보 모달 포함)

require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const NEXON_API_KEY = process.env.NEXON_API_KEY;
const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

if (!NEXON_API_KEY) {
  console.warn('WARNING: NEXON_API_KEY is not set.');
}

async function nexonGet(pathname, params) {
  const url = new URL(BASE_URL + pathname);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  console.log('[NEXON REQUEST]', url.toString());

  const res = await fetch(url, {
    headers: { 'x-nxopen-api-key': NEXON_API_KEY }
  });

  const rawText = await res.text();
  let body;
  try {
    body = JSON.parse(rawText);
  } catch (e) {
    body = { raw: rawText };
  }

  console.log('[NEXON RESPONSE]', pathname, res.status);

  if (!res.ok) {
    const err = new Error(body.error?.message || 'Nexon API error');
    err.status = res.status;
    err.code = body.error?.name;
    err.rawBody = body;
    throw err;
  }
  return body;
}

// 스탯 옵션 객체를 "STR +10" 같은 문자열 배열로 변환
const STAT_LABELS = {
  str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK',
  max_hp: '최대 HP', max_mp: '최대 MP',
  max_hp_rate: '최대 HP', max_mp_rate: '최대 MP',
  attack_power: '공격력', magic_power: '마력',
  armor: '방어력', speed: '이동속도', jump: '점프력',
  boss_damage: '보스 몬스터 공격 시 데미지',
  ignore_monster_armor: '몬스터 방어율 무시',
  all_stat: '올스탯', damage: '데미지',
  equipment_level_decrease: '착용 레벨 감소'
};

function formatOptionObject(opt) {
  if (!opt) return [];
  const out = [];
  Object.entries(opt).forEach(([key, val]) => {
    if (!val || val === '0' || val === 0) return;
    const label = STAT_LABELS[key];
    if (!label) return;
    const isRate = key.endsWith('_rate') || ['boss_damage', 'ignore_monster_armor', 'all_stat', 'damage', 'speed', 'jump'].includes(key);
    out.push(`${label} +${val}${isRate ? '%' : ''}`);
  });
  return out;
}

function formatPotentialLines(it, prefix) {
  const grade = it[`${prefix}_option_grade`];
  const lines = [it[`${prefix}_option_1`], it[`${prefix}_option_2`], it[`${prefix}_option_3`]].filter(Boolean);
  if (!grade && lines.length === 0) return null;
  return { grade: grade || null, lines };
}

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
  .items-section{padding:24px 26px 4px; border-top:1px solid var(--parchment-dim);}
  .items-title{font-size:11.5px; color:#8a7a54; letter-spacing:.04em; margin-bottom:14px; text-transform:uppercase; font-family:'Space Mono',monospace;}
  .items-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(64px, 1fr)); gap:10px; padding-bottom:20px;}
  .item-slot{background:var(--parchment-dim); border-radius:10px; padding:8px; text-align:center; position:relative; cursor:pointer; border:1px solid transparent; transition:border-color .15s ease, transform .15s ease;}
  .item-slot:hover{border-color:var(--gold); transform:translateY(-2px);}
  .item-slot img{width:100%; aspect-ratio:1; object-fit:contain; image-rendering:pixelated; pointer-events:none;}
  .item-slot .item-part{font-size:9px; color:#8a7a54; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;}
  .item-slot-tooltip{position:absolute; bottom:100%; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--parchment); font-size:10.5px; padding:4px 8px; border-radius:6px; white-space:nowrap; opacity:0; pointer-events:none; transition:opacity .15s ease; margin-bottom:6px; z-index:5;}
  .item-slot:hover .item-slot-tooltip{opacity:1;}
  .no-items{font-size:12.5px; color:#8a7a54; padding-bottom:20px;}
  .card-bottom{padding:22px 30px 28px; border-top:1px solid var(--parchment-dim); font-size:12.5px; color:#8a7a54;}
  footer{text-align:center; padding:30px 20px 50px; font-size:11.5px; color:rgba(135,168,147,.5);}

  /* ---- 아이템 상세 모달 ---- */
  .modal-overlay{
    position:fixed; inset:0; background:rgba(10,18,14,0.72); backdrop-filter:blur(3px);
    display:flex; align-items:center; justify-content:center; padding:20px; z-index:100;
    opacity:0; pointer-events:none; transition:opacity .18s ease;
  }
  .modal-overlay.open{opacity:1; pointer-events:auto;}
  .item-modal{
    background:linear-gradient(180deg,#241a10,#160f0a); color:var(--parchment);
    border:1px solid rgba(201,162,39,0.35); border-radius:18px; max-width:400px; width:100%;
    max-height:82vh; overflow-y:auto; box-shadow:0 40px 80px -20px rgba(0,0,0,0.7);
    transform:translateY(10px) scale(.97); transition:transform .18s ease;
  }
  .modal-overlay.open .item-modal{transform:translateY(0) scale(1);}
  .item-modal-head{display:flex; gap:14px; align-items:center; padding:22px 22px 16px; border-bottom:1px solid rgba(246,236,210,0.1);}
  .item-modal-head img{width:52px; height:52px; object-fit:contain; image-rendering:pixelated; background:rgba(246,236,210,0.06); border-radius:10px; padding:6px;}
  .item-modal-head .name{font-family:'Gowun Batang',serif; font-size:18px; font-weight:700; color:var(--gold-bright); line-height:1.3;}
  .item-modal-head .part{font-size:11.5px; color:var(--sage); margin-top:3px;}
  .modal-close{margin-left:auto; background:none; border:none; color:rgba(246,236,210,0.5); font-size:20px; cursor:pointer; line-height:1; padding:4px;}
  .modal-close:hover{color:var(--parchment);}
  .item-modal-body{padding:18px 22px 24px;}
  .item-section{margin-bottom:16px;}
  .item-section:last-child{margin-bottom:0;}
  .item-section-title{font-family:'Space Mono',monospace; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:rgba(246,236,210,0.4); margin-bottom:8px;}
  .item-section-title.pot{color:#c48fe0;}
  .item-section-title.add-pot{color:#7fc9e0;}
  .item-line{font-size:13px; line-height:1.7; color:var(--parchment-dim);}
  .item-line.potential{color:#dcb8f0;}
  .item-line.add-potential{color:#a9dcec;}
  .badge-row{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:2px;}
  .badge{font-family:'Space Mono',monospace; font-size:11px; padding:4px 10px; border-radius:20px; background:rgba(246,236,210,0.08); color:var(--gold-bright); border:1px solid rgba(201,162,39,0.3);}
  .grade-tag{font-size:11px; padding:2px 8px; border-radius:6px; margin-left:6px; font-family:'Space Mono',monospace;}
  .item-desc{font-size:12px; color:rgba(246,236,210,0.45); line-height:1.6; font-style:italic; margin-top:2px;}
  .no-detail{font-size:12.5px; color:rgba(246,236,210,0.4); padding:6px 0;}
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

<div class="modal-overlay" id="itemModalOverlay">
  <div class="item-modal" id="itemModal"></div>
</div>

<footer>MAPLE ARCHIVE · Powered by Nexon Open API</footer>

<script>
const input = document.getElementById('searchInput');
const btn = document.getElementById('searchBtn');
const main = document.getElementById('main');
const modalOverlay = document.getElementById('itemModalOverlay');
const itemModal = document.getElementById('itemModal');

let currentItems = [];

async function runSearch(){
  const q = input.value.trim();
  if(!q){ main.innerHTML = '<div class="empty-state">닉네임을 입력하고 검색을 눌러보세요 🍁</div>'; return; }

  btn.disabled = true;
  main.innerHTML = '<div class="loading">모험가를 찾는 중...</div>';

  try{
    const res = await fetch('/api/character/' + encodeURIComponent(q));
    const data = await res.json();

    if(!res.ok){
      main.innerHTML = \`<div class="not-found">
        <div class="big">\${escapeHtml(data.error || '오류가 발생했습니다')}</div>
        <pre style="text-align:left; white-space:pre-wrap; font-size:11px; color:#c9a227; background:rgba(0,0,0,0.3); padding:14px; border-radius:8px; margin-top:16px; max-width:500px; margin-left:auto; margin-right:auto;">status: \${escapeHtml(String(data.debug_status))}
code: \${escapeHtml(String(data.debug_code))}
raw: \${escapeHtml(JSON.stringify(data.debug_raw))}</pre>
      </div>\`;
      return;
    }

    currentItems = data.items || [];

    const itemsHtml = (currentItems.length)
      ? \`<div class="items-section">
          <div class="items-title">장착 아이템 (탭하면 상세정보)</div>
          <div class="items-grid">
            \${currentItems.map((it, idx) => \`
              <div class="item-slot" data-idx="\${idx}">
                <div class="item-slot-tooltip">\${escapeHtml(it.name)}</div>
                <img src="\${it.icon}" alt="\${escapeHtml(it.name)}" loading="lazy">
                <div class="item-part">\${escapeHtml(it.part)}</div>
              </div>\`).join('')}
          </div>
        </div>\`
      : \`<div class="items-section"><div class="no-items">장착 중인 아이템 정보가 없어요.</div></div>\`;

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
        \${itemsHtml}
        <div class="card-bottom">넥슨 오픈 API 실시간 조회 결과</div>
      </div>\`;

    main.querySelectorAll('.item-slot').forEach(el => {
      el.addEventListener('click', () => openItemModal(currentItems[Number(el.dataset.idx)]));
    });
  }catch(e){
    main.innerHTML = '<div class="not-found"><div class="big">서버에 연결할 수 없습니다</div></div>';
  }finally{
    btn.disabled = false;
  }
}

function potentialGradeColor(grade){
  const map = {
    '레어':'color:#8fc7ff;', '에픽':'color:#c48fe0;',
    '유니크':'color:#e6c14f;', '레전드리':'color:#7ee08f;'
  };
  return map[grade] || 'color:#ccc;';
}

function openItemModal(it){
  if(!it) return;

  let sectionsHtml = '';

  // 스타포스 / 착용 레벨 뱃지
  const badges = [];
  if(it.starforce && Number(it.starforce) > 0) badges.push(\`⭐ \${it.starforce}성 강화\`);
  if(badges.length){
    sectionsHtml += \`<div class="item-section"><div class="badge-row">\${badges.map(b => \`<span class="badge">\${escapeHtml(b)}</span>\`).join('')}</div></div>\`;
  }

  if(it.totalOption && it.totalOption.length){
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title">최종 옵션 (기본 + 추가 + 잠재 합산)</div>
      \${it.totalOption.map(l => \`<div class="item-line">\${escapeHtml(l)}</div>\`).join('')}
    </div>\`;
  }

  if(it.baseOption && it.baseOption.length){
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title">기본 옵션</div>
      \${it.baseOption.map(l => \`<div class="item-line">\${escapeHtml(l)}</div>\`).join('')}
    </div>\`;
  }

  if(it.addOption && it.addOption.length){
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title">추가 옵션 (주문서)</div>
      \${it.addOption.map(l => \`<div class="item-line">\${escapeHtml(l)}</div>\`).join('')}
    </div>\`;
  }

  if(it.potential && (it.potential.grade || it.potential.lines.length)){
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title pot">잠재능력 \${it.potential.grade ? \`<span style="\${potentialGradeColor(it.potential.grade)}">(\${escapeHtml(it.potential.grade)})</span>\` : ''}</div>
      \${it.potential.lines.length ? it.potential.lines.map(l => \`<div class="item-line potential">\${escapeHtml(l)}</div>\`).join('') : '<div class="no-detail">옵션 없음</div>'}
    </div>\`;
  }

  if(it.addPotential && (it.addPotential.grade || it.addPotential.lines.length)){
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title add-pot">에디셔널 잠재능력 \${it.addPotential.grade ? \`<span style="\${potentialGradeColor(it.addPotential.grade)}">(\${escapeHtml(it.addPotential.grade)})</span>\` : ''}</div>
      \${it.addPotential.lines.length ? it.addPotential.lines.map(l => \`<div class="item-line add-potential">\${escapeHtml(l)}</div>\`).join('') : '<div class="no-detail">옵션 없음</div>'}
    </div>\`;
  }

  if(!sectionsHtml){
    sectionsHtml = '<div class="no-detail">이 장비에는 표시할 상세 옵션 정보가 없어요.</div>';
  }

  if(it.description){
    sectionsHtml += \`<div class="item-desc">\${escapeHtml(it.description)}</div>\`;
  }

  itemModal.innerHTML = \`
    <div class="item-modal-head">
      <img src="\${it.icon}" alt="\${escapeHtml(it.name)}">
      <div>
        <div class="name">\${escapeHtml(it.name)}</div>
        <div class="part">\${escapeHtml(it.part)}</div>
      </div>
      <button class="modal-close" id="modalCloseBtn">✕</button>
    </div>
    <div class="item-modal-body">\${sectionsHtml}</div>
  \`;

  modalOverlay.classList.add('open');
  document.getElementById('modalCloseBtn').addEventListener('click', closeItemModal);
}

function closeItemModal(){
  modalOverlay.classList.remove('open');
}

modalOverlay.addEventListener('click', (e) => {
  if(e.target === modalOverlay) closeItemModal();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') closeItemModal();
});

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

app.get('/api/character/:name', async (req, res) => {
  const name = req.params.name.trim();
  if (!name) return res.status(400).json({ error: 'Character name is required.' });

  try {
    const idResult = await nexonGet('/id', { character_name: name });
    const ocid = idResult.ocid;

    const [basic, stat, popularity, itemEquip] = await Promise.all([
      nexonGet('/character/basic', { ocid }),
      nexonGet('/character/stat', { ocid }),
      nexonGet('/character/popularity', { ocid }),
      nexonGet('/character/item-equipment', { ocid }).catch(err => {
        console.error('[ITEM FETCH FAILED]', err.status, JSON.stringify(err.rawBody));
        return null;
      })
    ]);

    const combatPowerStat = stat.final_stat?.find(s => s.stat_name === '\uc804\ud22c\ub825');

    let items = [];
    if (itemEquip && Array.isArray(itemEquip.item_equipment)) {
      items = itemEquip.item_equipment
        .filter(it => it.item_name)
        .map(it => ({
          part: it.item_equipment_part || it.item_equipment_slot || '',
          name: it.item_name,
          icon: it.item_icon,
          description: it.item_description || null,
          starforce: it.starforce || null,
          totalOption: formatOptionObject(it.item_total_option),
          baseOption: formatOptionObject(it.item_base_option),
          addOption: formatOptionObject(it.item_add_option),
          potential: formatPotentialLines(it, 'potential'),
          addPotential: formatPotentialLines(it, 'additional_potential')
        }));
    }

    res.json({
      name: basic.character_name,
      world: basic.world_name,
      job: basic.character_class,
      level: basic.character_level,
      guild: basic.character_guild_name || '\uc5c6\uc74c',
      exp_rate: basic.character_exp_rate,
      image: basic.character_image,
      power: combatPowerStat ? combatPowerStat.stat_value : '\uc815\ubcf4 \uc5c6\uc74c',
      popularity: popularity.popularity,
      items: items
    });
  } catch (err) {
    console.error('[ERROR]', err.status, err.code, JSON.stringify(err.rawBody));

    return res.status(err.status || 500).json({
      error: '\uc870\ud68c \uc2e4\ud328',
      debug_status: err.status,
      debug_code: err.code,
      debug_raw: err.rawBody
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
