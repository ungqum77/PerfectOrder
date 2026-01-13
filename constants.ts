import { Order, Claim, SalesStat } from './types';

export const MOCK_ORDERS: Order[] = [
  {
    id: '1',
    platform: 'NAVER',
    orderNumber: '20240520-0001',
    productName: '프리미엄 1++ 한우 세트 (500g)',
    option: '기본 포장',
    customerName: '김민수',
    date: '2024-05-20',
    status: 'NEW',
    amount: 125000,
  },
  {
    id: '2',
    platform: 'COUPANG',
    orderNumber: '20240520-0002',
    productName: '오가닉 코튼 호텔 수건 10p',
    option: '다크 그레이',
    customerName: '이지현',
    date: '2024-05-20',
    status: 'NEW',
    amount: 35000,
  },
  {
    id: '3',
    platform: '11ST',
    orderNumber: '20240519-0042',
    productName: '무선 기계식 키보드',
    option: '적축 / 화이트',
    customerName: '박도산',
    date: '2024-05-19',
    status: 'PENDING',
    amount: 142000,
  },
  {
    id: '4',
    platform: 'NAVER',
    orderNumber: '20240519-0015',
    productName: '비타민 C 1000mg',
    option: '3개월분',
    customerName: '최수진',
    date: '2024-05-19',
    status: 'SHIPPING',
    amount: 28000,
    invoiceNumber: '6453-2213-4421',
    courier: 'CJ대한통운'
  },
  {
    id: '5',
    platform: 'GMARKET',
    orderNumber: '20240518-0112',
    productName: '초경량 캠핑 의자',
    option: '베이지',
    customerName: '정우성',
    date: '2024-05-18',
    status: 'DELIVERED',
    amount: 45000,
    invoiceNumber: '1123-5567-8890',
    courier: '롯데택배'
  }
];

export const MOCK_CLAIMS: Claim[] = [
  {
    id: 'c1',
    type: 'RETURN',
    orderId: '20240515-0033',
    productName: '여름 린넨 셔츠',
    customerName: '강하늘',
    reason: '상세 설명과 실제 사이즈가 다릅니다.',
    status: 'REQUESTED',
    date: '2024-05-20',
    images: ['https://picsum.photos/400/400', 'https://picsum.photos/401/401']
  },
  {
    id: 'c2',
    type: 'CANCEL',
    orderId: '20240519-0012',
    productName: '게이밍 마우스 장패드',
    customerName: '송혜교',
    reason: '단순 변심',
    status: 'APPROVED',
    date: '2024-05-19',
    images: []
  }
];

export const SALES_DATA: SalesStat[] = [
  { date: '05/15', amount: 1200000, orders: 45 },
  { date: '05/16', amount: 1450000, orders: 52 },
  { date: '05/17', amount: 980000, orders: 38 },
  { date: '05/18', amount: 2100000, orders: 85 },
  { date: '05/19', amount: 1850000, orders: 64 },
  { date: '05/20', amount: 2450000, orders: 92 },
  { date: '05/21', amount: 1650000, orders: 58 },
];
