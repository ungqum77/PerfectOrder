import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// Vercel Serverless Function 설정 (Node.js 런타임 및 타임아웃)
export const config = {
  maxDuration: 10, // 초 단위
};

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

  // [중요] 서버 사이드 데이터 정제 (Trim)
  // 사용자가 복사/붙여넣기 할 때 포함된 공백을 강제로 제거합니다.
  const cleanVendorId = vendorId ? String(vendorId).trim() : '';
  const cleanAccessKey = accessKey ? String(accessKey).trim() : '';
  const cleanSecretKey = secretKey ? String(secretKey).trim() : '';

  if (!cleanVendorId || !cleanAccessKey || !cleanSecretKey) {
    res.status(400).json({ error: 'Missing required credentials (vendorId, accessKey, secretKey)' });
    return;
  }

  // 1. 상태값 매핑 (Status Mapping)
  const statusMap: Record<string, string> = {
      'NEW': 'ACCEPT',          // 결제완료
      'PREPARING': 'INSTRUCT',  // 상품준비중
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
  const targetStatus = statusMap[rawStatus] || rawStatus;

  try {
    // 2. 날짜 범위 설정 (KST 기준, 최근 7일)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstGap = 9 * 60 * 60 * 1000;
    const nowKst = new Date(utc + kstGap);

    const tomorrowKst = new Date(nowKst);
    tomorrowKst.setDate(tomorrowKst.getDate() + 1); 

    const pastKst = new Date(nowKst);
    pastKst.setDate(pastKst.getDate() - 7); 

    const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const createdAtTo = fmt(tomorrowKst);
    const createdAtFrom = fmt(pastKst);

    // 3. 경로 및 쿼리 파라미터 구성
    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
    const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;

    // 4. HMAC 서명 생성
    const { signature, datetime } = generateSignature(method, path, query, cleanSecretKey);

    // 5. 쿠팡 API 호출
    const url = `https://api-gateway.coupang.com${path}?${query}`;
    
    console.log(`[Coupang Proxy] Call: ${targetStatus} (${createdAtFrom} ~ ${createdAtTo})`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

    const apiResponse = await fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
            'X-Requested-By': cleanVendorId,
            'X-Cou-Date': datetime
        },
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`Coupang API Error (${targetStatus}): ${apiResponse.status} - ${errorText}`);
        
        let hint = "";
        // 403/401 에러 상세 가이드
        if (apiResponse.status === 403 || apiResponse.status === 401 || errorText.includes("Access Denied")) {
            hint = "⚠️ [접속 권한 오류] IP 차단 또는 키 정보가 잘못되었습니다.\n\n1. 쿠팡 윙에서 IP(0.0.0.0)를 등록했는지 확인하세요.\n2. IP 등록 직후라면 최대 1시간 정도 반영 시간이 걸릴 수 있습니다.\n3. Vendor ID와 Access/Secret Key에 공백이 없는지 확인하세요.";
        }

        res.status(apiResponse.status).json({ 
            error: 'Coupang API Request Failed',
            details: errorText,
            hint: hint, 
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
    const iso = date.toISOString(); 
    const datetime = iso.replace(/[-:]/g, '').split('.')[0] + 'Z'; 
    const coupangDate = datetime.substring(2); 

    const message = coupangDate + method + path + (query ? '?' + query : '');

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    return { signature, datetime: coupangDate };
}