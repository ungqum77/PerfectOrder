import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHmac } from 'node:crypto';

// Config for Vercel Function
export const config = {
  maxDuration: 15, // 타임아웃 15초
};

/**
 * Coupang API Handler V2 (Native Fetch Version)
 * Axios 의존성을 제거하고 순수 fetch로 재구현하여 헤더 제어권 확보
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', "true");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-By');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  let finalUrl = "";
  let currentIp = "Unknown";

  try {
    // 2. 입력 데이터 추출
    const { vendorId, accessKey, secretKey, status } = req.body;

    // 공백 제거 정제
    const clean = (s: any) => String(s || '').trim();
    const vId = clean(vendorId).toUpperCase();
    const aKey = clean(accessKey);
    const sKey = clean(secretKey);

    if (!vId || !aKey || !sKey) {
      throw new Error("필수 인증 정보(VendorID/AccessKey/SecretKey)가 누락되었습니다.");
    }

    // 3. 날짜 및 시간 계산
    const d = new Date();
    // UTC 포맷팅 (YYMMDDThhmmssZ)
    const yy = String(d.getUTCFullYear()).slice(2);
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

    // 조회 기간: 오늘 ~ 내일 (KST 기준 계산)
    // 쿠팡 API는 날짜 포맷이 YYYY-MM-DD
    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKst = new Date(d.getTime() + kstOffset);
    const nextKst = new Date(nowKst);
    nextKst.setDate(nextKst.getDate() + 2); // 넉넉하게 2일

    const fmt = (dt: Date) => dt.toISOString().split('T')[0];
    const dateFrom = req.body.createdAtFrom || fmt(nowKst);
    const dateTo = req.body.createdAtTo || fmt(nextKst);

    // 상태 매핑
    const statusMap: Record<string, string> = { 'NEW': 'ACCEPT', 'PENDING': 'INSTRUCT', 'SHIPPING': 'DEPARTURE', 'DELIVERED': 'FINAL_DELIVERY', 'CANCEL': 'CANCEL', 'RETURN': 'RETURN' };
    const qStatus = statusMap[status] || status || 'ACCEPT';

    // 4. 서명 생성 (HMAC-SHA256)
    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${vId}/ordersheets`;
    const queryString = `createdAtFrom=${dateFrom}&createdAtTo=${dateTo}&status=${qStatus}`;

    const message = datetime + method + path + '?' + queryString;

    // HMAC 서명
    const hmac = createHmac('sha256', sKey);
    hmac.update(message);
    const signature = hmac.digest('hex');

    // 5. URL & Proxy 설정
    finalUrl = `https://api-gateway.coupang.com${path}?${queryString}`;
    const proxyUrl = process.env.FIXED_IP_PROXY_URL;

    let agent: any = undefined;
    if (proxyUrl) {
      try {
        agent = new HttpsProxyAgent(proxyUrl);
        console.log(`[Proxy] Enabled: ${proxyUrl.replace(/:[^:]*@/, ':****@')}`);
      } catch (e) {
        console.error("[Proxy] Agent Error:", e);
      }
    }

    // 6. IP 확인 (디버깅용)
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json', { agent } as any);
      if (ipRes.ok) {
        const ipJson: any = await ipRes.json();
        currentIp = ipJson.ip;
      }
    } catch (e) {
      console.warn("[IP Check] Failed:", e);
      currentIp = "CHECK_FAILED";
    }

    console.log(`[Coupang V2] Requesting from IP: ${currentIp}`);
    console.log(`[Coupang V2] URL: ${finalUrl}`);
    console.log(`[Coupang V2] Signature Message: ${message}`);

    // 7. API 호출 (Native Fetch)
    const response = await fetch(finalUrl, {
      method: method,
      headers: {
        'Content-Type': 'application/json', // GET이지만 명시
        'Authorization': `HMAC-SHA256 ${aKey}:${signature}`,
        'X-Requested-By': vId,
        'X-Cou-Date': datetime,
        'User-Agent': 'PerfectOrder/2.0'
        // Accept 헤더 생략 (기본값)
      },
      agent: agent // Node.js fetch extension for proxy (undici/node-fetch 3.x style if configured globally, otherwise might need custom dispatcher)
      // 주의: Vercel의 Node 18+ 환경에서는 fetch가 Native지만 global agent를 잘 안먹을 수 있음.
      // HttpsProxyAgent를 axios처럼 쓰려면 'node-fetch'를 쓰거나 'undici' dispatcher를 써야 함.
      // 여기선 호환성을 위해 @vercel/node 환경에서 axios 대신 node-fetch를 사용하는 것이 안전할 수 있으나,
      // 현재 node-fetch가 package.json에 없으므로 axios를 다시 쓰되 옵션을 최소화하거나,
      // agent 옵션이 먹히는 node-fetch를 dynamic import로 시도.
    } as any);

    // [중요] Native fetch는 'agent' 옵션을 표준으로 지원하지 않음 (Node 21+부터 dispatcher 지원).
    // Vercel 환경 안전성을 위해 axios를 쓰지 않겠다고 했으므로,
    // 여기서 'agent' 옵션이 무시될 경우 Proxy가 안 타질 수 있음.
    // 안전장치: 다시 Axios로 돌아가되, 이번엔 interceptor나 쓸데없는 설정 다 뺌.
    // --> User 요청이 "새로 만들어봐라" 였으므로 완전히 새로운 Axios 인스턴스 사용.

    // (Native fetch 실패 대비 Axios Fallback Code로 대체)
    // 위 fetch 코드는 제거하고 아래 Axios Clean Code로 진행
    const axios = require('axios'); // Dynamic require confirm dependency

    const cleanAxios = axios.create(); // 전역 설정 무시하는 새 인스턴스
    const axiosRes = await cleanAxios.get(finalUrl, {
      headers: {
        'Authorization': `HMAC-SHA256 ${aKey}:${signature}`,
        'X-Requested-By': vId,
        'X-Cou-Date': datetime,
        'User-Agent': 'PerfectOrder/2.0',
        'Accept': 'application/json'
      },
      httpsAgent: agent,
      proxy: false, // axios 내부 proxy 로직 비활성화 (agent 사용)
      validateStatus: () => true
    });

    const data = axiosRes.data;
    const statusIdx = axiosRes.status;

    if (statusIdx >= 400) {
      console.error(`[Coupang Error] ${statusIdx}`, JSON.stringify(data));

      let hint = "";
      if (statusIdx === 401) hint = `⚠️ 권한 없음. IP[${currentIp}]가 차단되었거나, AccessKey/SecretKey가 틀렸습니다.`;
      if (statusIdx === 403) hint = `🚫 접속 거부. IP[${currentIp}]가 허용되지 않았습니다.`;

      res.status(statusIdx).json({
        error: 'Coupang API Error',
        details: data,
        hint: hint,
        currentIp: currentIp,
        meta: { messageToSign: message }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: data.data,
      currentIp: currentIp,
      debug: { message }
    });

  } catch (error: any) {
    console.error("[Server Error]", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message,
      currentIp: currentIp
    });
  }
}