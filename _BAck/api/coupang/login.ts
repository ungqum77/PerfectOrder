import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 보안 및 안정성 이슈로 인해 ID/PW 기반 로그인 기능은 제거되었습니다.
  // 공식 Open API Key 방식을 사용해주세요.
  res.status(403).json({ 
      error: 'Feature Disabled', 
      message: '쿠팡 ID/PW 로그인 기능은 보안 정책상 지원하지 않습니다. Open API Key를 사용해주세요.' 
  });
}