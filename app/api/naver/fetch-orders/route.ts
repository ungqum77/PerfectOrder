import { NextResponse } from 'next/server';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 네이버 커머스 API 주문 수집 핸들러
export const maxDuration = 15;
export const dynamic = 'force-dynamic';

const sanitize = (val: any) => {
    if (!val) return '';
    return String(val).trim();
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { clientId, clientSecret } = body;
        const cleanClientId = sanitize(clientId);
        const cleanClientSecret = sanitize(clientSecret);

        if (!cleanClientId || !cleanClientSecret) {
            return NextResponse.json({ error: 'Client ID와 Client Secret이 필요합니다.' }, { status: 400 });
        }

        const proxyUrl = process.env.FIXED_IP_PROXY_URL;
        const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

        // ---------------------------------------------------------
        // 1. 액세스 토큰 발급 (OAuth2)
        // ---------------------------------------------------------
        const tokenUrl = 'https://api.commerce.naver.com/external/v1/oauth2/token';
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', cleanClientId);
        tokenParams.append('client_secret', cleanClientSecret);
        tokenParams.append('grant_type', 'client_credentials');
        tokenParams.append('type', 'SELF');

        const tokenRes = await axios.post(tokenUrl, tokenParams, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            httpsAgent,
            proxy: false,
            validateStatus: () => true
        });

        if (tokenRes.status !== 200) {
            throw new Error(`[Naver Auth] 토큰 발급 실패 (${tokenRes.status}): ${JSON.stringify(tokenRes.data)}`);
        }

        const accessToken = tokenRes.data.access_token;
        if (!accessToken) throw new Error('액세스 토큰이 응답에 없습니다.');

        // ---------------------------------------------------------
        // 2. 최근 변경된 주문 ID 목록 조회
        // ---------------------------------------------------------
        const d = new Date();
        d.setDate(d.getDate() - 1); // 24시간 전
        const lastChangedFrom = d.toISOString();

        const listUrl = `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses?lastChangedFrom=${lastChangedFrom}`;

        const listRes = await axios.get(listUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            httpsAgent,
            proxy: false,
            validateStatus: () => true
        });

        if (listRes.status !== 200) {
            throw new Error(`[Naver List] 주문 목록 조회 실패 (${listRes.status}): ${JSON.stringify(listRes.data)}`);
        }

        const lastChangeStatuses = listRes.data.data?.lastChangeStatuses || [];
        const productOrderIds = lastChangeStatuses.map((o: any) => o.productOrderId);

        // 주문이 없으면 바로 빈 배열 반환
        if (productOrderIds.length === 0) {
            return NextResponse.json({ success: true, count: 0, data: [] });
        }

        // ---------------------------------------------------------
        // 3. 주문 상세 정보 조회 (최대 100건 씩 끊어서 조회 권장되나 여기선 단순화)
        // ---------------------------------------------------------
        // 네이버 API는 한번에 많은 ID 조회 시 제한이 있을 수 있음.
        // 여기서는 데모용으로 최대 50개만 조회
        const targetIds = productOrderIds.slice(0, 50);

        const detailUrl = 'https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/query';
        const detailRes = await axios.post(detailUrl, {
            productOrderIds: targetIds
        }, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            httpsAgent,
            proxy: false,
            validateStatus: () => true
        });

        if (detailRes.status !== 200) {
            throw new Error(`[Naver Detail] 주문 상세 조회 실패 (${detailRes.status}): ${JSON.stringify(detailRes.data)}`);
        }

        const rawOrders = detailRes.data.data || [];

        // ---------------------------------------------------------
        // 4. 데이터 매핑 (Naver -> App Order Type)
        // ---------------------------------------------------------
        const mappedOrders = rawOrders.map((item: any) => {
            const productOrder = item.productOrder;
            const order = item.order;

            // 배송지 정보
            const shipping = productOrder.shippingAddress || {};
            // 주문자 정보
            const orderer = order.orderer || {};

            // 상태 매핑
            let status = 'NEW';
            const naverStatus = productOrder.productOrderStatus;
            if (naverStatus === 'PAYED') status = 'NEW';
            else if (naverStatus === 'PRODUCT_PREPARE') status = 'PENDING';
            else if (naverStatus === 'DELIVERY') status = 'SHIPPING';
            else if (naverStatus === 'DELIVERED') status = 'DELIVERED';
            else if (naverStatus === 'CANCELED' || naverStatus === 'CANCEL_REQUESTED') status = 'CANCELLED';
            else if (naverStatus === 'RETURNED' || naverStatus === 'RETURN_REQUESTED') status = 'RETURNED';

            // 날짜 포맷팅
            const dateStr = productOrder.paymentDate ? new Date(productOrder.paymentDate).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString();

            return {
                orderId: productOrder.productOrderId, // 원본 ID
                id: `N-${productOrder.productOrderId}`,
                platform: 'NAVER',
                orderNumber: productOrder.orderId,
                productId: productOrder.productId,
                productName: productOrder.productName,
                option: productOrder.productOption,
                amount: productOrder.totalPaymentAmount,

                ordererName: orderer.name || '구매자',
                ordererPhone: orderer.tel1 || '',
                ordererId: orderer.id || '',

                receiverName: shipping.name || orderer.name,
                receiverPhone: shipping.tel1 || '',
                receiverAddress: `${shipping.baseAddress || ''} ${shipping.detailedAddress || ''}`.trim(),
                shippingMemo: productOrder.shippingMemo || '',

                date: dateStr,
                status: status,
                courier: '', // 상세 조회 시 택배사 정보가 다른 필드에 있을 수 있음 (추후 보강)
                invoiceNumber: ''
            };
        });

        return NextResponse.json({
            success: true,
            message: "네이버 스마트스토어 연동 성공",
            count: mappedOrders.length,
            data: mappedOrders
        });

    } catch (error: any) {
        console.error("Naver API Error:", error.message);
        return NextResponse.json({
            error: 'Naver Sync Failed',
            details: error.message,
            hint: "애플리케이션 ID/Secret이 정확한지 확인해주세요."
        }, { status: 500 });
    }
}
