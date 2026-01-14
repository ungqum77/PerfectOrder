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

  try {
      // 🛑 [테스트용 하드코딩] 
      const VENDOR_ID = clean("A00866096");
      const ACCESS_KEY = clean("f5f4b273-2ef8-4b00-82c1-ecd71337752c");
      const SECRET_KEY = clean("d40f67fe8bbf93972547d0741a2ddca000f1fe7d"); 

      // 2. 날짜 및 시간 생성
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // 3. 쿼리 스트링 (알파벳 순 정렬 필수)
      // 현재 시간(UTC)을 KST로 변환하여 조회 범위 설정
      const nowKst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2);
      
      const fmt = (date: Date) => date.toISOString().split('T')[0];
      const cFrom = fmt(nowKst);
      const cTo = fmt(nextDayKst);
      const status = 'ACCEPT'; 

      const queryString = `createdAtFrom=${cFrom}&createdAtTo=${cTo}&status=${status}`;
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets`;
      
      // 4. 서명 생성 (Node.js Native Crypto 사용)
      const method = 'GET';
      const message = datetime + method + path + '?' + queryString;
      
      const hmac = createHmac('sha256', SECRET_KEY);
      hmac.update(message);
      const signature = hmac.digest('hex');

      // 5. Proxy 설정 확인
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      const isProxyConfigured = !!proxyUrl;
      const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

      // 6. 현재 IP 확인 (디버깅용)
      let currentIp = 'Unknown';
      try {
        const ipRes = await axios.get('https://api.ipify.org?format=json', { httpsAgent, proxy: false });
        currentIp = ipRes.data.ip;
      } catch (e) { 
        console.error("IP check failed", e);
      }

      console.log(`[Debug] Sending Request from IP: ${currentIp} (Proxy: ${isProxyConfigured})`);
      console.log(`[Debug] URL: https://api-gateway.coupang.com${path}?${queryString}`);

      // 7. 실제 요청
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
          message: "✅ 성공! 하드코딩 테스트 통과", 
          data: response.data,
          currentIp: currentIp,
          proxyUsed: isProxyConfigured
      });

  } catch (error: any) {
      const errorData = error.response?.data;
      const status = error.response?.status || 500;
      
      // 사용자에게 보여줄 힌트 메시지 구성
      let hint = "알 수 없는 오류입니다.";
      if (status === 401) {
          hint = `🔑 [401 인증 실패] 아이디/키는 맞을 수 있으나, IP가 차단되었을 가능성이 99%입니다.\n\n현재 서버 IP: [ ${error.currentIp || '확인불가'} ]\n\n이 IP를 쿠팡 윙 [판매자 정보 > 추가판매정보 > 오픈API 키] 설정에 등록했는지 확인하세요.`;
      } else if (status === 403) {
           hint = `⛔ [403 접근 금지] IP 차단 문제입니다. 쿠팡 윙에 IP [ ${error.currentIp || '확인불가'} ] 를 등록해주세요.`;
      }

      // Proxy 설정 여부 경고
      if (!process.env.FIXED_IP_PROXY_URL) {
          hint += `\n\n⚠️ 주의: 현재 Vercel 고정 IP 프록시(FIXED_IP_PROXY_URL)가 설정되지 않았습니다. 매번 IP가 바뀌므로 쿠팡 연동이 불가능할 수 있습니다.`;
      }

      console.error(`[Debug Error] ${status}:`, JSON.stringify(errorData));

      res.status(status).json({
          error: 'Debug Failed',
          details: errorData || error.message,
          hint: hint,
          currentIp: error.currentIp || 'Unknown', // 에러 객체에 IP가 없으면 위에서 조회한 IP 사용 시도 필요하나, 보통 여기서 끊김
          proxyConfigured: !!process.env.FIXED_IP_PROXY_URL
      });
  }
}