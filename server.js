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
    .modal-box { background: white; width: 340px; padding: 25px; border-radius: 15px; position: relative; text-align: left; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
    .close-btn { position: absolute; top: 15px; right: 20px; font-size: 24px; cursor: pointer; color: #aaa; }
    .close-btn:hover { color: #333; }
    .modal-header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 15px; }
    .modal-header img { width: 55px; height: 55px; background: #f9f9f9; border-radius: 8px; padding: 5px; border: 1px solid #eee; }
    .modal-header h3 { margin: 0; font-size: 18px; color: #222; }
    
    /* 모달 내부 스탯 리스트 */
    .stat-list { list-style: none; padding: 0; margin: 0; font-size: 14px; color: #444; line-height: 2; }
    .stat-list li { border-bottom: 1px dashed #eee; padding: 5px 0; }
    .stat-list li:last-child { border-bottom: none; }
    .stat-list strong { color: #ff9900; display: inline-block; width: 80px; }
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

    function openModal(idx) {
      const item = equipData[idx];
      document.getElementById('modalTitle').innerText = item.item_name;
      document.getElementById('modalImg').src = item.item_icon;
      
      const part = item.item_equipment_part || '-';
      const sf = (item.starforce && item.starforce !== '0') ? item.starforce + '성' : '없음';
      const pot = item.potential_option_1 || '없음';
      const add = item.additional_potential_option_1 || '없음';

      document.getElementById('modalContent').innerHTML = 
        '<ul class="stat-list">' +
          '<li><strong>분류</strong> ' + part + '</li>' +
          '<li><strong>스타포스</strong> ⭐ ' + sf + '</li>' +
          '<li><strong>잠재능력</strong> ' + pot + '</li>' +
          '<li><strong>에디셔널</strong> ' + add + '</li>' +
        '</ul>';
        
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
