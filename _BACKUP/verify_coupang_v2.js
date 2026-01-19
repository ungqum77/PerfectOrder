
import { createHmac } from 'node:crypto'; // Built-in

// [사용자 제공 자격증명 - Integration.tsx 참조]
const VENDOR_ID = "A00934559";
const ACCESS_KEY = "d21f5515-e7b1-4e4a-ab64-353ffde02371";
const SECRET_KEY = "b8737eac85e4a8510a8db7b5be89ae5ee0a2f3e6";

async function testCoupang() {
    console.log("🚀 쿠팡 API 완전 재작성 테스트 시작 (No Dependencies)");
    console.log(`Target Vendor: ${VENDOR_ID}`);

    const method = 'GET';
    const path = `/v2/providers/openapi/apis/api/v4/vendors/${VENDOR_ID}/ordersheets`;

    // 날짜 생성 (GMT)
    const d = new Date();
    const yy = String(d.getUTCFullYear()).slice(2);
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;

    // 쿼리 파라미터
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fmt = (dt) => dt.toISOString().split('T')[0];
    const createdAtFrom = fmt(now);
    const createdAtTo = fmt(tomorrow);
    const status = 'ACCEPT';

    const queryString = `createdAtFrom=${createdAtFrom}&createdAtTo=${createdAtTo}&status=${status}`;

    // Signature 생성
    const message = datetime + method + path + '?' + queryString;
    const hmac = createHmac('sha256', SECRET_KEY);
    hmac.update(message);
    const signature = hmac.digest('hex');

    const url = `https://api-gateway.coupang.com${path}?${queryString}`;

    console.log(`\n------------------------------------------------`);
    console.log(`[Signature Data]`);
    console.log(`Message: ${message}`);
    console.log(`Hmac Signature: ${signature}`);
    console.log(`X-Cou-Date: ${datetime}`);
    console.log(`------------------------------------------------\n`);

    try {
        console.log("📡 API 요청 전송 중 (Native Fetch)...");

        // Native Fetch 호출
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `HMAC-SHA256 ${ACCESS_KEY}:${signature}`,
                'X-Requested-By': VENDOR_ID,
                'X-Cou-Date': datetime,
                'User-Agent': 'PerfectOrder/2.0-Standalone',
                'Accept': 'application/json'
            }
        });

        console.log(`✅ 응답 상태: ${response.status} ${response.statusText}`);

        const text = await response.text();
        let json;
        try { json = JSON.parse(text); } catch (e) { json = text; }

        if (response.ok) {
            console.log("🎉 성공! 데이터가 정상적으로 수신되었습니다.");
            console.log(`주문 건수: ${json.data ? json.data.length : 0}`);
        } else {
            console.error("❌ 실패!");
            console.error("응답 본문:", JSON.stringify(json, null, 2));

            if (response.status === 401 || response.status === 403) {
                console.log("\n[분석] 401/403 권한 오류 발생");
                console.log("이 스크립트는 Proxy 없이 사용자 PC에서 직접 실행되었습니다.");

                // IP 확인
                try {
                    const ipRes = await fetch('https://api.ipify.org?format=json');
                    const ipJson = await ipRes.json();
                    console.log(`\n★ 현재 PC의 공인 IP: [ ${ipJson.ip} ]`);
                    console.log(`★ 위 IP가 쿠팡 판매자 센터 API 설정에 등록되어 있는지 반드시 확인하세요.`);
                    console.log(`(스크린샷에 있던 23.95... 는 Vercel 서버의 IP였을 것입니다)`);
                } catch (e) { console.log("IP 확인 불가"); }
            }
        }

    } catch (e) {
        console.error("🚨 치명적 오류:", e.message);
    }
}

testCoupang();
