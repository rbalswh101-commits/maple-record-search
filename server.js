// server.js
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const NEXON_API_KEY = process.env.NEXON_API_KEY;
const BASE_URL = 'https://open.api.nexon.com/maplestory/v1';

if (!NEXON_API_KEY) {
  console.warn('WARNING: NEXON_API_KEY가 설정되지 않았습니다. Render 환경변수를 확인하세요.');
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

// --- [백엔드] 넥슨 API 통신 함수 ---
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
  try {
    body = JSON.parse(rawText);
  } catch (e) {
    body = { raw: rawText };
  }

  if (!res.ok) {
    const err = new Error(body.error?.message || 'Nexon API error');
    throw err;
  }
  return body;
}

// --- [백엔드] 캐릭터 검색 API 엔드포인트 ---
app.get('/api/search/:name', async (req, res) => {
  try {
    const characterName = req.params.name;
    const dateQuery = getYesterdayKST();

    // 1. 캐릭터 이름으로 ocid 조회
    const idData = await nexonGet('/id', { character_name: characterName });
    const ocid = idData.ocid;

    // 2. ocid로 장비(아이템) 목록 조회
    const equipData = await nexonGet('/character/item-equipment', { 
      ocid: ocid, 
      date: dateQuery 
    });

    // 3. 프론트엔드로 데이터 전달
    res.json(equipData.item_equipment || []);

  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: '캐릭터 정보를 불러오는데 실패했습니다.' });
  }
});

// --- [프론트엔드] 메인 웹페이지 렌더링 ---
app.get('/', (req, res) => {
  // 에러 발생 확률을 없애기 위해 복잡한 백틱 연산 대신 깔끔한 HTML 문자열로 전달합니다.
  res.send(`
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>메이플 장비 검색기</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background-color: #f9f9f9; }
    .search-box { margin-bottom: 20px; }
    input { padding: 8px; font-size: 16px; }
    button { padding: 8px 16px; font-size: 16px; cursor: pointer; }
    #item-container { display: flex; flex-wrap: wrap; gap: 10px; }
    .item-card {
      background: #fff; padding: 10px; border: 1px solid #ddd;
      border-radius: 8px; cursor: pointer; text-align: center; width: 120px;
    }
    .item-card:hover { border-color: #888; background: #f0f0f0; }
    .item-card img { width: 40px; height: 40px; }
    .item-card p { font-size: 12px; margin: 5px 0 0; word-break: keep-all; }
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.6); z-index: 999; align-items: center; justify-content: center;
    }
    .modal-box {
      background: #fff; width: 350px; padding: 20px; border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3); position: relative;
    }
    .close-btn { position: absolute; top: 10px; right: 15px; font-size: 24px; cursor: pointer; color: #888; }
    .close-btn:hover { color: #000; }
    .modal-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
    .modal-header img { width: 50px; height: 50px; }
    .stat-list { list-style: none; padding: 0; margin: 0; font-size: 14px; line-height: 1.8; }
  </style>
</head>
<body>

  <h1>🔍 메이플스토리 장비 검색기</h1>
  
  <div class="search-box">
    <input type="text" id="charNameInput" placeholder="캐릭터 닉네임 입력">
    <button id="searchBtn">검색</button>
  </div>

  <div id="statusMessage"></div>
  <div id="item-container"></div>

  <div class="modal-overlay" id="itemModal">
    <div class="modal-box">
      <span class="close-btn" id="closeModalBtn">&times;</span>
      <div class="modal-header">
        <img id="modalImg" src="" alt="아이템 아이콘">
        <h3 id="modalTitle" style="margin:0;">아이템 이름</h3>
      </div>
      <hr>
      <div id="modalContent"></div>
    </div>
  </div>

  <script>
    let currentEquipData = [];

    const searchBtn = document.getElementById('searchBtn');
    const charNameInput = document.getElementById('charNameInput');
    const itemContainer = document.getElementById('item-container');
    const statusMessage = document.getElementById('statusMessage');
    
    const modal = document.getElementById('itemModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const modalTitle = document.getElementById('modalTitle');
    const modalImg = document.getElementById('modalImg');
    const modalContent = document.getElementById('modalContent');

    searchBtn.addEventListener('click', async function() {
      const name = charNameInput.value.trim();
      if (!name) return alert('캐릭터 닉네임을 입력해주세요!');

      statusMessage.innerText = '데이터를 불러오는 중입니다...⏳';
      itemContainer.innerHTML = '';

      try {
        const response = await fetch('/api/search/' + encodeURIComponent(name));
        if (!response.ok) throw new Error('캐릭터를 찾을 수 없거나 API 에러가 발생했습니다.');
        
        currentEquipData = await response.json();
        
        if (currentEquipData.length === 0) {
          statusMessage.innerText = '장착 중인 장비가 없거나 정보를 불러올 수 없습니다.';
          return;
        }

        statusMessage.innerText = "'" + name + "'님의 장비 목록입니다.";
        
        currentEquipData.forEach(function(item, index) {
          const card = document.createElement('div');
          card.className = 'item-card';
          card.dataset.index = index; 
          
          card.innerHTML = '<img src="' + item.item_icon + '" alt="' + item.item_name + '"><p>' + item.item_name + '</p>';
          
          card.addEventListener('click', function() {
            openModal(index);
          });
          itemContainer.appendChild(card);
        });

      } catch (error) {
        statusMessage.innerText = '❌ 검색 실패: ' + error.message;
      }
    });

    function openModal(index) {
      const item = currentEquipData[index];
      
      modalTitle.innerText = item.item_name;
      modalImg.src = item.item_icon;
      
      const part = item.item_equipment_part || '알 수 없음';
      const starforce = (item.starforce && item.starforce !== '0') ? item.starforce + '성' : '없음';
      const pot1 = item.potential_option_1 || '없음';
      const add1 = item.additional_potential_option_1 || '없음';

      modalContent.innerHTML = '<ul class="stat-list">' +
        '<li><strong>분류:</strong> ' + part + '</li>' +
        '<li><strong>스타포스:</strong> ⭐ ' + starforce + '</li>' +
        '<li><strong>잠재능력:</strong> ' + pot1 + '</li>' +
        '<li><strong>에디셔널:</strong> ' + add1 + '</li>' +
        '</ul>';
      
      modal.style.display = 'flex';
    }

    closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
    window.addEventListener('click', function(e) { if (e.target === modal) modal.style.display = 'none'; });
    charNameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') searchBtn.click(); });
  </script>
</body>
</html>
  `);
});

// 서버 가동
app.listen(PORT, function() {
  console.log('서버가 성공적으로 시작되었습니다. 포트: ' + PORT);
});
