import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import CryptoJS from 'crypto-js';

export const config = {
  maxDuration: 10,
};

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

      // [핵심 1] 모든 공백 제거 및 Vendor ID 대문자 강제 변환
      const cleanVendorId = String(vendorId || '').replace(/\s+/g, '').toUpperCase();
      const cleanAccessKey = String(accessKey || '').replace(/\s+/g, '');
      const cleanSecretKey = String(secretKey || '').replace(/\s+/g, '');

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
      let httpsAgent: any = undefined;

      if (proxyUrl) {
          try {
            httpsAgent = new HttpsProxyAgent(proxyUrl);
          } catch (agentError) {
             console.error("Proxy Agent Creation Failed:", agentError);
          }
      }

      // [IP 확인]
      let currentIp = "Unknown";
      try {
          const ipRes = await axios.get('https://api.ipify.org?format=json', {
              httpsAgent: httpsAgent,
              proxy: false 
          });
          currentIp = ipRes.data.ip;
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

      // YYYY-MM-DD 형식 포맷터
      const fmt = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
      };

      const createdAtTo = req.body.createdAtTo || fmt(tomorrowKst);
      const createdAtFrom = req.body.createdAtFrom || fmt(nowKst);

      // 3. 경로 및 서명 생성 (CryptoJS 사용)
      const method = 'GET';
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
      const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;
      
      const { signature, datetime, message } = generateSignature(method, path, query, cleanSecretKey);
      const url = `https://api-gateway.coupang.com${path}?${query}`;

      // 5. 쿠팡 API 호출
      console.log(`[Coupang] Call: ${targetStatus} / IP: ${currentIp}`);
      
      const apiResponse = await axios({
          method: method,
          url: url,
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
              'X-Requested-By': cleanVendorId,
              'X-Cou-Date': datetime,
              'User-Agent': 'PerfectOrder/1.0'
          },
          httpsAgent: httpsAgent,
          proxy: false,
          validateStatus: () => true
      });

      if (apiResponse.status >= 400) {
          const errorData = apiResponse.data;
          const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
          
          console.error(`Coupang Error: ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          // 401: Unauthorized (서명 오류, 키 오류, IP 반영 지연)
          if (apiResponse.status === 401 || errorText.includes("Request is not authorized")) {
             hint = `🔑 [인증 실패]\n1. 방금 IP를 등록하셨다면 **최대 10분** 정도 기다려야 반영됩니다. 잠시 후 다시 시도해주세요.\n2. Access Key와 Secret Key가 서로 바뀌지 않았는지 확인해주세요.\n3. 업체 코드(Vendor ID)가 정확한지 확인해주세요 (${cleanVendorId}).`;
          }
          // 403: Forbidden (IP 차단)
          else if (apiResponse.status === 403 || errorText.includes("Access Denied") || errorText.includes("ACL")) {
             hint = `⚠️ [접속 차단]\n감지된 서버 IP [${currentIp}]가 쿠팡 윙에 등록되어 있지 않습니다.\n등록 후 **10분 뒤**에 다시 시도해주세요.`;
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

      const data = apiResponse.data;
      
      const responseWithDebug = {
          ...data,
          currentIp: currentIp,
          debugInfo: {
              dateRange: { from: createdAtFrom, to: createdAtTo },
              targetStatus,
              httpStatus: apiResponse.status
          }
      };

      res.status(200).json(responseWithDebug);

  } catch (error: any) {
    console.error(`Server Error:`, error);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        details: error.message || "Unknown Error",
        currentIp: 'Unknown'
    });
  }
}

// [핵심 2] 서명 생성 함수 (CryptoJS 사용으로 표준화)
function generateSignature(method: string, path: string, query: string, secretKey: string) {
    const date = new Date();
    const iso = date.toISOString(); 
    // Format: YYMMDDTHHMMSSZ
    const datetime = iso.replace(/[-:]/g, '').split('.')[0] + 'Z'; 
    const coupangDate = datetime.substring(2); 

    const message = coupangDate + method + path + (query ? '?' + query : '');

    // NodeJS crypto 모듈 대신 crypto-js 사용 (호환성 보장)
    const hmac = CryptoJS.HmacSHA256(message, secretKey);
    const signature = hmac.toString(CryptoJS.enc.Hex);

    return { signature, datetime: coupangDate, message };
}

function maskUrl(url: string) {
    try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}`;
    } catch {
        return 'Invalid URL';
    }
}