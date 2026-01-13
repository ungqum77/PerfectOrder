import { createClient } from '@supabase/supabase-js';

// =================================================================
// [설정 완료]
// 사용자가 제공한 올바른 JWT Anon Key가 적용되었습니다.
// =================================================================
<<<<<<< HEAD
const YOUR_SUPABASE_URL = "https://oknypcjubolxtlgudhvh.supabase.co"; 
=======

>>>>>>> d8ebf0176e953e464a0d299f1d53036af4f3e61c
const YOUR_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbnlwY2p1Ym9seHRsZ3VkaHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDQxODEsImV4cCI6MjA4Mzc4MDE4MX0.EIo1IqFpswKLi0SfHbD1U2_Vi3G5ygwaJ6t5PmhQwyQ";

const getSupabaseConfig = () => {
  // 1. 코드에 하드코딩된 값 최우선 (가장 확실한 방법)
  if (YOUR_SUPABASE_URL && YOUR_SUPABASE_ANON_KEY && YOUR_SUPABASE_ANON_KEY.startsWith('eyJ')) {
    return { url: YOUR_SUPABASE_URL, key: YOUR_SUPABASE_ANON_KEY };
  }

  // 2. 로컬스토리지 확인 (이전 설정이 남아있을 경우 대비)
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem('sb_url') : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem('sb_key') : null;
  
  // 3. 환경변수 확인
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  return {
    url: localUrl || envUrl,
    key: localKey || envKey
  };
};

const config = getSupabaseConfig();

// 유효성 검사
const isValidConfig = config.url?.includes('supabase.co') && config.key?.startsWith('eyJ');

if (!isValidConfig) {
    console.error("🚨 [Supabase Error] 유효한 설정이 없습니다. lib/supabase.ts 파일을 확인해주세요.");
}

export const supabase = (isValidConfig) 
  ? createClient(config.url, config.key)
  : null;

if (supabase) {
    console.log(`%c✅ Supabase Connected`, "color: #10b981; font-weight: bold; font-size: 14px;");
    console.log(`Project: ${config.url}`);
} else {
    console.warn("⚠️ Supabase가 연결되지 않았습니다. Mock 모드로 동작합니다.");
}

export const isSupabaseConfigured = () => !!supabase;

export const saveSupabaseConfig = (url: string, key: string) => {
    if (!key.startsWith('eyJ')) {
        alert("유효하지 않은 API Key입니다. 'eyJ'로 시작하는 Anon Key를 입력해주세요.");
        return;
    }
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
    window.location.reload();
};
