import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import fetch from 'node-fetch'; 
import { HttpsProxyAgent } from 'https-proxy-agent';

// Vercel Serverless Function 설정
export const config = {
  maxDuration: 10,
};

/**
 * Vercel Serverless Function for Coupang API Proxy
 * 환경변수 FIXED_IP_PROXY_URL이 설정되어 있으면 해당 프록시를 통해 요청을 보냅니다.
 * node-fetch v2를 사용하여 Vercel 환경에서의 호환성 문제를 방지합니다.
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

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { vendorId, accessKey, secretKey, status } = req.body;

  const cleanVendorId = vendorId ? String(vendorId).trim() : '';
  const cleanAccessKey = accessKey ? String(accessKey).trim() : '';
  const cleanSecretKey = secretKey ? String(secretKey).trim() : '';

  if (!cleanVendorId || !cleanAccessKey || !cleanSecretKey) {
    res.status(400).json({ error: 'Missing required credentials' });
    return;
  }

  // 1. 상태값 매핑
  const statusMap: Record<string, string> = {
      'NEW': 'ACCEPT',
      'PREPARING': 'INSTRUCT',
      'PENDING': 'INSTRUCT',    
      'SHIPPING': 'DEPARTURE',
      'DELIVERING': 'DELIVERING',
      'COMPLETED': 'FINAL_DELIVERY',
      'DELIVERED': 'FINAL_DELIVERY',
      'CANCEL': 'CANCEL',
      'RETURN': 'RETURN',
      'EXCHANGE': 'EXCHANGE'
  };

  const rawStatus = status ? status.toUpperCase() : 'ACCEPT';
  const targetStatus = statusMap[rawStatus] || rawStatus;

  try {
    // 2. 날짜 범위 설정 (KST 기준)
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

    // 3. 경로 및 서명 생성
    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
    const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;
    const { signature, datetime } = generateSignature(method, path, query, cleanSecretKey);
    const url = `https://api-gateway.coupang.com${path}?${query}`;

    // 4. Proxy Agent 설정 (핵심 로직)
    const proxyUrl = process.env.FIXED_IP_PROXY_URL;
    let agent: any = undefined;

    if (proxyUrl) {
        console.log(`🚀 Proxy 사용 중: ${maskUrl(proxyUrl)}`);
        agent = new HttpsProxyAgent(proxyUrl);
    } else {
        console.log("✈️ Direct 연결 중 (Proxy 없음)");
    }

    // 5. 쿠팡 API 호출
    console.log(`[Coupang Proxy] Call: ${targetStatus} (${createdAtFrom} ~ ${createdAtTo})`);
    
    // node-fetch v2는 AbortController 지원이 제한적일 수 있으므로 타임아웃은 fetch 옵션이나 별도 처리 필요하지만
    // Vercel 함수 자체 타임아웃(10초)이 있으므로 여기서는 간단히 처리
    
    const apiResponse = await fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
            'X-Requested-By': cleanVendorId,
            'X-Cou-Date': datetime
        },
        agent: agent // node-fetch v2 지원 옵션
    });

    if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(`Coupang API Error (${targetStatus}): ${apiResponse.status} - ${errorText}`);
        
        let hint = "";
        let currentIp = "";

        // 403/401 에러 시 현재 IP 조회
        if (apiResponse.status === 403 || apiResponse.status === 401 || errorText.includes("Access Denied")) {
            try {
                // 현재 IP 확인 요청
                const ipRes = await fetch('https://api.ipify.org?format=json', {
                    agent: agent
                });
                const ipData: any = await ipRes.json();
                currentIp = ipData.ip;
                
                if (proxyUrl) {
                    hint = `⚠️ [프록시 접속 차단] 고정 IP(${currentIp})가 쿠팡 윙에 등록되어 있는지 확인해주세요.`;
                } else {
                    hint = `⚠️ [접속 권한 오류] IP 차단 문제입니다.\n아래 감지된 서버 IP [${currentIp}]를 쿠팡 윙에 등록하거나, 고정 IP 프록시를 설정하세요.`;
                }
            } catch (e) {
                console.error("IP check failed", e);
                hint = "⚠️ [접속 권한 오류] 쿠팡 윙에 등록된 IP와 현재 서버 IP가 일치하지 않습니다.";
            }
        }

        res.status(apiResponse.status).json({ 
            error: 'Coupang API Request Failed',
            details: errorText,
            hint: hint, 
            currentIp: currentIp,
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
            mappedFrom: status || 'default',
            usingProxy: !!proxyUrl
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

function maskUrl(url: string) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}`;
    } catch {
        return 'Invalid URL';
    }
}