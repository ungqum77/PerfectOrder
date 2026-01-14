import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * Vercel Serverless Function for Coupang API Proxy
 * 프론트엔드에서의 CORS 에러를 방지하고, Secret Key를 안전하게 사용하여 API를 호출합니다.
 * HMAC 서명 생성 규칙 준수: https://developers.coupang.com/hc/en-us/articles/360033660894-Generate-HMAC-signature
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', "true");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { vendorId, accessKey, secretKey } = req.body;

  if (!vendorId || !accessKey || !secretKey) {
    res.status(400).json({ error: 'Missing required credentials (vendorId, accessKey, secretKey)' });
    return;
  }

  try {
    // 1. 날짜 범위 설정 (최근 3일)
    // 쿠팡 API는 조회 기간이 너무 길면 타임아웃 발생 가능
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);

    // 날짜 포맷: YYYY-MM-DD
    const createdAtTo = now.toISOString().split('T')[0];
    const createdAtFrom = threeDaysAgo.toISOString().split('T')[0];

    // 2. 경로 및 쿼리 파라미터 구성
    // [중요] 쿼리 파라미터는 알파벳 순서대로 정렬되어야 HMAC 서명이 올바르게 생성됩니다.
    // createdAtFrom (c) -> createdAtTo (c) -> status (s)
    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
    const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=ACCEPT`;

    // 3. HMAC 서명 생성
    const { signature, datetime } = generateSignature(method, path, query, secretKey);

    // 4. 쿠팡 API 호출
    const url = `https://api-gateway.coupang.com${path}?${query}`;
    
    // 타임아웃 10초 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const apiResponse = await fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `HMAC-SHA256 ${accessKey}:${signature}`,
            'X-Requested-By': vendorId,
            'X-Cou-Date': datetime
        },
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`Coupang API Error: ${apiResponse.status} - ${errorText}`);
        
        // 에러 상세 내용을 클라이언트로 전달
        res.status(apiResponse.status).json({ 
            error: 'Coupang API Request Failed',
            details: errorText,
            statusCode: apiResponse.status
        });
        return;
    }

    const data = await apiResponse.json();
    res.status(200).json(data);

  } catch (error: any) {
    console.error('Server Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

function generateSignature(method: string, path: string, query: string, secretKey: string) {
    const date = new Date();
    // 포맷: YYMMDDTHHMMSSZ (예: 240520T120000Z)
    const iso = date.toISOString(); 
    // ISOString: 2024-05-20T12:00:00.000Z
    // -> 240520T120000Z 로 변환
    const datetime = iso.replace(/[-:]/g, '').split('.')[0] + 'Z'; 
    const coupangDate = datetime.substring(2); 

    // 서명 메시지 생성: Date + Method + Path + Query
    // Query가 있을 경우 '?'를 포함해야 함
    const message = coupangDate + method + path + (query ? '?' + query : '');

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    return { signature, datetime: coupangDate };
}