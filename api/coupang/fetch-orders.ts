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

  const { vendorId, accessKey, secretKey, status } = req.body;

  if (!vendorId || !accessKey || !secretKey) {
    res.status(400).json({ error: 'Missing required credentials (vendorId, accessKey, secretKey)' });
    return;
  }

  // 1. 상태값 매핑 (Status Mapping) - 친구분의 조언 반영
  // 프론트엔드에서 실수로 'NEW'를 보내도 쿠팡 코드인 'ACCEPT'로 변환하여 처리
  const statusMap: Record<string, string> = {
      'NEW': 'ACCEPT',          // 결제완료
      'PREPARING': 'INSTRUCT',  // 상품준비중 (또는 PENDING)
      'PENDING': 'INSTRUCT',    
      'SHIPPING': 'DEPARTURE',  // 배송지시
      'DELIVERING': 'DELIVERING', // 배송중
      'COMPLETED': 'FINAL_DELIVERY', // 배송완료
      'DELIVERED': 'FINAL_DELIVERY',
      'CANCEL': 'CANCEL',       // 취소
      'RETURN': 'RETURN',       // 반품
      'EXCHANGE': 'EXCHANGE'    // 교환
  };

  const rawStatus = status ? status.toUpperCase() : 'ACCEPT';
  // 매핑 테이블에 있으면 변환값 사용, 없으면 원본 사용 (이미 올바른 코드일 수 있음)
  const targetStatus = statusMap[rawStatus] || rawStatus;

  try {
    // 2. 날짜 범위 설정 (KST 기준, 최근 7일)
    // 서버가 UTC일 수 있으므로 한국 시간(UTC+9)으로 강제 변환
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstGap = 9 * 60 * 60 * 1000;
    const nowKst = new Date(utc + kstGap);

    const tomorrowKst = new Date(nowKst);
    tomorrowKst.setDate(tomorrowKst.getDate() + 1); // 종료일을 내일로 설정하여 오늘 23:59:59까지 커버

    const pastKst = new Date(nowKst);
    pastKst.setDate(pastKst.getDate() - 7); // 7일 전

    // 포맷 헬퍼: YYYY-MM-DD
    const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const createdAtTo = fmt(tomorrowKst);
    const createdAtFrom = fmt(pastKst);

    // 3. 경로 및 쿼리 파라미터 구성
    // [중요] 쿼리 파라미터는 알파벳 순서대로 정렬되어야 HMAC 서명이 올바르게 생성됩니다.
    // createdAtFrom (c) -> createdAtTo (c) -> status (s)
    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${vendorId}/ordersheets`;
    const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;

    // 4. HMAC 서명 생성
    const { signature, datetime } = generateSignature(method, path, query, secretKey);

    // 5. 쿠팡 API 호출
    const url = `https://api-gateway.coupang.com${path}?${query}`;
    
    // 디버깅 로그 (서버 로그에서 확인 가능)
    console.log(`[Coupang Proxy] Call: ${targetStatus} (${createdAtFrom} ~ ${createdAtTo})`);
    
    // 타임아웃 20초 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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
        console.error(`Coupang API Error (${targetStatus}): ${apiResponse.status} - ${errorText}`);
        
        let hint = "";
        // 403(Forbidden) 또는 401(Unauthorized)일 경우 IP 문제일 확률이 높음
        if (apiResponse.status === 403 || apiResponse.status === 401 || errorText.includes("Access Denied")) {
            hint = "⚠️ 쿠팡 API 접속 권한이 없습니다. [쿠팡 윙 > 판매자 정보 > 오픈API] 설정에서 접속하려는 곳의 IP를 등록했는지 확인하세요. (테스트용: 0.0.0.0/0)";
        }

        // 에러 상세 내용을 클라이언트로 전달
        res.status(apiResponse.status).json({ 
            error: 'Coupang API Request Failed',
            details: errorText,
            hint: hint, // 프론트엔드에서 보여줄 힌트 메시지
            targetStatus: targetStatus,
            dateRange: { from: createdAtFrom, to: createdAtTo }
        });
        return;
    }

    const data = await apiResponse.json();
    
    const responseWithDebug = {
        ...data,
        debugInfo: {
            dateRange: { from: createdAtFrom, to: createdAtTo },
            targetStatus,
            mappedFrom: status || 'default'
        }
    };

    res.status(200).json(responseWithDebug);

  } catch (error: any) {
    console.error(`Server Error (${targetStatus}):`, error);
    res.status(500).json({ error: error.message || 'Internal Server Error', targetStatus });
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