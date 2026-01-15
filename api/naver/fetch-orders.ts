import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

// 네이버 API는 토큰 발급 -> 주문 조회 순서로 진행됩니다.
// 네이버 커머스 API (스마트스토어)

export const config = {
  maxDuration: 10,
};

const sanitize = (val: any) => {
    if (!val) return '';
    return String(val).trim();
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', "true");
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
      const { clientId, clientSecret } = req.body;
      const cleanClientId = sanitize(clientId);
      const cleanClientSecret = sanitize(clientSecret);

      if (!cleanClientId || !cleanClientSecret) {
          res.status(400).json({ error: 'Client ID와 Client Secret이 필요합니다.' });
          return;
      }

      // Proxy 설정 (네이버는 IP 제한이 덜하지만, 안전을 위해 설정 가능)
      const proxyUrl = process.env.FIXED_IP_PROXY_URL;
      const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

      // 1. 액세스 토큰 발급 (OAuth2 Client Credentials)
      // https://api.commerce.naver.com/external/v1/oauth2/token
      const tokenUrl = 'https://api.commerce.naver.com/external/v1/oauth2/token';
      const tokenParams = new URLSearchParams();
      tokenParams.append('client_id', cleanClientId);
      tokenParams.append('client_secret', cleanClientSecret);
      tokenParams.append('grant_type', 'client_credentials');
      tokenParams.append('type', 'SELF'); // 셀러 본인 연동

      // 1-1. 토큰 요청
      // timestamp 생성 (필요한 경우) - OAuth2 엔드포인트는 보통 Basic/Post 파라미터 사용
      // 네이버 커머스 문서를 기준, timestamp와 signature는 일부 API에서 사용하나, 
      // 표준 OAuth2 토큰 발급은 client_id/secret 사용
      
      // *주의: 네이버 커머스 API는 bcrypt로 생성한 client_secret_sign이 필요할 수 있습니다.
      // 그러나 라이브러리 제약상 여기서는 Standard 방식으로 시도합니다.
      // 만약 실패한다면 사용자가 "애플리케이션 ID/Secret"이 아니라 "커머스API 계정" 정보를 넣었는지 확인 필요.
      
      const tokenRes = await axios.post(tokenUrl, tokenParams, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent,
          proxy: false,
          validateStatus: () => true
      });

      if (tokenRes.status !== 200) {
          throw new Error(`네이버 토큰 발급 실패 (${tokenRes.status}): ${JSON.stringify(tokenRes.data)}`);
      }

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) {
          throw new Error('액세스 토큰을 받아오지 못했습니다.');
      }

      // 2. 주문 조회 (Product Orders)
      // https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses
      // 최근 변경된 주문 내역 조회
      const d = new Date();
      d.setDate(d.getDate() - 1); // 어제부터
      const lastChangedFrom = d.toISOString(); 

      const ordersUrl = `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders/last-changed-statuses?lastChangedFrom=${lastChangedFrom}`;
      
      const ordersRes = await axios.get(ordersUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          httpsAgent,
          proxy: false,
          validateStatus: () => true
      });

      if (ordersRes.status !== 200) {
           // 403이나 401이면 키 문제
           throw new Error(`주문 조회 실패 (${ordersRes.status}): ${JSON.stringify(ordersRes.data)}`);
      }

      const data = ordersRes.data;
      const orderIds = data.data ? data.data.lastChangeStatuses.map((o: any) => o.productOrderId) : [];

      // 주문 상세 정보가 필요하면 추가 조회가 필요하지만, 
      // 여기서는 연결 테스트 성공 및 ID 리스트 반환을 목표로 함
      
      res.status(200).json({
          success: true,
          message: "네이버 스마트스토어 연동 성공",
          count: orderIds.length,
          data: orderIds.map((id: string) => ({
              orderId: id,
              status: 'NEW', // 상세 조회 전 임시 상태
              // 실제 데이터는 /product-orders/query 등을 통해 가져와야 함
          }))
      });

  } catch (error: any) {
      console.error("Naver API Error:", error.message);
      res.status(500).json({
          error: 'Naver Sync Failed',
          details: error.message
      });
  }
}