import { createClient } from '@supabase/supabase-js';

// =================================================================
// [개발자 설정]
// 최종 사용자가 아닌 개발자가 설정하는 값입니다.
// 환경 변수(.env) 또는 아래 상수에 직접 값을 입력하세요.
// =================================================================
const YOUR_SUPABASE_URL = "https://oknypcjubolxtlgudhvh.supabase.co"; 
const YOUR_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbnlwY2p1Ym9seHRsZ3VkaHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDQxODEsImV4cCI6MjA4Mzc4MDE4MX0.EIo1IqFpswKLi0SfHbD1U2_Vi3G5ygwaJ6t5PmhQwyQ";

const getSupabaseConfig = () => {
  // 1. 환경 변수 확인 (Vite/Next.js 등 빌드 환경)
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  if (envUrl && envKey) {
      return { url: envUrl, key: envKey };
  }

  // 2. 코드 상수 사용 (Fallback)
  return {
    url: YOUR_SUPABASE_URL,
    key: YOUR_SUPABASE_ANON_KEY
  };
};

const config = getSupabaseConfig();

// 유효성 검사
const isValidConfig = config.url?.includes('supabase.co') && config.key?.startsWith('eyJ');

if (!isValidConfig) {
    console.warn("⚠️ [Supabase Warning] 유효한 연결 정보가 없습니다. Mock 모드로 동작합니다.");
}

export const supabase = (isValidConfig && config.url && config.key) 
  ? createClient(config.url, config.key)
  : null;

if (supabase) {
    // console.log(`%c✅ Supabase Connected`, "color: #10b981; font-weight: bold; font-size: 14px;");
}

export const isSupabaseConfigured = () => !!supabase;
