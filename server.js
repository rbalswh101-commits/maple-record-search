require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const NEXON_API_KEY = process.env.NEXON_API_KEY;
const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

if (!NEXON_API_KEY) {
  console.warn('WARNING: NEXON_API_KEY가 설정되지 않았습니다.');
}

// --- [백엔드] 한국 시간(KST) 기준 어제 날짜 구하기 ---
function getYesterdayKST() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  kst.setDate(kst.getDate() - 1);
  
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// --- [백엔드] 넥슨 API 통신 유틸리티 ---
async function nexonGet(pathname, params) {
  const url = new URL(BASE_URL + pathname);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url, {
    headers: { 'x-nxopen-api-key': NEXON_API_KEY }
  });

  const rawText = await res.text();
  let body;
  try { body = JSON.parse(rawText); } catch (e) { body = { raw: rawText }; }

  if (!res.ok) {
    throw new Error(body.error?.message || 'Nexon API error');
  }
  return body;
}

// --- [백엔드] 캐릭터 검색 API ---
app.get('/api/search/:name', async (req, res) => {
  try {
    const characterName = req.params.name;
    const dateQuery = getYesterdayKST();

    const idData = await nexonGet('/id', { character_name: characterName });
    const equipData = await nexonGet('/character/item-equipment', { 
      ocid: idData.ocid, 
      date: dateQuery 
    });

    res.json(equipData.item_equipment || []);
  } catch (error) {
    res.status(500).json({ error: '캐릭터 정보를 불러오는데 실패했습니다.' });
  }
});

// --- [프론트엔드] 단일 웹페이지 렌더링 ---
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>메이플 장비 검색기</title>
  <style>
    /* 전체 배경 및 폰트 */
    body { background-color: #f4f6f8; font-family: 'Malgun Gothic', sans-serif; margin: 0; padding: 20px; text-align: center; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 30px; }
    
    /* 검색창 영역 */
    .search-box { margin-bottom: 25px; }
    input { padding: 12px; width: 60%; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; outline: none; }
    input:focus { border-color: #ff9900; }
    button { padding: 12px 25px; font-size: 16px; background-color: #ff9900; border: none; color: white; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s; }
    button:hover { background-color: #e68a00; }
    
    #statusMsg { color: #666; margin-bottom: 20px; font-weight: bold; }
    
    /* 아이템 목록 영역 */
    #item-container { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; }
    .item-card { width: 110px; padding: 15px; background: #fff; border: 1px solid #eee; border-radius: 10px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    .item-card:hover { transform: translateY(-5px); border-color: #ff9900; box-shadow: 0 5px 15px rgba(255,153,0,0.2); }
    .item-card img { width: 50px; height: 50px; }
    .item-card p { font-size: 12px; margin-top: 10px; color: #444; word-break: keep-all; line-height: 1.4; }
    
    /* 모달창 디자인 */
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 1000; justify-content: center; align-items: center; }
    .modal-box { background: white; width: 360px; max-height: 80vh; overflow-y: auto; padding: 25px; border-radius: 15px; position: relative; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    .modal-box::-webkit-scrollbar { width: 8px; }
    .modal-box::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
    
    .close-btn { position: absolute; top: 15px; right: 20px; font-size: 24px; cursor: pointer; color: #aaa; }
    .close-btn:hover { color: #333; }
    .modal-header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 15px; }
    .modal-header img { width: 55px; height: 55px; background: #f9f9f9; border-radius: 8px; padding: 5px; border: 1px solid #eee; }
    .modal-header h3 { margin: 0; font-size: 18px; color: #222; word-break: keep-all; }
    
    /* 상세 정보 스탯 디자인 */
    .stat-list { list-style: none; padding: 0; margin: 0; font-size: 14px; color: #333; line-height: 1.8; }
    .stat-list li { margin-bottom: 4px; }
    .stat-label { display: inline-block; width: 90px; color: #555; }
    .add-stat { color: #009900; font-weight: bold; } /* 추옵 초록색 */
    .divider { border: 0; border-top: 1px dashed #ddd; margin: 12px 0; }
    
    .pot-title { font-weight: bold; margin-top: 10px; color: #000; }
    .pot-grade { color: #d32f2f; font-weight: bold; font-size: 13px; }
    .pot-line { padding-left: 10px; font-size: 13px; color: #444; }
  </style>
</head>
<body>

  <div class="container">
    <h1>🍁 메이플스토리 장비 검색기</h1>
    <div class="search-box">
      <input type="text" id="charName" placeholder="캐릭터 닉네임을 입력하세요">
      <button id="searchBtn">검색</button>
    </div>
    <div id="statusMsg"></div>
    <div id="item-container"></div>
  </div>

  <div class="modal-overlay" id="itemModal">
    <div class="modal-box">
      <span class="close-btn" id="closeBtn">&times;</span>
      <div class="modal-header">
        <img id="modalImg" src="" alt="아이템 아이콘">
        <h3 id="modalTitle">아이템 이름</h3>
      </div>
      <div id="modalContent"></div>
    </div>
  </div>

  <script>
    let equipData = [];
    
    document.getElementById('searchBtn').addEventListener('click', async function() {
      const name = document.getElementById('charName').value.trim();
      if (!name) return alert('닉네임을 입력해주세요.');
      
      const statusMsg = document.getElementById('statusMsg');
      const container = document.getElementById('item-container');
      
      statusMsg.innerText = '데이터를 불러오는 중입니다... ⏳';
      container.innerHTML = '';
      
      try {
        const res = await fetch('/api/search/' + encodeURIComponent(name));
        if (!res.ok) throw new Error('조회 실패');
        
        equipData = await res.json();
        if (equipData.length === 0) {
          statusMsg.innerText = '장착 중인 장비가 없습니다.';
          return;
        }
        
        statusMsg.innerText = "✨ '" + name + "'님의 장비 목록 ✨";
        
        equipData.forEach(function(item, idx) {
          const card = document.createElement('div');
          card.className = 'item-card';
          card.innerHTML = '<img src="' + item.item_icon + '"><p>' + item.item_name + '</p>';
          card.onclick = function() { openModal(idx); };
          container.appendChild(card);
        });
        
      } catch (e) {
        statusMsg.innerText = '❌ 오류 발생: 닉네임을 다시 확인해주세요.';
      }
    });

    // 아이템 상세 스탯 추출 로직
    function openModal(idx) {
      const item = equipData[idx];
      document.getElementById('modalTitle').innerText = item.item_name;
      document.getElementById('modalImg').src = item.item_icon;
      
      let html = '<ul class="stat-list">';
      
      // 1. 기본 정보 (분류, 스타포스, 업그레이드)
      html += '<li><strong class="stat-label">장비분류</strong> ' + (item.item_equipment_part || '-') + '</li>';
      html += '<li><strong class="stat-label">스타포스</strong> ⭐ ' + (item.starforce || '0') + '성</li>';
      
      if (item.scroll_upgrade && item.scroll_upgrade !== '0') {
        html += '<li><strong class="stat-label">주문서 작</strong> +' + item.scroll_upgrade + ' (업그레이드 가능: ' + item.scroll_upgradable_count + ')</li>';
      }
      if (item.cuttable_count && item.cuttable_count !== '255') {
        html += '<li><strong class="stat-label">가위 횟수</strong> ' + item.cuttable_count + '회</li>';
      }

      html += '<hr class="divider">';

      // 2. 세부 스탯 파싱 함수 (총합 스탯 + 추옵 표시)
      const total = item.item_total_option || {};
      const add = item.item_add_option || {};

      function getStat(label, key, isPercent) {
        if (total[key] && total[key] !== '0') {
          let unit = isPercent ? '%' : '';
          let text = '<li><strong class="stat-label">' + label + '</strong> ' + total[key] + unit;
          // 추옵이 존재하면 괄호 치고 초록색으로 표시
          if (add[key] && add[key] !== '0') {
            text += ' <span class="add-stat">(+' + add[key] + unit + ')</span>';
          }
          text += '</li>';
          return text;
        }
        return '';
      }

      // 주요 스탯 나열
      html += getStat('STR', 'str', false);
      html += getStat('DEX', 'dex', false);
      html += getStat('INT', 'int', false);
      html += getStat('LUK', 'luk', false);
      html += getStat('최대 HP', 'max_hp', false);
      html += getStat('최대 MP', 'max_mp', false);
      html += getStat('공격력', 'attack_power', false);
      html += getStat('마력', 'magic_power', false);
      html += getStat('보스 데미지', 'boss_damage', true);
      html += getStat('방어율 무시', 'ignore_monster_armor', true);
      html += getStat('올스탯', 'all_stat', true);

      // 3. 잠재능력
      if (item.potential_option_grade) {
        html += '<hr class="divider">';
        html += '<div class="pot-title">잠재능력 <span class="pot-grade">[' + item.potential_option_grade + ']</span></div>';
        if (item.potential_option_1) html += '<li class="pot-line">- ' + item.potential_option_1 + '</li>';
        if (item.potential_option_2) html += '<li class="pot-line">- ' + item.potential_option_2 + '</li>';
        if (item.potential_option_3) html += '<li class="pot-line">- ' + item.potential_option_3 + '</li>';
      }

      // 4. 에디셔널 잠재능력
      if (item.additional_potential_option_grade) {
        html += '<hr class="divider">';
        html += '<div class="pot-title">에디셔널 <span class="pot-grade">[' + item.additional_potential_option_grade + ']</span></div>';
        if (item.additional_potential_option_1) html += '<li class="pot-line">- ' + item.additional_potential_option_1 + '</li>';
        if (item.additional_potential_option_2) html += '<li class="pot-line">- ' + item.additional_potential_option_2 + '</li>';
        if (item.additional_potential_option_3) html += '<li class="pot-line">- ' + item.additional_potential_option_3 + '</li>';
      }

      html += '</ul>';
      document.getElementById('modalContent').innerHTML = html;
      document.getElementById('itemModal').style.display = 'flex';
    }

    // 모달 닫기 이벤트
    document.getElementById('closeBtn').onclick = function() {
      document.getElementById('itemModal').style.display = 'none';
    };
    document.getElementById('itemModal').onclick = function(e) {
      if (e.target === this) this.style.display = 'none';
    };
    
    // 엔터키 검색
    document.getElementById('charName').addEventListener('keyup', function(e) {
      if (e.key === 'Enter') document.getElementById('searchBtn').click();
    });
  </script>
</body>
</html>
  `);
});

// 서버 실행
app.listen(PORT, () => {
  console.log('서버 실행 완료! 포트: ' + PORT);
});
