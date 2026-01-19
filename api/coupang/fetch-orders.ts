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
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // IP 확인 변수 (try 밖으로 이동)
  let currentIp = "Unknown";

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

    // 3. Proxy 설정 및 IP 확인
    const proxyUrl = process.env.FIXED_IP_PROXY_URL;
    let httpsAgent: any = undefined;

    if (proxyUrl) {
      try {
        console.log(`[Proxy] Using Proxy: ${proxyUrl.replace(/:[^:]*@/, ':****@')}`); // 비밀번호 마스킹
        httpsAgent = new HttpsProxyAgent(proxyUrl);
      } catch (agentError) {
        console.error("[Proxy Error] Agent Creation Failed:", agentError);
      }
    }

    // IP 확인
    try {
      const ipRes = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: httpsAgent,
        proxy: false,
        timeout: 3000
      });
      currentIp = ipRes.data.ip;
    } catch (e) {
      console.warn("IP Check Failed");
      currentIp = "CHECK_FAILED";
    }

    // 4. 시간 및 쿼리 생성
    const d = new Date();
    const yy = String(d.getUTCFullYear()).slice(2);
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKst = new Date(d.getTime() + kstOffset);
    const nextDayKst = new Date(nowKst);
    nextDayKst.setDate(nextDayKst.getDate() + 2);

    const fmtDate = (date: Date) => date.toISOString().split('T')[0];
    const createdAtFrom = req.body.createdAtFrom || fmtDate(nowKst);
    const createdAtTo = req.body.createdAtTo || fmtDate(nextDayKst);

    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${cleanVendorId}/ordersheets`;
    const queryString = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${targetStatus}`;

    // 5. 서명 생성
    // 5. 서명 생성
    const message = datetime + method + path + '?' + queryString;
    const hmac = createHmac('sha256', cleanSecretKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    // [DEBUG] 서명 생성 정보 로깅 (비밀번호 마스킹)
    console.log(`[Coupang Debug] VendorID: ${cleanVendorId}`);
    console.log(`[Coupang Debug] Message To Sign: ${message}`);
    console.log(`[Coupang Debug] Generated Signature: ${signature.substring(0, 10)}...`);

    const url = `https://api-gateway.coupang.com${path}?${queryString}`;

    // 6. API 호출
    const headers: Record<string, string> = {
      'Authorization': `HMAC-SHA256 ${cleanAccessKey}:${signature}`,
      'X-Requested-By': cleanVendorId,
      'X-Cou-Date': datetime,
      'User-Agent': 'PerfectOrder/1.0',
      'Accept': 'application/json'
    };

    const apiResponse = await axios({
      method: method,
      url: url,
      headers: headers,
      httpsAgent: httpsAgent,
      proxy: false,
      validateStatus: () => true
    });

    if (apiResponse.status >= 400) {
      const errorData = apiResponse.data;
      const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);

      let hint = "";
      if (apiResponse.status === 401 || errorText.includes("not authorized")) {
        hint = `🔑 [인증 실패] IP [${currentIp}]가 차단되었을 가능성이 높습니다.`;
      } else if (apiResponse.status === 403) {
        hint = `⚠️ [접속 차단] IP [${currentIp}]가 허용되지 않았습니다.`;
      }

      res.status(apiResponse.status).json({
        error: 'Coupang API Request Failed',
        details: errorText,
        hint: hint,
        currentIp: currentIp, // 스코프 내 변수 사용
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
      currentIp: currentIp // 에러 발생 시점까지 확인된 IP 반환
    });
  }
}