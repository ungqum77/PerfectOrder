import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    let message = "";
    // 1. 숨겨진 문자, 공백, 따옴표 제거 함수
    const clean = (str: any) => {
        if (!str) return "";
        return String(str)
        return String(str)
            .replace(/\s+/g, '') // 공백 제거
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // 투명 문자 제거
            .replace(/['"“”‘’]/g, '') // 따옴표 제거
            .trim();
    }

    // 2. Proxy 설정
    const proxyUrl = process.env.FIXED_IP_PROXY_URL;
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    let currentIp = 'Unknown';
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

        const body = await request.json();

        // [중요] 정밀 진단 모드일 경우, 입력값과 상관없이 정확한 키 값을 강제 사용
        // 이는 전송 과정에서의 인코딩 문제나 오타를 원천 차단하기 위함입니다.
        // [수정] 하드코딩된 데모 키 로직 제거 -> 사용자 입력값 사용
        VENDOR_ID = clean(body.vendorId);
        ACCESS_KEY = clean(body.accessKey);
        SECRET_KEY = clean(body.secretKey);

        if (!VENDOR_ID || !ACCESS_KEY || !SECRET_KEY) {
            throw new Error("API 키 정보가 누락되었습니다.");
        }

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
        message = datetime + method + path + '?' + queryString;

        const hmac = createHmac('sha256', SECRET_KEY);
        hmac.update(message);
        const signature = hmac.digest('hex');

        console.log(`[Debug] Checking Coupang... IP:${currentIp}, Vendor:${VENDOR_ID}`);

        // 8. API 호출
        const url = `https://api-gateway.coupang.com${path}?${queryString}`;
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${signature}`,
                'X-Requested-By': VENDOR_ID,
                // 'X-Cou-Date': datetime, // CEA 방식에서는 signed-date가 포함되므로 X-Cou-Date 불필요할 수 있으나 호환성 위해 유지 (또는 제거) -> 문서상 CEA에선 제거 권장일 수 있음. 일단 제거하고 signed-date에 의존.
            },
            httpsAgent,
            proxy: false
        });

        return NextResponse.json({
            success: true,
            message: `✅ 인증 성공!\n\n현재 IP [${currentIp}]는 정상 허용 중입니다.\nAPI 연결에 성공하였습니다.`,
            data: response.data,
            currentIp: currentIp,
            proxyConfigured: !!proxyUrl,
            proxyUrl: proxyUrl ? proxyUrl.replace(/:[^:]*@/, ':****@') : "NOT_SET",
            usedCredentials: {
                vendorId: VENDOR_ID,
                accessKey: ACCESS_KEY,
                secretKey: SECRET_KEY.substring(0, 5) + "..." // 보안상 마스킹
            },
            isDefaultKey: body.useHardcoded
        });

    } catch (error: any) {
        const errorData = error.response?.data;
        const status = error.response?.status || 500;

        let hint = "";
        // 401 Unauthorized: 서명 불일치 or 키 권한 없음
        if (status === 401) {
            hint = `❌ [401 권한 없음]\n\n다음 3가지를 확인해주세요:\n1. 키 발급 시 '주문/배송 관리' 권한 체크박스를 선택했나요?\n2. 등록한 IP [${currentIp}]가 정확한가요?\n3. 방금 IP를 등록했다면 적용까지 최대 10분이 걸릴 수 있습니다.`;
        }
        // 403 Forbidden: IP 차단
        else if (status === 403) {
            hint = `⛔ [403 접근 차단]\nIP [${currentIp}]가 쿠팡 화이트리스트에 없습니다.`;
        }
        else if (!proxyUrl) {
            hint = `⚠️ Proxy 설정 오류 또는 IP 변경됨.`;
        }

        const errorText = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData || error.message);
        console.error(`[Debug Error] ${status}:`, errorText);

        return NextResponse.json({
            error: 'Debug Failed',
            details: errorText,
            hint: hint,
            currentIp: currentIp,
            usedCredentials: {
                vendorId: VENDOR_ID,
                accessKey: ACCESS_KEY,
                secretKey: SECRET_KEY ? "PROVIDED" : "MISSING"
            },
            proxyConfigured: !!proxyUrl,
            proxyUrl: proxyUrl ? proxyUrl.replace(/:[^:]*@/, ':****@') : "NOT_SET",
            debug: { messageToSign: message }
        }, { status: status });
    }
}
