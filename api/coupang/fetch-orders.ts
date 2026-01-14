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

  try {
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

      // 4. Proxy Agent 설정
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      let agent: any = undefined;

      if (proxyUrl) {
          try {
            console.log(`🚀 Proxy 사용 중: ${maskUrl(proxyUrl)}`);
            agent = new HttpsProxyAgent(proxyUrl);
          } catch (agentError) {
             console.error("Proxy Agent Creation Failed:", agentError);
             // Agent 생성 실패시 agent 없이 진행 시도하거나 에러 처리
          }
      } else {
          console.log("✈️ Direct 연결 중 (Proxy 없음)");
      }

      // [IP 확인]
      let currentIp = "Unknown";
      try {
          const ipRes = await fetch('https://api.ipify.org?format=json', { agent });
          const ipData: any = await ipRes.json();
          currentIp = ipData.ip;
      } catch (e) {
          console.error("IP check failed:", e);
      }

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

      // 5. 쿠팡 API 호출
      console.log(`[Coupang Proxy] Call: ${targetStatus} (${createdAtFrom} ~ ${createdAtTo})`);
      
      const apiResponse = await fetch(url, {
          method: method,
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
              'X-Requested-By': cleanVendorId,
              'X-Cou-Date': datetime
          },
          agent: agent 
      });

      if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          console.error(`Coupang API Error (${targetStatus}): ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          if (apiResponse.status === 403 || apiResponse.status === 401 || errorText.includes("Access Denied")) {
               if (proxyUrl) {
                  hint = `⚠️ [프록시 접속 차단] 고정 IP(${currentIp})가 쿠팡 윙에 등록되어 있는지 확인해주세요.`;
              } else {
                  hint = `⚠️ [접속 권한 오류] IP 차단 문제입니다.\n아래 감지된 서버 IP [${currentIp}]를 쿠팡 윙에 등록하거나, 고정 IP 프록시를 설정하세요.`;
              }
          }

          res.status(apiResponse.status).json({ 
              error: 'Coupang API Request Failed',
              details: errorText,
              hint: hint, 
              currentIp: currentIp,
              targetStatus: targetStatus
          });
          return;
      }

      const data = await apiResponse.json();
      
      const responseWithDebug = {
          ...data,
          currentIp: currentIp,
          debugInfo: {
              dateRange: { from: createdAtFrom, to: createdAtTo },
              targetStatus,
              mappedFrom: status || 'default',
              usingProxy: !!proxyUrl,
              httpStatus: apiResponse.status
          }
      };

      res.status(200).json(responseWithDebug);

  } catch (error: any) {
    console.error(`Server Error:`, error);
    // 핸들러 내부 크래시 방지 및 JSON 응답 보장
    res.status(500).json({ 
        error: 'Internal Server Error', 
        details: error.message,
        currentIp: 'Unknown'
    });
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
