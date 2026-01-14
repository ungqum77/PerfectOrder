import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHmac } from 'node:crypto';

export const config = {
  maxDuration: 10,
};

// [강력한 정제 함수] 
const sanitize = (val: any) => {
    if (!val) return '';
    // 공백, 줄바꿈, 탭, 보이지 않는 문자 모두 제거
    return String(val)
        .replace(/\s+/g, '') 
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
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

      // 1. 입력값 정제
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

      // 3. Proxy 설정
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      let httpsAgent: any = undefined;

      if (proxyUrl) {
          try {
            httpsAgent = new HttpsProxyAgent(proxyUrl);
          } catch (agentError) {
             console.error("Proxy Error:", agentError);
          }
      }

      // IP 확인
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

      // 4. 시간 및 쿼리 생성
      // DateTime: YYMMDDTHHMMSSZ (UTC 기준)
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(2);
      const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const HH = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

      // Query Params (KST 기준 날짜)
      const kstOffset = 9 * 60 * 60 * 1000;
      const nowKst = new Date(d.getTime() + kstOffset);
      const nextDayKst = new Date(nowKst);
      nextDayKst.setDate(nextDayKst.getDate() + 2);

      const fmtDate = (date: Date) => date.toISOString().split('T')[0];
      const createdAtFrom = req.body.createdAtFrom || fmtDate(nowKst);
      const createdAtTo = req.body.createdAtTo || fmtDate(nextDayKst);

      const method = 'GET';
      const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
      
      // [중요] 쿼리 스트링 정렬 (알파벳 순서: c -> c -> s)
      // createdAtFrom, createdAtTo, status
      const queryString = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;
      
      // 5. 서명 생성 (Node.js Native Crypto)
      // Message 구조: DateTime + Method + Path + ? + QueryString
      const message = datetime + method + path + '?' + queryString;
      
      const hmac = createHmac('sha256', cleanSecretKey);
      hmac.update(message);
      const signature = hmac.digest('hex');

      const url = `https://api-gateway.coupang.com${path}?${queryString}`;

      console.log(`[Coupang] Signing Message: ${message.replace(cleanSecretKey, '***')}`);
      console.log(`[Coupang] URL: ${url}`);

      // 6. API 호출
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
          
          console.error(`[Coupang Error] ${apiResponse.status} - ${errorText}`);
          
          let hint = "";
          // 401 Unauthorized
          if (apiResponse.status === 401 || errorText.includes("not authorized")) {
             hint = `🔑 [인증 실패] (401)\n1. 업체 코드(Vendor ID)가 올바른지 확인하세요 (현재: ${cleanVendorId})\n2. Access Key가 해당 Vendor ID용으로 발급된 것인지 확인하세요.\n3. IP [${currentIp}]가 쿠팡 윙에 등록되었는지 확인하세요.\n(서명 생성 시간: ${datetime})`;
          }
          // 403 Forbidden
          else if (apiResponse.status === 403) {
             hint = `⚠️ [접속 차단] (403)\nIP [${currentIp}]가 허용되지 않았습니다. 쿠팡 윙에서 IP를 등록해주세요.`;
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