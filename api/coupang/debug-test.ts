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
  const clean = (str: string) => str.replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  
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
        
        // 프록시 연결 자체가 실패한 경우 조기 종료
        if (proxyUrl) {
            throw new Error(`프록시 서버(${proxyUrl.split('@')[1] || 'URL'})에 연결할 수 없습니다. Webshare 설정을 확인하세요.`);
        }
      }

      // 🛑 [테스트용 하드코딩 인증 정보] 
      // 사용자님이 제공해주신 키 값 유지
      const VENDOR_ID = clean("A00866096");
      const ACCESS_KEY = clean("f5f4b273-2ef8-4b00-82c1-ecd71337752c");
      const SECRET_KEY = clean("d40f67fe8bbf93972547d0741a2ddca000f1fe7d"); 

      // 4. 날짜 및 시간 생성
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // 5. 쿼리 스트링
      const nowKst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2);
      
      const fmt = (date: Date) => date.toISOString().split('T')[0];
      const cFrom = fmt(nowKst);
      const cTo = fmt(nextDayKst);
      const status = 'ACCEPT'; 

      const queryString = `createdAtFrom=${cFrom}&createdAtTo=${cTo}&status=${status}`;
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets`;
      
      // 6. 서명 생성
      const method = 'GET';
      const message = datetime + method + path + '?' + queryString;
      
      const hmac = createHmac('sha256', SECRET_KEY);
      hmac.update(message);
      const signature = hmac.digest('hex');

      console.log(`[Debug] Request IP: ${currentIp} | Proxy Configured: ${!!proxyUrl}`);

      // 7. API 호출
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
          message: `✅ 성공! 프록시(${currentIp})를 통해 쿠팡에 접속했습니다.`, 
          data: response.data,
          currentIp: currentIp,
          proxyUsed: !!proxyUrl
      });

  } catch (error: any) {
      const errorData = error.response?.data;
      const status = error.response?.status || 500;
      const errorMsg = typeof errorData === 'object' ? JSON.stringify(errorData) : error.message;

      let hint = "";
      if (status === 401 || status === 403) {
          hint = `🚨 [차단됨] 현재 프록시 IP [ ${currentIp} ] 가 쿠팡에 등록되어 있지 않습니다.\n쿠팡 판매자 센터에 이 IP를 등록해주세요.`;
      } else if (!proxyUrl) {
          hint = `⚠️ Vercel 환경변수 'FIXED_IP_PROXY_URL'이 설정되지 않았습니다. 설정 후 재배포 해주세요.`;
      }

      console.error(`[Debug Error] ${status}:`, errorMsg);

      res.status(status).json({
          error: 'Debug Failed',
          details: errorData || error.message,
          hint: hint,
          currentIp: currentIp,
          proxyConfigured: !!proxyUrl
      });
  }
}