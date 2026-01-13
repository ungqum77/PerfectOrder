import { createClient } from '@supabase/supabase-js';

// =================================================================
// [설정] 입력하신 정보가 적용되었습니다.
// 만약 'Live DB' 연결에 실패한다면, Key가 'anon' (public) 키인지 확인해주세요.
// (일반적으로 eyJ로 시작하는 긴 문자열입니다)
// =================================================================
const YOUR_SUPABASE_URL = "https://oknypcjubolxtlgudhvh.supabase.co";
const YOUR_SUPABASE_ANON_KEY = "sb_publishable_hQugueyjzI-4nkBOTEq4oQ_SMN82wnl";

const getSupabaseConfig = () => {
  // 1. 직접 입력한 값 최우선
  if (YOUR_SUPABASE_URL && YOUR_SUPABASE_ANON_KEY) {
    return { url: YOUR_SUPABASE_URL, key: YOUR_SUPABASE_ANON_KEY };
  }

  // 2. 로컬스토리지 확인
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

export const supabase = (config.url && config.key) 
  ? createClient(config.url, config.key)
  : null;

if (supabase) {
    console.log(`✅ Supabase Configuration Loaded: ${config.url}`);
}

export const isSupabaseConfigured = () => !!supabase;

export const saveSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
    window.location.reload();
};

export const clearSupabaseConfig = () => {
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
    window.location.reload();
};