import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import CryptoJS from 'crypto-js';

export const config = {
  maxDuration: 10,
};

// [강력한 정제 함수] 
// 복사/붙여넣기 시 딸려오는 보이지 않는 공백(Zero-width space 등)까지 제거
const sanitize = (val: any) => {
    if (!val) return '';
    return String(val)
        .replace(/\s+/g, '') // 일반 공백 제거
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // 특수 공백 제거
        .trim();
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

      // 1. 입력값 강력 정제 (가장 중요한 단계)
      const cleanVendorId = sanitize(vendorId).toUpperCase();
      const cleanAccessKey = sanitize(accessKey);
      const cleanSecretKey = sanitize(secretKey);

      if (!cleanVendorId || !cleanAccessKey || !cleanSecretKey) {
        res.status(400).json({ error: '필수 인증 정보가 누락되었습니다.' });
        return;
      }

      // 2. 상태값 매핑
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

      // 3. Proxy Agent 설정
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      let httpsAgent: any = undefined;

      if (proxyUrl) {
          try {
            httpsAgent = new HttpsProxyAgent(proxyUrl);
          } catch (agentError) {
             console.error("Proxy Error:", agentError);
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

      // 4. 날짜 및 쿼리 파라미터 생성
      // 4-1. Signature용 DateTime (UTC, YYMMDDTHHMMSSZ)
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // 4-2. Query Param용 Date (KST 기준 YYYY-MM-DD)
      const kstOffset = 9 * 60 * 60 * 1000;
      const nowKst = new Date(d.getTime() + kstOffset);
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2); // 넉넉하게 +2일

      const fmtDate = (date: Date) => date.toISOString().split('T')[0];
      const createdAtFrom = req.body.createdAtFrom || fmtDate(nowKst);
      const createdAtTo = req.body.createdAtTo || fmtDate(nextDayKst);

      // 5. 경로 및 쿼리 스트링 구성 (수동 조합으로 순서 완벽 보장)
      const method = 'GET';
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
      
      // 중요: 알파벳 순서 (createdAtFrom -> createdAtTo -> status)
      const queryString = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;
      
      // 6. 서명 생성 (crypto-js 사용)
      // Message: DateTime + Method + Path + QueryString
      const message = datetime + method + path + '?' + queryString;
      const signature = CryptoJS.HmacSHA256(message, cleanSecretKey).toString(CryptoJS.enc.Hex);

      const url = `https://api-gateway.coupang.com${path}?${queryString}`;

      console.log(`[Coupang] Call: ${targetStatus} (IP: ${currentIp})`);

      // 7. API 호출
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
          proxy: false, // axios 기본 프록시 비활성화 (agent 충돌 방지)
          validateStatus: () => true // 에러 발생 시에도 catch로 가지 않고 직접 처리
      });

      // 8. 응답 처리
      if (apiResponse.status >= 400) {
          const errorData = apiResponse.data;
          const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
          
          console.error(`Coupang Error: ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          // 401: 서명 불일치, 키 오류
          if (apiResponse.status === 401 || errorText.includes("not authorized")) {
             hint = `🔑 [인증 실패] (401)\n1. Access Key와 Secret Key가 서로 바뀐 것은 아닌지 확인하세요.\n2. 업체 코드(Vendor ID)가 정확한지 확인하세요.\n3. 서버 IP [${currentIp}]가 쿠팡 윙에 등록되었는지 확인하세요.`;
          }
          // 403: IP 차단 등
          else if (apiResponse.status === 403) {
             hint = `⚠️ [접속 차단] (403)\n서버 IP [${currentIp}]가 허용되지 않았습니다.\n쿠팡 윙 접속정보 설정에서 IP를 등록해주세요.`;
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
      res.status(200).json({
          ...apiResponse.data,
          currentIp: currentIp,
          debugInfo: {
              targetStatus,
              httpStatus: apiResponse.status,
              dateRange: { from: createdAtFrom, to: createdAtTo }
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