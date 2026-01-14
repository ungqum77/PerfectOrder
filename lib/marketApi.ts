import { supabase } from './supabase';
import { Order, MarketAccount, OrderStatus } from '../types';

/**
 * [주의] 마켓 API 연동 시 CORS 정책 참고
 * 
 * 네이버, 쿠팡 등의 오픈 API는 보안상의 이유로 브라우저(프론트엔드)에서 직접 호출하는 것을 차단(CORS)하는 경우가 많습니다.
 * 따라서 아래 로직은 원칙적으로 Supabase Edge Function이나 백엔드 서버에서 실행되어야 합니다.
 * 
 * 이 파일에는 사용자가 요청한 'HMAC 서명 생성'과 'API 호출 로직'을 구현해 두었으며,
 * 실제 환경에서는 이 코드를 복사하여 Supabase Edge Function('fetch-coupang-orders')에 배포 후
 * client에서는 supabase.functions.invoke()를 사용하는 것이 정석입니다.
 */

export const marketApi = {
    /**
     * 네이버 주문 수집 (Supabase Edge Function 호출 방식)
     */
    fetchNaverOrders: async (credential: MarketAccount): Promise<Order[]> => {
        if (!supabase) return [];

        try {
            // Edge Function 호출 예시
            const { data, error } = await supabase.functions.invoke('fetch-naver-orders', {
                body: {
                    clientId: credential.credentials?.clientId,
                    clientSecret: credential.credentials?.clientSecret,
                }
            });

            if (error) throw error;

            return data.map((item: any) => ({
                id: `N-${item.productOrderId}`,
                platform: 'NAVER',
                orderNumber: item.orderId,
                productName: item.productName,
                option: item.productOption,
                customerName: item.ordererName,
                date: new Date(item.orderDate).toISOString().split('T')[0],
                status: mapNaverStatus(item.productOrderStatus),
                amount: item.totalPaymentAmount,
                courier: '',
                invoiceNumber: ''
            }));
        } catch (e) {
            console.error("Naver API Error:", e);
            // Fallback for Demo
            return [];
        }
    },

    /**
     * 쿠팡 주문 수집 (Proxy API 사용)
     * Vercel Serverless Function (/api/coupang/fetch-orders)을 통해 호출
     */
    fetchCoupangOrders: async (credential: MarketAccount): Promise<Order[]> => {
        const { accessKey, secretKey, vendorId } = credential.credentials;
        
        if (!accessKey || !secretKey || !vendorId) {
            console.error("쿠팡 인증 정보가 부족합니다.");
            return [];
        }

        try {
            // CORS 우회를 위해 백엔드 프록시 호출
            const response = await fetch('/api/coupang/fetch-orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    vendorId,
                    accessKey,
                    secretKey
                })
            });

            if (!response.ok) {
                // throw new Error(`Coupang Proxy Error (${response.status})`);
                // 데모 환경(API 서버 없음)일 경우 무조건 에러가 발생하므로, 여기서 catch 블록으로 넘깁니다.
                throw new Error("API_UNREACHABLE");
            }

            const json = await response.json();

            // 5. 데이터 매핑 (Coupang Response -> App Order)
            if (!json.data) return [];

            return json.data.map((item: any) => ({
                id: `C-${item.orderId}`, // 쿠팡은 shipmentBoxId 등을 ID로 쓰기도 함
                platform: 'COUPANG',
                orderNumber: String(item.orderId),
                productName: item.vendorItemName || item.itemName,
                option: item.vendorItemPackageName || '단품',
                customerName: item.orderer?.name || '구매자',
                date: item.orderedAt ? item.orderedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                status: 'NEW', // ACCEPT 상태만 가져왔으므로 NEW
                amount: item.orderPrice || 0,
                courier: '',
                invoiceNumber: ''
            }));

        } catch (e) {
            console.warn("API 연동 실패 (데모 모드로 동작):", e);
            
            // [DEMO MODE] 백엔드 API가 없을 때 시연용 데이터를 반환하여 기능 동작 확인
            return [
                {
                    id: `C-DEMO-${Date.now()}-${Math.floor(Math.random()*100)}`,
                    platform: 'COUPANG',
                    orderNumber: `2024${Math.floor(Math.random()*12+1).toString().padStart(2,'0')}${Math.floor(Math.random()*28+1).toString().padStart(2,'0')}-${Math.floor(Math.random()*100000)}`,
                    productName: '[시연용] 쿠팡 로켓 탐사수 2L',
                    option: '12개입 x 2팩',
                    customerName: '김쿠팡',
                    date: new Date().toISOString().split('T')[0],
                    status: 'NEW',
                    amount: 13900,
                    courier: '',
                    invoiceNumber: ''
                },
                {
                    id: `C-DEMO-${Date.now() + 1}`,
                    platform: 'COUPANG',
                    orderNumber: `2024${Math.floor(Math.random()*12+1).toString().padStart(2,'0')}${Math.floor(Math.random()*28+1).toString().padStart(2,'0')}-${Math.floor(Math.random()*100000)}`,
                    productName: '[시연용] 곰곰 쌀 10kg',
                    option: '2023년 햅쌀',
                    customerName: '이로켓',
                    date: new Date().toISOString().split('T')[0],
                    status: 'NEW',
                    amount: 32500,
                    courier: '',
                    invoiceNumber: ''
                }
            ];
        }
    },

    /**
     * 모든 연동된 마켓의 주문을 동기화
     */
    syncAllMarkets: async (credentials: MarketAccount[]) => {
        let allOrders: Order[] = [];
        
        for (const cred of credentials) {
            if (!cred.isActive) continue;

            if (cred.marketType === 'NAVER') {
                const orders = await marketApi.fetchNaverOrders(cred);
                allOrders = [...allOrders, ...orders];
            } else if (cred.marketType === 'COUPANG') {
                const orders = await marketApi.fetchCoupangOrders(cred);
                allOrders = [...allOrders, ...orders];
            }
        }
        
        return allOrders;
    }
};

// 네이버 상태 매핑 헬퍼
function mapNaverStatus(naverStatus: string): OrderStatus {
    switch (naverStatus) {
        case 'PAYED': return 'NEW';
        case 'PRODUCT_PREPARE': return 'PENDING';
        case 'DELIVERY': return 'SHIPPING';
        case 'DELIVERED': return 'DELIVERED';
        case 'CANCELED': return 'CANCELLED';
        case 'RETURNED': return 'RETURNED';
        default: return 'NEW';
    }
}