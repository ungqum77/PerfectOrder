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
     * 쿠팡 주문 수집 (Proxy API 사용) - 모든 상태 동기화
     */
    fetchCoupangOrders: async (credential: MarketAccount): Promise<Order[]> => {
        const { accessKey, secretKey, vendorId } = credential.credentials;
        
        if (!accessKey || !secretKey || !vendorId) {
            console.error("쿠팡 인증 정보가 부족합니다.");
            return [];
        }

        // 쿠팡에서 조회할 상태 목록
        // ACCEPT: 결제완료 -> 신규주문 (NEW)
        // INSTRUCT: 상품준비중 -> 발송대기 (PENDING)
        // DEPARTURE: 배송지시 -> 배송중 (SHIPPING)
        // DELIVERING: 배송중 -> 배송중 (SHIPPING)
        // FINAL_DELIVERY: 배송완료 -> 배송완료 (DELIVERED)
        const targetStatuses = ['ACCEPT', 'INSTRUCT', 'DEPARTURE', 'DELIVERING', 'FINAL_DELIVERY'];
        let allCoupangOrders: Order[] = [];

        console.log(`[Coupang Sync] '${credential.accountName}' 계정 동기화 시작`);

        try {
            // 병렬로 모든 상태 호출
            const requests = targetStatuses.map(status => 
                fetch('/api/coupang/fetch-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vendorId, accessKey, secretKey, status })
                }).then(async (res) => {
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        console.warn(`[Coupang Sync] ${status} 조회 실패:`, err);
                        
                        // [중요] IP 차단(403)이나 권한 오류(401)는 빈 배열로 무시하지 않고 에러를 던져야 함
                        if (res.status === 403 || res.status === 401) {
                            let errorMsg = err.hint || err.details || `쿠팡 API 접근 권한 오류 (${res.status})`;
                            
                            // 에러 객체 생성 및 currentIp 정보 확장
                            const customError: any = new Error(errorMsg);
                            customError.currentIp = err.currentIp; // 서버에서 전달받은 IP
                            throw customError;
                        }
                        
                        // 그 외 일시적 오류는 로그만 남기고 빈 배열 반환 (전체 동기화가 멈추지 않도록)
                        return []; 
                    }
                    const json = await res.json();
                    
                    if (json.debugInfo) {
                        console.log(`[Coupang Sync] ${status} 조회 범위: ${json.debugInfo.dateRange.from} ~ ${json.debugInfo.dateRange.to} (KST)`);
                    }

                    const count = json.data?.length || 0;
                    console.log(`[Coupang Sync] ${status}: ${count}건 발견`);
                    return json.data || [];
                })
            );

            const results = await Promise.all(requests);

            // 결과 평탄화 및 매핑
            results.forEach((items: any[], index) => {
                const coupangStatus = targetStatuses[index];
                
                const mappedOrders = items.map((item: any) => {
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
                        ordererId: orderer.email || '',
                        
                        receiverName: receiver.name || orderer.name,
                        receiverPhone: receiver.safeNumber || '',
                        receiverAddress: `${receiver.addr1 || ''} ${receiver.addr2 || ''}`.trim(),
                        shippingMemo: item.deliveryRequestMessage || '',
                        
                        date: item.orderedAt ? item.orderedAt.replace('T', ' ').substring(0, 19) : '',
                        paymentDate: item.paidAt ? item.paidAt.replace('T', ' ').substring(0, 19) : '',
                        
                        // 상태 매핑
                        status: mapCoupangStatus(coupangStatus),
                        courier: item.deliveryCompanyName || '',
                        invoiceNumber: item.invoiceNumber || '',
                        customerName: orderer.name || '구매자' // 호환성
                    } as Order;
                });
                
                allCoupangOrders = [...allCoupangOrders, ...mappedOrders];
            });

            console.log(`[Coupang Sync] 최종 ${allCoupangOrders.length}건 병합 완료`);
            return allCoupangOrders;

        } catch (e: any) {
            console.error("쿠팡 연동 치명적 오류:", e.message);
            // 에러를 던져서 상위 컴포넌트(Header)가 Alert를 띄우게 함
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
                try {
                    const orders = await marketApi.fetchCoupangOrders(cred);
                    allOrders = [...allOrders, ...orders];
                } catch (e: any) {
                    console.error(`쿠팡(${cred.accountName}) 동기화 실패:`, e.message);
                    throw new Error(`쿠팡 연동 실패 (${cred.accountName}):\n${e.message}`);
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

// 쿠팡 상태 매핑 헬퍼
function mapCoupangStatus(coupangStatus: string): OrderStatus {
    switch (coupangStatus) {
        case 'ACCEPT': return 'NEW';          // 결제완료 -> 신규주문
        case 'INSTRUCT': return 'PENDING';    // 상품준비중 -> 발송대기
        case 'DEPARTURE': return 'SHIPPING';  // 배송지시 -> 배송중
        case 'DELIVERING': return 'SHIPPING'; // 배송중 -> 배송중
        case 'FINAL_DELIVERY': return 'DELIVERED'; // 배송완료 -> 배송완료
        default: return 'NEW';
    }
}