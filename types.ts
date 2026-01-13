
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

// 변경된 DB 스키마에 맞춘 인터페이스
export interface MarketAccount {
  id: string;
  marketType: Platform;
  accountName: string; // 별칭 (예: 쿠팡 1호점)
  credentials: Record<string, string>; // jsonb 대응 (apiKey, secretKey 등 유동적)
  isActive: boolean;
  createdAt?: string;
}

// 기존 코드 호환성을 위해 alias (Deprecated 예정)
export type MarketCredential = MarketAccount;

export interface Order {
  id: string;
  platform: Platform;
  orderNumber: string;
  productName: string;
  option: string;
  customerName: string;
  date: string;
  status: OrderStatus;
  amount: number;
  invoiceNumber?: string;
  courier?: string;
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
