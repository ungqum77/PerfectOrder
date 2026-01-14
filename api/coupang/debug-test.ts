import type { VercelRequest, VercelResponse } from '@vercel/node';
import CryptoJS from 'crypto-js'; 
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
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
      // 🛑 [테스트용 하드코딩] 
      // 요청해주신 ID와 키 값을 그대로 적용했습니다.
      const VENDOR_ID = "A00866096";
      const ACCESS_KEY = "f5f4b273-2ef8-4b00-82c1-ecd71337752c";
      const SECRET_KEY = "d40f67fe8bbf93972547d0741a2ddca000f1fe7d"; 

      console.log(`🚀 [Debug] 하드코딩 테스트 시작 - VendorID: ${VENDOR_ID}`);

      // 1. 날짜 생성 (UTC YYMMDDTHHMMSSZ)
      const d = new Date();
      const utcYear = d.getUTCFullYear().toString().substring(2);
      const utcMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
      const utcDay = String(d.getUTCDate()).padStart(2, '0');
      const utcHour = String(d.getUTCHours()).padStart(2, '0');
      const utcMin = String(d.getUTCMinutes()).padStart(2, '0');
      const utcSec = String(d.getUTCSeconds()).padStart(2, '0');
      
      const datetime = `${utcYear}${utcMonth}${utcDay}T${utcHour}${utcMin}${utcSec}Z`;

      // 2. 쿼리 스트링 구성 (알파벳 순서 정렬)
      const nowKst = new Date(d.getTime() + (9 * 60 * 60 * 1000));
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2);
      
      const fmt = (date: Date) => date.toISOString().split('T')[0];
      const cFrom = fmt(nowKst);
      const cTo = fmt(nextDayKst);
      const status = 'ACCEPT'; // 테스트용 고정

      const queryString = `createdAtFrom=${cFrom}&createdAtTo=${cTo}&status=${status}`;
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets`;
      
      // 3. 서명 생성
      const message = datetime + 'GET' + path + '?' + queryString;
      const signature = CryptoJS.HmacSHA256(message, SECRET_KEY).toString(CryptoJS.enc.Hex);

      console.log(`[Debug] URL Path: ${path}`);
      console.log(`[Debug] Query: ${queryString}`);
      console.log(`[Debug] Signature Message: ${message}`);

      // 4. 요청 전송
      const url = `https://api-gateway.coupang.com${path}?${queryString}`;
      
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

      // IP 확인용 (옵션)
      let currentIp = 'Unknown';
      try {
        const ipRes = await axios.get('https://api.ipify.org?format=json', { httpsAgent, proxy: false });
        currentIp = ipRes.data.ip;
        console.log(`[Debug] Server IP: ${currentIp}`);
      } catch (e) { console.log("IP check failed"); }

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

      // 성공 시
      res.status(200).json({ 
          success: true, 
          message: "✅ 하드코딩 테스트 성공! (200 OK)", 
          data: response.data,
          currentIp: currentIp,
          usedCredentials: {
              vendorId: VENDOR_ID,
              accessKey: ACCESS_KEY.substring(0, 5) + "...",
          }
      });

  } catch (error: any) {
      const errorData = error.response?.data;
      const status = error.response?.status || 500;
      console.error(`❌ [Debug] 에러 발생 (${status}):`, JSON.stringify(errorData || error.message));
      
      let hint = "";
      if (status === 401) hint = "여전히 401 인증 오류입니다. 하드코딩된 키 값 자체에 문제가 있거나, IP가 차단되었을 수 있습니다.";
      if (status === 403) hint = "403 Forbidden: IP 차단일 확률이 높습니다.";

      res.status(status).json({
          error: 'Debug API Failed',
          details: errorData || error.message,
          hint: hint,
          debug: "Hardcoded A00866096"
      });
  }
}