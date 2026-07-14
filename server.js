// server.js
// 메이플스토리 캐릭터 기록검색 - 다크 대시보드 버전

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

// ---- 옵션 포맷 헬퍼 ----
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
    out.push(`${label} : <b>+${val}${isRate ? '%' : ''}</b>`);
  });
  return out;
}

// 최종 옵션을 "총합 (기본값 +추가옵션 +주문서 +스타포스)" 형태로 만드는 함수
function formatOptionBreakdown(totalOpt, baseOpt, addOpt, starforceOpt) {
  if (!totalOpt) return [];
  const out = [];
  Object.entries(totalOpt).forEach(([key, val]) => {
    const numVal = Number(val) || 0;
    if (!numVal) return;
    const label = STAT_LABELS[key];
    if (!label) return;
    const isRate = key.endsWith('_rate') || ['boss_damage', 'ignore_monster_armor', 'all_stat', 'damage', 'speed', 'jump'].includes(key);
    const suffix = isRate ? '%' : '';

    const baseVal = Number((baseOpt && baseOpt[key]) || 0);
    const addVal = Number((addOpt && addOpt[key]) || 0);
    const sfVal = Number((starforceOpt && starforceOpt[key]) || 0);
    // 나머지 차이는 주문서/기타 강화분으로 취급 (필드가 없거나 이름이 다를 경우를 대비한 안전장치)
    const scrollVal = numVal - baseVal - addVal - sfVal;

    const parts = [];
    if (addVal !== 0) parts.push(`<span class="opt-add">+${addVal}${suffix}</span>`);
    if (scrollVal !== 0) parts.push(`<span class="opt-scroll">+${scrollVal}${suffix}</span>`);
    if (sfVal !== 0) parts.push(`<span class="opt-sf">+${sfVal}${suffix}</span>`);

    if (baseVal > 0 && parts.length) {
      out.push(`${label} : <b>+${numVal}${suffix}</b> <span class="opt-detail">( ${baseVal}${suffix} ${parts.join(' ')} )</span>`);
    } else {
      out.push(`${label} : <b>+${numVal}${suffix}</b>`);
    }
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
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet">
<style>
  :root{
    --bg:#0a0e16; --bg-elev:#11161f; --panel:#141a25; --panel-2:#182030;
    --line:rgba(255,255,255,0.07); --line-strong:rgba(255,255,255,0.14);
    --text:#e8ecf4; --text-dim:#8a94a6; --text-faint:#5c6678;
    --neon-cyan:#33e0ff; --neon-purple:#a78bfa; --neon-pink:#ff5ecb; --neon-green:#4fe0c9;
    --danger:#ff6b81;
  }
  *{box-sizing:border-box;}
  body{
    margin:0;
    background:
      radial-gradient(ellipse 900px 500px at 20% -10%, rgba(51,224,255,0.10), transparent 60%),
      radial-gradient(ellipse 700px 500px at 100% 0%, rgba(167,139,250,0.10), transparent 55%),
      var(--bg);
    color:var(--text);
    font-family:'Pretendard','Noto Sans KR',sans-serif;
    min-height:100vh;
  }

  /* ---- 상단 네비게이션 ---- */
  .navbar{
    position:sticky; top:0; z-index:50;
    display:flex; align-items:center; gap:20px;
    padding:14px 24px; background:rgba(10,14,22,0.82); backdrop-filter:blur(10px);
    border-bottom:1px solid var(--line);
  }
  .brand{display:flex; align-items:center; gap:8px; font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:15px; white-space:nowrap;}
  .brand .dot{width:8px; height:8px; border-radius:50%; background:var(--neon-cyan); box-shadow:0 0 10px var(--neon-cyan);}
  .brand span{background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple)); -webkit-background-clip:text; background-clip:text; color:transparent;}
  .nav-search{flex:1; max-width:460px; display:flex; gap:8px; background:var(--panel); border:1px solid var(--line); border-radius:11px; padding:6px;}
  .nav-search input{flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:13px; padding:8px 10px;}
  .nav-search input::placeholder{color:var(--text-faint);}
  .nav-search button{background:linear-gradient(135deg,var(--neon-cyan),var(--neon-purple)); border:none; color:#081018; font-weight:700; font-size:12.5px; padding:0 18px; border-radius:8px; cursor:pointer; transition:opacity .15s ease;}
  .nav-search button:hover{opacity:0.88;}
  .nav-search button:disabled{opacity:0.5; cursor:default;}
  .nav-menu{display:flex; gap:4px; margin-left:auto;}
  .nav-menu a{font-size:13px; color:var(--text-dim); text-decoration:none; padding:8px 12px; border-radius:8px;}
  .nav-menu a:hover{color:var(--text); background:var(--panel);}

  @media (max-width:760px){
    .navbar{flex-wrap:wrap;}
    .nav-menu{display:none;}
    .nav-search{max-width:none; order:3; width:100%;}
  }

  main{max-width:840px; margin:0 auto; padding:36px 20px 100px; min-height:280px;}
  .loading{text-align:center; color:var(--text-faint); font-size:14px; padding:80px 20px;}
  .not-found{text-align:center; padding:60px 20px;}
  .not-found .big{font-family:'Space Grotesk',sans-serif; font-size:20px; color:var(--danger); margin-bottom:8px;}

  /* ---- 빈 화면(메인) 히어로 ---- */
  .empty-hero{text-align:center; padding:56px 20px 30px; position:relative;}
  .empty-hero .hero-orb{width:92px; height:92px; margin:0 auto 22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:38px; background:radial-gradient(circle at 35% 30%, rgba(51,224,255,0.24), rgba(167,139,250,0.15) 60%, transparent 75%); border:1px solid var(--line-strong); box-shadow:0 0 40px -8px rgba(51,224,255,0.35); animation:floaty 3.6s ease-in-out infinite;}
  @keyframes floaty{0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);}}
  @media (prefers-reduced-motion: reduce){.empty-hero .hero-orb{animation:none;}}
  .empty-hero .hero-title{font-family:'Space Grotesk',sans-serif; font-size:19px; font-weight:700; color:var(--text); margin-bottom:8px;}
  .empty-hero .hero-sub{font-size:13px; color:var(--text-faint); margin-bottom:28px;}
  .hero-features{display:flex; justify-content:center; gap:10px; flex-wrap:wrap; max-width:520px; margin:0 auto;}
  .hero-chip{display:flex; align-items:center; gap:8px; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:12px 16px; font-size:12px; color:var(--text-dim); transition:border-color .15s ease, transform .15s ease;}
  .hero-chip:hover{border-color:var(--neon-cyan); transform:translateY(-2px);}
  .hero-chip .chip-icon{font-size:16px;}
  .hero-chip b{color:var(--text); font-weight:700;}
  @media (max-width:480px){
    .empty-hero{padding:40px 16px 20px;}
    .hero-features{gap:8px;}
    .hero-chip{padding:10px 12px; font-size:11px;}
  }

  /* ---- 캐릭터 헤더 카드 ---- */
  .char-card{background:var(--panel); border:1px solid var(--line); border-radius:18px; overflow:hidden; animation:riseIn .45s cubic-bezier(.16,1,.3,1);}
  @keyframes riseIn{from{opacity:0; transform:translateY(14px);} to{opacity:1; transform:translateY(0);}}
  @media (prefers-reduced-motion: reduce){.char-card{animation:none;}}
  @media (max-width:480px){
    .char-head{gap:14px; padding:22px 18px; flex-wrap:wrap;}
    .char-avatar-wrap{width:150px; height:190px;}
    .char-info .char-name{font-size:21px;}
  }
  .char-head{display:flex; align-items:center; gap:20px; padding:26px 28px; position:relative; background:linear-gradient(135deg, rgba(51,224,255,0.06), rgba(167,139,250,0.06));}
  .char-avatar-wrap{width:200px; height:256px; background:var(--panel-2); border-radius:20px; display:flex; align-items:center; justify-content:center; border:1px solid var(--line-strong); flex-shrink:0; padding:0; overflow:hidden; position:relative;}
  .char-avatar-wrap img{width:100%; height:100%; object-fit:contain; image-rendering:pixelated; transform:scale(2.1); transform-origin:center center;}
  .char-info .world-tag{font-family:'Space Mono',monospace; font-size:9.5px; letter-spacing:.12em; color:var(--neon-cyan); text-transform:uppercase;}
  .char-info .char-name{font-family:'Space Grotesk',sans-serif; font-size:20px; font-weight:700; margin:4px 0 3px;}
  .char-info .char-job{font-size:12px; color:var(--text-dim);}
  .guild-tag{margin-left:auto; text-align:right; font-size:10.5px; color:var(--text-faint); flex-shrink:0;}
  .guild-tag b{display:block; color:var(--text); font-size:12px; margin-top:2px;}

  /* ---- 탭 ---- */
  .tabs{display:flex; gap:2px; padding:0 12px; border-bottom:1px solid var(--line); background:rgba(255,255,255,0.015);}
  .tab-btn{background:none; border:none; color:var(--text-faint); font-size:12.5px; font-weight:600; padding:13px 16px; cursor:pointer; position:relative; font-family:'Pretendard',sans-serif;}
  .tab-btn.active{color:var(--text);}
  .tab-btn.active::after{content:''; position:absolute; left:14px; right:14px; bottom:-1px; height:2px; background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple)); border-radius:2px;}
  .tab-btn:hover{color:var(--text);}
  .tab-panel{display:none; padding:26px 28px 30px;}
  .tab-panel.active{display:block; animation:fadeIn .25s ease;}
  @keyframes fadeIn{from{opacity:0;} to{opacity:1;}}

  /* ---- 스탯 탭 ---- */
  .stat-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:12px;}
  .stat-box{background:var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:18px 20px;}
  .stat-box .label{font-size:10px; color:var(--text-faint); margin-bottom:7px; font-family:'Space Mono',monospace; letter-spacing:.04em; text-transform:uppercase;}
  .stat-box .value{font-family:'Space Mono',monospace; font-size:17px; font-weight:700;}
  .stat-box .value.cyan{color:var(--neon-cyan);}
  .stat-box .value.pink{color:var(--neon-pink);}
  .stat-box .value.purple{color:var(--neon-purple);}
  .stat-box .value.green{color:var(--neon-green);}

  /* ---- 장비 탭 ---- */
  .items-hint{font-size:11px; color:var(--text-faint); margin-bottom:14px; font-family:'Space Mono',monospace; letter-spacing:.02em;}
  .items-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(70px, 1fr)); gap:10px;}
  .item-slot{background:var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:9px; text-align:center; position:relative; cursor:pointer; transition:border-color .15s ease, transform .15s ease, box-shadow .15s ease;}
  .item-slot:hover{border-color:var(--neon-cyan); transform:translateY(-2px); box-shadow:0 8px 20px -8px rgba(51,224,255,0.35);}
  .item-slot img{width:100%; aspect-ratio:1; object-fit:contain; image-rendering:pixelated; pointer-events:none;}
  .item-slot .item-part{font-size:9px; color:var(--text-faint); margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; pointer-events:none;}
  .no-items{font-size:12.5px; color:var(--text-faint); padding:20px 0;}

  /* ---- 인게임 장비창 배치 (좌/우 2열 + 아바타만, 고정 슬롯 크기) ---- */
  .equip-layout{display:flex; justify-content:center; align-items:flex-start; gap:10px; margin-bottom:6px;}
  .equip-side{display:grid; grid-template-columns:repeat(2, 52px); grid-auto-rows:52px; gap:6px; flex-shrink:0;}
  .equip-side .item-slot{padding:5px; border-radius:9px;}
  .equip-side .item-slot .item-part{display:none;}
  .equip-avatar{width:130px; flex-shrink:0; background:var(--panel-2); border:1px solid var(--line-strong); border-radius:14px; overflow:hidden; aspect-ratio:3/4; display:flex; align-items:center; justify-content:center; align-self:stretch;}
  .equip-avatar img{width:100%; height:100%; object-fit:contain; image-rendering:pixelated; transform:scale(1.7); transform-origin:center center;}
  @media (max-width:480px){
    .equip-layout{gap:6px;}
    .equip-side{grid-template-columns:repeat(2, 44px); grid-auto-rows:44px; gap:5px;}
    .equip-avatar{width:104px;}
    .item-slot{padding:6px; border-radius:10px;}
  }

  footer{text-align:center; padding:30px 20px 50px; font-size:11.5px; color:var(--text-faint);}

  /* ---- 아이템 상세 모달 ---- */
  .modal-overlay{
    position:fixed; inset:0; background:rgba(4,7,12,0.75); backdrop-filter:blur(4px);
    display:flex; align-items:center; justify-content:center; padding:20px; z-index:100;
    opacity:0; pointer-events:none; transition:opacity .18s ease;
  }
  .modal-overlay.open{opacity:1; pointer-events:auto;}
  .item-modal{
    background:var(--bg-elev); color:var(--text);
    border:1px solid var(--line-strong); border-radius:18px; max-width:400px; width:100%;
    max-height:82vh; overflow-y:auto; box-shadow:0 40px 80px -20px rgba(0,0,0,0.6);
    transform:translateY(10px) scale(.97); transition:transform .18s ease;
    position:relative;
  }
  .modal-overlay.open .item-modal{transform:translateY(0) scale(1);}
  .modal-close{position:absolute; top:14px; right:14px; background:rgba(255,255,255,0.05); border:1px solid var(--line); color:var(--text-faint); font-size:16px; cursor:pointer; line-height:1; width:30px; height:30px; border-radius:50%; z-index:2;}
  .modal-close:hover{color:var(--text);}
  .sf-stars{display:flex; flex-wrap:wrap; justify-content:center; gap:6px 12px; padding:22px 20px 0;}
  .sf-star-group{display:inline-flex; gap:1px;}
  .sf-star{font-size:13px; line-height:1; color:rgba(255,255,255,0.16);}
  .sf-star.filled{color:#ffd83d; text-shadow:0 0 6px rgba(255,216,61,0.6);}
  .item-modal-icon-wrap{display:flex; justify-content:center; padding:14px 22px 18px;}
  .item-modal-icon-wrap img{width:108px; height:108px; object-fit:contain; image-rendering:pixelated; background:#ffffff; border-radius:16px; padding:12px; border:3px solid var(--icon-border, var(--neon-cyan));}
  .item-modal-title{text-align:center; padding:0 22px 20px;}
  .item-modal-title .name{font-family:'Pretendard',sans-serif; font-size:16.5px; font-weight:700; color:var(--text); line-height:1.3;}
  .item-modal-title .grade{font-size:11.5px; color:var(--text-faint); margin-top:6px;}
  .item-modal-divider{border-bottom:1px dashed var(--line-strong); margin:0 22px 18px;}
  .item-modal-body{padding:0 22px 26px;}
  .item-section{margin-bottom:18px;}
  .item-section:last-child{margin-bottom:0;}
  .item-section-title{font-size:11.5px; font-weight:700; color:var(--neon-green); margin-bottom:9px; display:flex; align-items:center; gap:6px;}
  .item-section-title.pot{color:var(--neon-green);}
  .item-section-title.add-pot{color:var(--neon-green);}
  .grade-chip{display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:4px; background:var(--neon-green); color:#04140f; font-size:10px; font-weight:800;}
  .item-line{font-size:13px; line-height:1.9; color:var(--text); padding:1px 0;}
  .item-line b{color:var(--text); font-weight:700;}
  .item-line .opt-detail{color:var(--text-faint); font-size:12px; font-weight:400;}
  .item-line .opt-add{color:#3ddc84; font-weight:700;}
  .item-line .opt-scroll{color:#b06bff; font-weight:700;}
  .item-line .opt-sf{color:#ffcf3d; font-weight:700;}
  .opt-legend{display:flex; gap:14px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--line);}
  .opt-legend span{font-size:10.5px; color:var(--text-faint); display:flex; align-items:center; gap:5px;}
  .opt-legend i{width:8px; height:8px; border-radius:50%; display:inline-block;}
  .item-line.potential{color:var(--text); font-size:13px; line-height:1.8;}
  .item-line.add-potential{color:var(--text); font-size:13px; line-height:1.8;}
  .badge-row{display:flex; gap:8px; flex-wrap:wrap; margin-bottom:2px;}
  .badge{font-family:'Space Mono',monospace; font-size:11px; padding:4px 10px; border-radius:20px; background:rgba(51,224,255,0.1); color:var(--neon-cyan); border:1px solid rgba(51,224,255,0.28);}
  .item-desc{font-size:12px; color:var(--text-faint); line-height:1.6; font-style:italic; margin-top:2px;}
  .no-detail{font-size:12.5px; color:var(--text-faint); padding:6px 0;}
</style>
</head>
<body>

<div class="navbar">
  <div class="brand"><span class="dot"></span><span>메이플 기록실</span></div>
  <div class="nav-search">
    <input id="searchInput" type="text" placeholder="캐릭터 닉네임을 입력하세요" autocomplete="off">
    <button id="searchBtn">검색</button>
  </div>
  <div class="nav-menu">
    <a href="#">랭킹</a>
    <a href="#">가이드</a>
  </div>
</div>

<main id="main">
  <div class="empty-hero">
    <div class="hero-orb">🍁</div>
    <div class="hero-title">모험가의 발자취를 찾아보세요</div>
    <div class="hero-sub">닉네임 하나로 스탯, 장비, 전투력까지 한눈에 확인할 수 있어요</div>
    <div class="hero-features">
      <div class="hero-chip"><span class="chip-icon">⚔️</span><span><b>장비</b> 상세 옵션</span></div>
      <div class="hero-chip"><span class="chip-icon">📊</span><span><b>스탯</b> · 전투력</span></div>
      <div class="hero-chip"><span class="chip-icon">⭐</span><span><b>스타포스</b> 강화 정보</span></div>
    </div>
  </div>
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

// 인게임 장비창처럼 좌/우로 아이템을 배치하기 위한 슬롯 순서
const LEFT_SLOTS = ['반지1','반지2','반지3','반지4','펜던트','펜던트2','벨트','훈장','포켓 아이템','뱃지','문장','무기','보조무기'];
const RIGHT_SLOTS = ['모자','얼굴장식','눈장식','귀고리','상의','한벌옷','어깨장식','하의','신발','장갑','망토','기계심장','안드로이드'];

function buildSlotGroups(items){
  const used = new Set();
  function pick(list){
    const out = [];
    list.forEach(slotName => {
      const idx = items.findIndex((it, i) => it.part === slotName && !used.has(i));
      if(idx !== -1){ used.add(idx); out.push(idx); }
    });
    return out;
  }
  const left = pick(LEFT_SLOTS);
  const right = pick(RIGHT_SLOTS);
  // 위 목록에 없는 부위명이라도 아이템이 하나도 빠지지 않도록 짧은 쪽 컬럼에 채워 넣는다
  const rest = items.map((_, i) => i).filter(i => !used.has(i));
  rest.forEach(idx => {
    if(left.length <= right.length) left.push(idx);
    else right.push(idx);
  });
  return { left, right };
}

function slotHtml(idx, it){
  return \`<div class="item-slot" data-idx="\${idx}">
    <img src="\${it.icon}" alt="\${escapeHtml(it.name)}" loading="lazy">
    <div class="item-part">\${escapeHtml(it.part)}</div>
  </div>\`;
}

function renderStars(sf){
  const n = Number(sf) || 0;
  if(n <= 0) return '';
  const total = 25; // 최대 스타포스 기준으로 길게 늘어지는 바 형태
  let html = '<div class="sf-stars">';
  for(let g = 0; g < total; g += 5){
    html += '<span class="sf-star-group">';
    for(let c = 0; c < 5; c++){
      const idx = g + c;
      html += idx < n ? '<span class="sf-star filled">★</span>' : '<span class="sf-star">☆</span>';
    }
    html += '</span>';
  }
  html += '</div>';
  return html;
}

async function runSearch(){
  const q = input.value.trim();
  if(!q){
    main.innerHTML = \`<div class="empty-hero">
      <div class="hero-orb">🍁</div>
      <div class="hero-title">모험가의 발자취를 찾아보세요</div>
      <div class="hero-sub">닉네임 하나로 스탯, 장비, 전투력까지 한눈에 확인할 수 있어요</div>
      <div class="hero-features">
        <div class="hero-chip"><span class="chip-icon">⚔️</span><span><b>장비</b> 상세 옵션</span></div>
        <div class="hero-chip"><span class="chip-icon">📊</span><span><b>스탯</b> · 전투력</span></div>
        <div class="hero-chip"><span class="chip-icon">⭐</span><span><b>스타포스</b> 강화 정보</span></div>
      </div>
    </div>\`;
    return;
  }

  btn.disabled = true;
  main.innerHTML = '<div class="loading">모험가를 찾는 중...</div>';

  try{
    const res = await fetch('/api/character/' + encodeURIComponent(q));
    const data = await res.json();

    if(!res.ok){
      main.innerHTML = \`<div class="not-found">
        <div class="big">\${escapeHtml(data.error || '오류가 발생했습니다')}</div>
        <pre style="text-align:left; white-space:pre-wrap; font-size:11px; color:#8a94a6; background:rgba(255,255,255,0.03); padding:14px; border-radius:8px; margin-top:16px; max-width:500px; margin-left:auto; margin-right:auto; border:1px solid rgba(255,255,255,0.07);">status: \${escapeHtml(String(data.debug_status))}
code: \${escapeHtml(String(data.debug_code))}
raw: \${escapeHtml(JSON.stringify(data.debug_raw))}</pre>
      </div>\`;
      return;
    }

    currentItems = data.items || [];

    const slotGroups = buildSlotGroups(currentItems);

    const itemsHtml = (currentItems.length)
      ? \`<div class="items-hint">탭하면 상세 옵션을 볼 수 있어요</div>
         <div class="equip-layout">
            <div class="equip-side equip-left">\${slotGroups.left.map(idx => slotHtml(idx, currentItems[idx])).join('')}</div>
            <div class="equip-avatar">\${data.image ? \`<img src="\${data.image}" alt="\${escapeHtml(data.name)}">\` : ''}</div>
            <div class="equip-side equip-right">\${slotGroups.right.map(idx => slotHtml(idx, currentItems[idx])).join('')}</div>
         </div>\`
      : \`<div class="no-items">장착 중인 아이템 정보가 없어요.</div>\`;

    main.innerHTML = \`
      <div class="char-card">
        <div class="char-head">
          <div class="char-avatar-wrap">\${data.image ? \`<img src="\${data.image}" alt="\${escapeHtml(data.name)}">\` : ''}</div>
          <div class="char-info">
            <div class="world-tag">\${escapeHtml(data.world)} 월드</div>
            <div class="char-name">\${escapeHtml(data.name)}</div>
            <div class="char-job">\${escapeHtml(data.job)} · Lv.\${data.level}</div>
          </div>
          <div class="guild-tag">길드<b>\${escapeHtml(data.guild)}</b></div>
        </div>

        <div class="tabs">
          <button class="tab-btn active" data-tab="summary">요약</button>
          <button class="tab-btn" data-tab="stat">스탯</button>
          <button class="tab-btn" data-tab="items">장비</button>
        </div>

        <div class="tab-panel active" data-panel="summary">
          <div class="stat-grid">
            <div class="stat-box"><div class="label">레벨</div><div class="value cyan">\${data.level}</div></div>
            <div class="stat-box"><div class="label">전투력</div><div class="value purple">\${formatPowerKR(data.power)}</div></div>
            <div class="stat-box"><div class="label">경험치</div><div class="value pink">\${data.exp_rate}%</div></div>
            <div class="stat-box"><div class="label">인기도</div><div class="value green">\${data.popularity}</div></div>
          </div>
        </div>

        <div class="tab-panel" data-panel="stat">
          <div class="stat-grid">
            <div class="stat-box"><div class="label">전투력</div><div class="value purple">\${formatPowerKR(data.power)}</div></div>
            <div class="stat-box"><div class="label">직업</div><div class="value">\${escapeHtml(data.job)}</div></div>
            <div class="stat-box"><div class="label">경험치</div><div class="value pink">\${data.exp_rate}%</div></div>
            <div class="stat-box"><div class="label">인기도</div><div class="value green">\${data.popularity}</div></div>
          </div>
        </div>

        <div class="tab-panel" data-panel="items">
          \${itemsHtml}
        </div>
      </div>\`;

    main.querySelectorAll('.tab-btn').forEach(tb => {
      tb.addEventListener('click', () => {
        main.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        main.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
        tb.classList.add('active');
        main.querySelector(\`.tab-panel[data-panel="\${tb.dataset.tab}"]\`).classList.add('active');
      });
    });

    main.querySelectorAll('.item-slot').forEach(el => {
      el.addEventListener('click', () => openItemModal(currentItems[Number(el.dataset.idx)]));
    });
  }catch(e){
    main.innerHTML = '<div class="not-found"><div class="big">서버에 연결할 수 없습니다</div></div>';
  }finally{
    btn.disabled = false;
  }
}

const GRADE_COLOR = {
  '레어': '#4fa3ff', '에픽': '#b06bff', '유니크': '#ffcf3d', '레전드리': '#3ddc84'
};
const GRADE_LETTER = {
  '레어': 'R', '에픽': 'E', '유니크': 'U', '레전드리': 'L'
};

function openItemModal(it){
  if(!it) return;

  const overallGrade = (it.potential && it.potential.grade) || (it.addPotential && it.addPotential.grade) || null;
  const iconBorder = overallGrade ? (GRADE_COLOR[overallGrade] || '#33e0ff') : '#33e0ff';

  let sectionsHtml = '';

  // 장비분류 + 최종 옵션(합산)을 한 리스트로, 간결하게
  const infoLines = [];
  infoLines.push(\`장비분류 : <b>\${escapeHtml(it.part || '-')}</b>\`);
  if(it.totalOption && it.totalOption.length){
    it.totalOption.forEach(l => infoLines.push(l));
  }
  sectionsHtml += \`<div class="item-section">
    \${infoLines.map(l => \`<div class="item-line">\${l}</div>\`).join('')}
    \${it.totalOption && it.totalOption.length ? \`<div class="opt-legend"><span><i style="background:#3ddc84"></i>추가옵션</span><span><i style="background:#b06bff"></i>주문서</span><span><i style="background:#ffcf3d"></i>스타포스</span></div>\` : ''}
  </div>\`;

  if(it.potential && (it.potential.grade || it.potential.lines.length)){
    const g = it.potential.grade;
    const color = g ? GRADE_COLOR[g] : '#3ddc84';
    const letter = g ? (GRADE_LETTER[g] || 'L') : 'L';
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title" style="color:\${color}"><span class="grade-chip" style="background:\${color}">\${letter}</span> 잠재옵션\${g ? \` (\${escapeHtml(g)})\` : ''}</div>
      \${it.potential.lines.length ? it.potential.lines.map(l => \`<div class="item-line potential" style="color:\${color}">\${escapeHtml(l)}</div>\`).join('') : '<div class="no-detail">옵션 없음</div>'}
    </div>\`;
  }

  if(it.addPotential && (it.addPotential.grade || it.addPotential.lines.length)){
    const g = it.addPotential.grade;
    const color = g ? GRADE_COLOR[g] : '#3ddc84';
    const letter = g ? (GRADE_LETTER[g] || 'L') : 'L';
    sectionsHtml += \`<div class="item-section">
      <div class="item-section-title" style="color:\${color}"><span class="grade-chip" style="background:\${color}">\${letter}</span> 에디셔널 잠재옵션\${g ? \` (\${escapeHtml(g)})\` : ''}</div>
      \${it.addPotential.lines.length ? it.addPotential.lines.map(l => \`<div class="item-line add-potential" style="color:\${color}">\${escapeHtml(l)}</div>\`).join('') : '<div class="no-detail">옵션 없음</div>'}
    </div>\`;
  }

  const titleName = it.starforce && Number(it.starforce) > 0
    ? \`\${escapeHtml(it.name)} (+\${escapeHtml(String(it.starforce))})\`
    : escapeHtml(it.name);

  const starsHtml = (it.starforce && Number(it.starforce) > 0) ? renderStars(Number(it.starforce)) : '';

  itemModal.innerHTML = \`
    <button class="modal-close" id="modalCloseBtn">✕</button>
    \${starsHtml}
    <div class="item-modal-icon-wrap" style="--icon-border:\${iconBorder};">
      <img src="\${it.icon}" alt="\${escapeHtml(it.name)}">
    </div>
    <div class="item-modal-title">
      <div class="name">\${titleName}</div>
      \${overallGrade ? \`<div class="grade" style="color:\${iconBorder}">(\${escapeHtml(overallGrade)} 아이템)</div>\` : ''}
    </div>
    <div class="item-modal-divider"></div>
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

function formatPowerKR(power){
  const n = Number(power);
  if(!n || isNaN(n)) return String(power);
  if(n < 10000) return n.toLocaleString('ko-KR');

  const eok = Math.floor(n / 100000000);
  const afterEok = n % 100000000;
  const man = Math.floor(afterEok / 10000);
  const rest = afterEok % 10000;

  let out = '';
  if(eok > 0) out += eok.toLocaleString('ko-KR') + '억 ';
  if(man > 0) out += man.toLocaleString('ko-KR') + '만 ';
  if(rest > 0) out += String(rest).padStart(man > 0 || eok > 0 ? 4 : 1, '0');
  return out.trim() || '0';
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
    const power = combatPowerStat ? combatPowerStat.stat_value : 0;

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
          totalOption: formatOptionBreakdown(it.item_total_option, it.item_base_option, it.item_add_option, it.item_starforce_option),
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
      power: power || '\uc815\ubcf4 \uc5c6\uc74c',
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
