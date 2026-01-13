import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

/**
 * Vercel Serverless Function for Coupang API Proxy
 * 프론트엔드에서의 CORS 에러를 방지하고, Secret Key를 안전하게 사용하여 API를 호출합니다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 설정 (프론트엔드 주소에 맞춰 제한하는 것이 좋음)
  res.setHeader('Access-Control-Allow-Credentials', "true");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
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
    res.status(400).json({ error: 'Missing required credentials' });
    return;
  }

  try {
    // 1. 날짜 범위 설정 (어제 ~ 오늘)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const createdAtTo = now.toISOString().split('.')[0];
    const createdAtFrom = yesterday.toISOString().split('.')[0];

    // 2. 경로 및 쿼리 구성
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
    const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=ACCEPT`;

    // 3. HMAC 서명 생성 (Node.js crypto 모듈 사용)
    const { signature, datetime } = generateSignature('GET', path, query, secretKey);

    // 4. 쿠팡 API 호출
    const url = `https://api-gateway.coupang.com${path}?${query}`;
    
    const apiResponse = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `HMAC-SHA256 ${accessKey}:${signature}`,
            'X-Requested-By': vendorId,
            'X-Cou-Date': datetime
        }
    });

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`Coupang API Error: ${apiResponse.status} - ${errorText}`);
        res.status(apiResponse.status).json({ error: errorText });
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
    // YYMMDDTHHMMSSZ
    const iso = date.toISOString(); 
    const datetime = iso.replace(/[-:]/g, '').split('.')[0] + 'Z'; 
    const coupangDate = datetime.substring(2); 

    const message = coupangDate + method + path + (query ? '?' + query : '');

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    return { signature, datetime: coupangDate };
}
