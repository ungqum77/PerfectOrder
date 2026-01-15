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

  // 1. 숨겨진 문자 제거 함수
  const clean = (str: string) => {
      if (!str) return "";
      return String(str).replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }
  
  // 2. 환경변수에서 Proxy URL 가져오기
  const proxyUrl = process.env.FIXED_IP_PROXY_URL;
  const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  
  let currentIp = 'Unknown';

  try {
      // 3. IP 확인 (Proxy 적용)
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
        
        if (proxyUrl) {
            throw new Error(`프록시 연결 실패: 환경변수 FIXED_IP_PROXY_URL을 확인하세요.`);
        }
      }

      // 4. 인증 정보 설정
      const body = req.body || {};
      
      // [요청 반영] 사용자 제공 하드코딩 값 적용
      // 입력값이 있으면 입력값 사용, 없으면 아래 하드코딩 값 사용 (강제 테스트용)
      const DEFAULT_VENDOR = "A00934559";
      const DEFAULT_ACCESS = "d21f5515-e7b1-4e4a-ab64-353ffde02371";
      const DEFAULT_SECRET = "a4def843f98f80356a1bbe94b2c3d8270dd9fe0b";

      const VENDOR_ID = clean(body.vendorId) || clean(DEFAULT_VENDOR);
      const ACCESS_KEY = clean(body.accessKey) || clean(DEFAULT_ACCESS);
      const SECRET_KEY = clean(body.secretKey) || clean(DEFAULT_SECRET);

      // 키 값 검증 로직 강화
      if (!VENDOR_ID) throw new Error("Vendor ID가 누락되었습니다.");
      if (!ACCESS_KEY) throw new Error("Access Key가 누락되었습니다.");
      if (!SECRET_KEY) throw new Error("Secret Key가 누락되었습니다.");

      // 5. 날짜 및 시간 생성
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // 6. 쿼리 스트링
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

      console.log(`[Debug] IP: ${currentIp} | Vendor: ${VENDOR_ID} | Key: ${ACCESS_KEY.substring(0, 5)}...`);

      // 8. API 호출
      const url = `https://api-gateway.coupang.com${path}?${queryString}`;
      const response = await axios.get(url, {
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `HMAC-SHA256 ${ACCESS_KEY}:${signature}`,
              'X-Requested-By': VENDOR_ID,
              'X-Cou-Date': datetime,
          },
          httpsAgent, // 프록시 에이전트 적용
          proxy: false 
      });

      res.status(200).json({ 
          success: true, 
          message: `✅ 인증 성공!\n\n현재 IP [${currentIp}]는 정상 허용 중입니다.\n제공된 키(${ACCESS_KEY.substring(0,6)}...)로 정상 연결되었습니다.`, 
          data: response.data,
          currentIp: currentIp,
          proxyUsed: !!proxyUrl,
          usedKey: ACCESS_KEY.substring(0, 8) + '****'
      });

  } catch (error: any) {
      const errorData = error.response?.data;
      const status = error.response?.status || 500;
      
      // 에러 메시지 상세 분석
      let hint = "";
      
      if (status === 401) {
          hint = `❌ [401 인증 실패] 키 값이 틀렸거나 승인되지 않았습니다.\nAccess Key와 Secret Key가 정확한지 다시 한번 확인해주세요.\n(입력된 Key 앞자리: ${req.body.accessKey ? req.body.accessKey.substring(0,4) : 'Default'})`;
      } else if (status === 403) {
          hint = `⛔ [403 접근 차단] IP [${currentIp}]가 아직 쿠팡에 등록되지 않았습니다.\n쿠팡 윙에 이 IP를 등록하고 10분 뒤 다시 시도하세요.`;
      } else if (!proxyUrl) {
          hint = `⚠️ Vercel 환경변수 'FIXED_IP_PROXY_URL' 설정이 필요합니다.`;
      }

      console.error(`[Debug Error] ${status}:`, JSON.stringify(errorData));

      res.status(status).json({
          error: 'Debug Failed',
          details: errorData || error.message,
          hint: hint,
          currentIp: currentIp,
          proxyConfigured: !!proxyUrl
      });
  }
}