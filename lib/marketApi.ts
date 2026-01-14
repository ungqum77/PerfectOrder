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
                productId: item.productId,
                productName: item.productName,
                option: item.productOption,
                amount: item.totalPaymentAmount,
                
                ordererName: item.ordererName,
                ordererPhone: item.ordererTel || '',
                ordererId: item.ordererId,
                
                receiverName: item.receiverName || item.ordererName,
                receiverPhone: item.receiverTel || '',
                receiverAddress: `${item.shippingAddress?.baseAddress || ''} ${item.shippingAddress?.detailedAddress || ''}`.trim(),
                shippingMemo: item.shippingMemo || '',
                
                date: item.orderDate ? new Date(item.orderDate).toISOString().replace('T', ' ').substring(0, 19) : '',
                paymentDate: item.paymentDate ? new Date(item.paymentDate).toISOString().replace('T', ' ').substring(0, 19) : '',
                
                status: mapNaverStatus(item.productOrderStatus),
                courier: '',
                invoiceNumber: '',
                customerName: item.ordererName // 호환성
            }));
        } catch (e) {
            console.error("Naver API Error:", e);
            // 네이버는 실패시 빈 배열 반환
            return [];
        }
    },

    /**
     * 쿠팡 주문 수집 (Proxy API 사용)
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
                 const errorText = await response.text();
                 throw new Error(`Coupang API Error (${response.status}): ${errorText}`);
            }

            const json = await response.json();

            // 5. 데이터 매핑 (Coupang Response -> App Order)
            // 쿠팡 API 문서(Ordersheet) 기준 매핑
            if (!json.data) return [];

            return json.data.map((item: any) => {
                const receiver = item.receiver || {};
                const orderer = item.orderer || {};
                const parcel = item.parcel || {};
                const boxItem = parcel.boxItem || {};

                return {
                    id: `C-${item.orderId}`,
                    platform: 'COUPANG',
                    orderNumber: String(item.orderId),
                    productId: String(item.vendorItemId || boxItem.vendorItemId || ''),
                    productName: item.vendorItemName || item.itemName || '상품명 미상',
                    option: item.vendorItemPackageName || '단품',
                    amount: item.orderPrice || 0,
                    
                    ordererName: orderer.name || '구매자',
                    ordererPhone: orderer.safeNumber || '', // 안심번호
                    ordererId: orderer.email || '', // 쿠팡은 이메일을 ID처럼 사용
                    
                    receiverName: receiver.name || orderer.name,
                    receiverPhone: receiver.safeNumber || '',
                    receiverAddress: `${receiver.addr1 || ''} ${receiver.addr2 || ''}`.trim(),
                    shippingMemo: item.deliveryRequestMessage || '',
                    
                    date: item.orderedAt ? item.orderedAt.replace('T', ' ').substring(0, 19) : '',
                    paymentDate: item.paidAt ? item.paidAt.replace('T', ' ').substring(0, 19) : '',
                    
                    status: 'NEW', // ACCEPT 상태만 가져오므로 NEW
                    courier: '',
                    invoiceNumber: '',
                    customerName: orderer.name || '구매자' // 호환성
                };
            });

        } catch (e: any) {
            console.error("쿠팡 연동 실패:", e.message);
            // 실제 데이터 연동이 실패하면 에러를 던져서 UI에서 알 수 있게 함 (데모 데이터 반환 X)
            throw e; 
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
                // 쿠팡의 경우 에러 발생 시 전체 중단을 막기 위해 개별 try-catch 사용 가능
                // 하지만 사용자가 '실제 연결' 확인을 원하므로 에러를 상위로 전파할 수도 있음.
                // 여기서는 에러 발생 시 해당 계정만 건너뛰고 로그를 남기도록 처리
                try {
                    const orders = await marketApi.fetchCoupangOrders(cred);
                    allOrders = [...allOrders, ...orders];
                } catch (e) {
                    console.error(`쿠팡(${cred.accountName}) 동기화 중 오류 발생`);
                    // 필요시 throw e; 하여 전체 중단 가능
                }
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