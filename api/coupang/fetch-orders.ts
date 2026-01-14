import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHmac } from 'crypto';

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

      // [핵심] 입력값 공백 제거 (복사/붙여넣기 오류 방지)
      const cleanVendorId = String(vendorId || '').trim().toUpperCase();
      const cleanAccessKey = String(accessKey || '').trim();
      const cleanSecretKey = String(secretKey || '').trim();

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

      // 2. Proxy Agent 설정 (IP 화이트리스트 대응)
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      let httpsAgent: any = undefined;

      if (proxyUrl) {
          try {
            httpsAgent = new HttpsProxyAgent(proxyUrl);
            console.log("Using Proxy Agent");
          } catch (agentError) {
             console.error("Proxy Agent Creation Failed:", agentError);
          }
      }

      // [IP 확인 - 디버깅용]
      let currentIp = "Unknown";
      try {
          const ipRes = await axios.get('https://api.ipify.org?format=json', {
              httpsAgent: httpsAgent,
              proxy: false 
          });
          currentIp = ipRes.data.ip;
      } catch (e) {
          console.warn("IP Check Failed");
      }

      // 3. 날짜 범위 설정 (KST 기준)
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

      // 4. 경로 및 쿼리 구성
      const method = 'GET';
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
      
      // [중요] URLSearchParams는 키를 기준으로 자동 정렬되지 않으므로 sort() 필수
      const queryParams = new URLSearchParams();
      queryParams.set('createdAtFrom', createdAtFrom);
      queryParams.set('createdAtTo', createdAtTo);
      queryParams.set('status', targetStatus);
      queryParams.sort(); // 쿠팡 API 필수 요건: 파라미터 알파벳순 정렬

      const queryString = queryParams.toString();
      
      // 5. 서명 생성 (Node.js Native Crypto 사용)
      const { signature, datetime } = generateSignature(method, path, queryString, cleanSecretKey);
      
      // 6. API 호출
      // axios에 params 객체를 넘기지 않고, 직접 구성한 queryString을 사용하여 순서 보장
      const url = `https://api-gateway.coupang.com${path}?${queryString}`;

      console.log(`[Coupang] Request: ${url} (IP: ${currentIp})`);
      
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
          proxy: false, // axios 기본 proxy 설정 끄기 (agent 사용 시 충돌 방지)
          validateStatus: () => true // 모든 상태 코드 허용하여 직접 처리
      });

      if (apiResponse.status >= 400) {
          const errorData = apiResponse.data;
          const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
          
          console.error(`Coupang Error: ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          // 401: Unauthorized (서명 오류, 키 오류, IP 미등록)
          if (apiResponse.status === 401 || errorText.includes("not authorized") || errorText.includes("CMDB")) {
             hint = `🔑 [인증 실패] (401)\n1. 현재 서버 IP [${currentIp}]가 쿠팡 윙에 등록되었는지 확인하세요. (반영까지 최대 10분 소요)\n2. Access Key와 Secret Key가 정확한지 확인하세요.\n3. Vendor ID가 '${cleanVendorId}'가 맞는지 확인하세요.`;
          }
          // 403: Forbidden
          else if (apiResponse.status === 403 || errorText.includes("Access Denied")) {
             hint = `⚠️ [접속 차단] (403)\n현재 IP [${currentIp}]가 허용되지 않았습니다.\n쿠팡 윙에서 IP 등록 상태를 확인해주세요.`;
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

      // 성공
      const data = apiResponse.data;
      res.status(200).json({
          ...data,
          currentIp: currentIp,
          debugInfo: {
              targetStatus,
              httpStatus: apiResponse.status
          }
      });

  } catch (error: any) {
    console.error(`Server Error:`, error);
    res.status(500).json({ 
        error: 'Internal Server Error', 
        details: error.message || "Unknown Error",
        currentIp: 'Unknown'
    });
  }
}

// [핵심] Node.js Native Crypto 모듈 사용 (쿠팡 공식 가이드 준수)
function generateSignature(method: string, path: string, query: string, secretKey: string) {
    // 1. Datetime 생성 (YYMMDDTHHMMSSZ) - UTC 기준
    const d = new Date();
    const yy = String(d.getUTCFullYear()).slice(2);
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    
    const coupangDate = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

    // 2. Message 구성
    // Query가 있으면 ?를 붙여서 연결
    const message = coupangDate + method + path + (query ? '?' + query : '');

    // 3. HMAC-SHA256 서명 생성
    const hmac = createHmac('sha256', secretKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    return { signature, datetime: coupangDate };
}