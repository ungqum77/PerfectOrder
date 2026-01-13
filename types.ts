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

export interface MarketCredential {
  id: string;
  platform: Platform;
  type: 'LOGIN' | 'API_KEY';
  alias: string; // User defined name (e.g., "Store A", "Main Store")
  isConnected: boolean;
  username?: string;
  apiKey?: string;
  apiSecret?: string; // Added for Naver/Coupang secrets
}

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