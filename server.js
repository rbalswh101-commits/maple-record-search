// server.js
// 메이플스토리 캐릭터 기록검색 - 단일 파일 버전 (아이템 정보 + 상세 모달 추가)

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
    err
