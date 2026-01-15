import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'node:crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const config = {
  maxDuration: 10,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', "true");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 1. 숨겨진 문자, 공백, 따옴표 제거 함수 (입력값 정제 강화)
  const clean = (str: any) => {
      if (!str) return "";
      return String(str)
        .replace(/\s+/g, '') // 공백 제거
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // 투명 문자 제거
        .replace(/['"“”‘’]/g, '') // 따옴표 제거
        .trim();
  }
  
  // 2. 환경변수에서 Proxy URL 가져오기
  const proxyUrl = process.env.FIXED_IP_PROXY_URL;
  const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  
  let currentIp = 'Unknown';

  // 3. 자격 증명 변수 선언
  let VENDOR_ID = "";
  let ACCESS_KEY = "";
  let SECRET_KEY = "";

  try {
      // IP 확인
      try {
        const ipRes = await axios.get('https://api.ipify.org?format=json', { 
            httpsAgent, 
            proxy: false, 
            timeout: 5000 
        });
        currentIp = ipRes.data.ip;
      } catch (e: any) { 
        console.error("IP check failed:", e.message);
        currentIp = "IP_CHECK_FAILED";
      }

      // 4. 인증 정보 설정
      const body = req.body || {};
      
      // 사용자 제공 하드코딩 값 (요청하신 값)
      const DEFAULT_VENDOR = "A00934559";
      const DEFAULT_ACCESS = "d21f5515-e7b1-4e4a-ab64-353ffde02371";
      const DEFAULT_SECRET = "b8737eac85e4a8510a8db7b5be89ae5ee0a2f3e6";

      // 입력값이 있으면 사용하고, 없으면 하드코딩 값 사용
      VENDOR_ID = clean(body.vendorId) || DEFAULT_VENDOR;
      ACCESS_KEY = clean(body.accessKey) || DEFAULT_ACCESS;
      SECRET_KEY = clean(body.secretKey) || DEFAULT_SECRET;

      // 키 값 검증
      if (!VENDOR_ID) throw new Error("Vendor ID가 유효하지 않습니다.");
      if (!ACCESS_KEY) throw new Error("Access Key가 유효하지 않습니다.");
      if (!SECRET_KEY) throw new Error("Secret Key가 유효하지 않습니다.");

      // 5. 날짜 및 시간 생성
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // 6. 쿼리 스트링 (최근 2일간 조회)
      const nowKst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2);
      
      const fmt = (date: Date) => date.toISOString().split('T')[0];
      const cFrom = fmt(nowKst);
      const cTo = fmt(nextDayKst);
      const status = 'ACCEPT'; 

      const queryString = `createdAtFrom=${cFrom}&createdAtTo=${cTo}&status=${status}`;
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets`;
      
      // 7. 서명 생성
      const method = 'GET';
      const message = datetime + method + path + '?' + queryString;
      
      const hmac = createHmac('sha256', SECRET_KEY);
      hmac.update(message);
      const signature = hmac.digest('hex');

      console.log(`[Debug] Checking Coupang... IP:${currentIp}, Vendor:${VENDOR_ID}`);

      // 8. API 호출
      const url = `https://api-gateway.coupang.com${path}?${queryString}`;
      const response = await axios.get(url, {
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `HMAC-SHA256 ${ACCESS_KEY}:${signature}`,
              'X-Requested-By': VENDOR_ID,
              'X-Cou-Date': datetime,
          },
          httpsAgent, 
          proxy: false 
      });

      res.status(200).json({ 
          success: true, 
          message: `✅ 인증 성공!\n\n현재 IP [${currentIp}]는 정상 허용 중입니다.\nAPI 연결에 성공하였습니다.`, 
          data: response.data,
          currentIp: currentIp,
          proxyUsed: !!proxyUrl,
          usedCredentials: {
              vendorId: VENDOR_ID,
              accessKey: ACCESS_KEY,
              secretKey: SECRET_KEY
          },
          isDefaultKey: ACCESS_KEY === DEFAULT_ACCESS
      });

  } catch (error: any) {
      const errorData = error.response?.data;
      const status = error.response?.status || 500;
      
      let hint = "";
      if (status === 401) {
          hint = `❌ [401 인증 실패] 키 값 오류 또는 IP 차단.\n\n[진단 결과]\n1. Vendor ID, Access Key, Secret Key가 정확한지 아래 표시된 값을 확인하세요.\n2. 키가 정확하다면 쿠팡 OPEN API IP 설정에 [${currentIp}]가 등록되어 있는지 확인하세요.`;
      } else if (status === 403) {
          hint = `⛔ [403 접근 차단] IP [${currentIp}]가 아직 쿠팡에 등록되지 않았습니다.`;
      } else if (!proxyUrl) {
          hint = `⚠️ Proxy 설정 오류.`;
      }

      console.error(`[Debug Error] ${status}:`, JSON.stringify(errorData));

      res.status(status).json({
          error: 'Debug Failed',
          details: errorData || error.message,
          hint: hint,
          currentIp: currentIp,
          usedCredentials: {
              vendorId: VENDOR_ID,
              accessKey: ACCESS_KEY,
              secretKey: SECRET_KEY
          },
          proxyConfigured: !!proxyUrl
      });
  }
}