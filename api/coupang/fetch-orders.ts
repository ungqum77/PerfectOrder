import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

      // [핵심 수정] 키 값에 포함된 공백, 줄바꿈 등 모든 화이트스페이스 제거 (복사/붙여넣기 오류 방지)
      const cleanVendorId = String(vendorId || '').replace(/\s+/g, '');
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
            console.log(`🚀 Proxy 사용 중: ${maskUrl(proxyUrl)}`);
            httpsAgent = new HttpsProxyAgent(proxyUrl);
          } catch (agentError) {
             console.error("Proxy Agent Creation Failed:", agentError);
          }
      }

      // [IP 확인] - 프록시가 정상 작동하는지 확인
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

      // 3. 경로 및 서명 생성
      const method = 'GET';
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
      const query = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;
      
      // [핵심 수정] 서명 생성 로직 호출
      const { signature, datetime } = generateSignature(method, path, query, cleanSecretKey);
      const url = `https://api-gateway.coupang.com${path}?${query}`;

      // 5. 쿠팡 API 호출
      console.log(`[Coupang Proxy] Call: ${targetStatus} (${createdAtFrom} ~ ${createdAtTo})`);
      
      const apiResponse = await axios({
          method: method,
          url: url,
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
              'X-Requested-By': cleanVendorId,
              'X-Cou-Date': datetime,
              'User-Agent': 'PerfectOrder/1.0' // 차단 방지용 User-Agent 추가
          },
          httpsAgent: httpsAgent,
          proxy: false, // axios의 기본 proxy 설정 비활성화 (httpsAgent 사용 위함)
          validateStatus: () => true // 모든 상태 코드 허용 (에러 핸들링 직접 수행)
      });

      // 에러 핸들링
      if (apiResponse.status >= 400) {
          const errorData = apiResponse.data;
          const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
          
          console.error(`Coupang API Error (${targetStatus}): ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          // 401 Unauthorized: 서명 오류 또는 키 오류
          if (apiResponse.status === 401 || errorText.includes("Request is not authorized")) {
             hint = "🔑 [인증 실패] Access Key 또는 Secret Key가 올바르지 않거나, 업체 코드(Vendor ID)가 일치하지 않습니다.\n키 값에 공백이 없는지 확인해주세요.";
          }
          // 403 Forbidden: IP 차단
          else if (apiResponse.status === 403 || errorText.includes("Access Denied")) {
             if (proxyUrl) {
                hint = `⚠️ [프록시 접속 차단] 고정 IP(${currentIp})가 쿠팡 윙에 등록되어 있는지 확인해주세요.`;
            } else {
                hint = `⚠️ [접속 권한 오류] IP 차단 문제입니다. 서버 IP [${currentIp}]를 쿠팡 윙에 등록하세요.`;
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

// 쿠팡 API v2 서명 생성 함수
function generateSignature(method: string, path: string, query: string, secretKey: string) {
    const date = new Date();
    const iso = date.toISOString(); 
    // Format: YYMMDDTHHMMSSZ
    const datetime = iso.replace(/[-:]/g, '').split('.')[0] + 'Z'; 
    const coupangDate = datetime.substring(2); 

    const message = coupangDate + method + path + (query ? '?' + query : '');

    const hmac = createHmac('sha256', secretKey);
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