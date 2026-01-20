
export type OrderStatus = 'NEW' | 'PENDING' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';

export type Platform = 'NAVER' | 'COUPANG' | '11ST' | 'GMARKET' | 'AUCTION';

export type UserRole = 'USER' | 'ADMIN';
export type PlanType = 'FREE' | 'PRO';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanType;
  joinedAt: string;
  trialEndsAt: string; // Date string ISO
  subscriptionEndsAt?: string; // Date string ISO
  isVerified?: boolean; // 이메일 인증 여부
}

export interface MarketAccount {
  id: string;
  marketType: Platform;
  accountName: string; // 별칭 (예: 쿠팡 1호점)
  credentials: Record<string, string>; // jsonb 대응 (apiKey, secretKey 등 유동적)
  authMode?: 'API' | 'LOGIN'; // 인증 방식 (API Key 또는 ID/PW)
  isActive: boolean;
  createdAt?: string;
}

// 기존 코드 호환성을 위해 alias (Deprecated 예정)
export type MarketCredential = MarketAccount;

export interface Order {
  id: string;
  platform: Platform;
  orderNumber: string;      // 1) 주문번호
  productId?: string;       // 2) 상품번호 (마켓 상품ID)
  productName: string;
  option: string;           // 3) 옵션
  amount: number;           // 9) 주문금액
  
  // 주문자 정보
  ordererName: string;      // 7) 주문자 성명
  ordererPhone: string;     // 6) 주문자 전번
  ordererId?: string;       // 12) 주문자 ID
  
  // 수령자 정보
  receiverName: string;     // 수령자명 (기존 customerName 대체용)
  receiverPhone: string;    // 4) 수령자 전번
  receiverAddress: string;  // 5) 수령자 주소
  
  shippingMemo: string;     // 8) 배송메모
  
  date: string;             // 10) 주문일시 (YYYY-MM-DD HH:mm:ss)
  paymentDate?: string;     // 11) 결제일시
  
  status: OrderStatus;
  invoiceNumber?: string;
  courier?: string;
  
  // 하위 호환성 유지 (UI 깨짐 방지)
  customerName: string; 
}

export interface Claim {
  id: string;
  type: 'RETURN' | 'EXCHANGE' | 'CANCEL';
  orderId: string;
  productName: string;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  customerName: string;
  date: string;
  images: string[];
}

export interface SalesStat {
  date: string;
  amount: number;
  orders: number;
}