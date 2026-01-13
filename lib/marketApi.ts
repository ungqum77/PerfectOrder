import { supabase } from './supabase';
import { Order, MarketCredential } from '../types';

/**
 * 네이버 커머스 API는 브라우저에서 직접 호출할 수 없습니다 (CORS 문제).
 * 따라서 Supabase Edge Function을 통해 우회 호출해야 합니다.
 * 이 파일은 프론트엔드에서 Edge Function을 호출하는 로직입니다.
 */

export const marketApi = {
    /**
     * 네이버 주문 수집 (Supabase Edge Function 'fetch-naver-orders' 호출)
     */
    fetchNaverOrders: async (credential: MarketCredential): Promise<Order[]> => {
        if (!supabase) {
            console.error("Supabase client not initialized");
            return [];
        }

        try {
            // Edge Function 호출
            // 실제 구현 시에는 Supabase 프로젝트에 'fetch-naver-orders'라는 Edge Function을 배포해야 합니다.
            const { data, error } = await supabase.functions.invoke('fetch-naver-orders', {
                body: {
                    clientId: credential.apiKey, // Naver Application ID
                    clientSecret: credential.apiSecret, // Naver Application Secret
                }
            });

            if (error) throw error;

            // 네이버 데이터 형식을 우리 앱의 Order 형식으로 변환
            // (Edge Function에서 변환해서 줄 수도 있고, 여기서 할 수도 있습니다)
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
            console.error("Failed to fetch Naver orders:", e);
            // 에러 발생 시 빈 배열 반환 혹은 에러 처리
            return [];
        }
    },

    /**
     * 모든 연동된 마켓의 주문을 동기화
     */
    syncAllMarkets: async (credentials: MarketCredential[]) => {
        let allOrders: Order[] = [];
        
        for (const cred of credentials) {
            if (!cred.isConnected) continue;

            if (cred.platform === 'NAVER') {
                const orders = await marketApi.fetchNaverOrders(cred);
                allOrders = [...allOrders, ...orders];
            }
            // 쿠팡, 11번가 등 추가 구현 필요
        }
        
        return allOrders;
    }
};

// 네이버 상태 코드를 우리 앱 상태 코드로 매핑
function mapNaverStatus(naverStatus: string): any {
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
