import { NextResponse } from 'next/server';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHmac } from 'node:crypto';
import axios from 'axios';

// Config for Vercel Function
export const maxDuration = 15; // 타임아웃 15초
export const dynamic = 'force-dynamic';

/**
 * Coupang API Handler (Next.js App Router Version)
 */
export async function POST(request: Request) {
    let currentIp = "Unknown";
    let message = "";

    try {
        const body = await request.json();
        const { vendorId, accessKey, secretKey, status } = body;

        // 공백 및 따옴표 제거 정제
        const clean = (s: any) => String(s || '')
            .replace(/\s+/g, '')
            .replace(/['"“”‘’]/g, '')
            .trim();
        const vId = clean(vendorId).toUpperCase();
        const aKey = clean(accessKey);
        const sKey = clean(secretKey);

        if (!vId || !aKey || !sKey) {
            return NextResponse.json({ error: "필수 인증 정보(VendorID/AccessKey/SecretKey)가 누락되었습니다." }, { status: 400 });
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
        const dateFrom = body.createdAtFrom || fmt(nowKst);
        const dateTo = body.createdAtTo || fmt(nextKst);

        // 상태 매핑
        const statusMap: Record<string, string> = { 'NEW': 'ACCEPT', 'PENDING': 'INSTRUCT', 'SHIPPING': 'DEPARTURE', 'DELIVERED': 'FINAL_DELIVERY', 'CANCEL': 'CANCEL', 'RETURN': 'RETURN' };
        const qStatus = statusMap[status] || status || 'ACCEPT';

        // 4. 서명 생성 (HMAC-SHA256)
        const method = 'GET';
        const path = `/v2/providers/openapi/apis/api/v4/vendors/${vId}/ordersheets`;
        const queryString = `createdAtFrom=${dateFrom}&createdAtTo=${dateTo}&status=${qStatus}`;

        message = datetime + method + path + '?' + queryString;

        // HMAC 서명
        const hmac = createHmac('sha256', sKey);
        hmac.update(message);
        const signature = hmac.digest('hex');

        // 5. URL & Proxy 설정
        const finalUrl = `https://api-gateway.coupang.com${path}?${queryString}`;
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
            // Axios for IP check
            const ipRes = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: agent,
                proxy: false
            });
            currentIp = ipRes.data.ip;
        } catch (e) {
            console.warn("[IP Check] Failed:", e);
            currentIp = "CHECK_FAILED";
        }

        console.log(`[Coupang V2] Requesting from IP: ${currentIp}`);
        console.log(`[Coupang V2] URL: ${finalUrl}`);
        console.log(`[Coupang V2] Signature Message: ${message}`);

        // 7. API 호출 (Axios)
        const cleanAxios = axios.create();

        const axiosRes = await cleanAxios.get(finalUrl, {
            headers: {
                'Authorization': `CEA algorithm=HmacSHA256, access-key=${aKey}, signed-date=${datetime}, signature=${signature}`,
                'X-Requested-By': vId,
                'User-Agent': 'PerfectOrder/2.0',
                'Accept': 'application/json'
                // 'X-Cou-Date': datetime, // CEA 방식에선 생략 가능 또는 signed-date로 대체
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

            return NextResponse.json({
                error: 'Coupang API Error',
                details: data,
                hint: hint,
                currentIp: currentIp,
                meta: { messageToSign: message }
            }, { status: statusIdx });
        }

        return NextResponse.json({
            success: true,
            data: data.data,
            currentIp: currentIp,
            debug: { message }
        });

    } catch (error: any) {
        console.error("[Server Error]", error);
        return NextResponse.json({
            error: "Internal Server Error",
            details: error.message,
            currentIp: currentIp
        }, { status: 500 });
    }
}
