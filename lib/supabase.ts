import { createClient } from '@supabase/supabase-js';

// =================================================================
// [개발자 설정]
// 유효한 Supabase 프로젝트 URL과 Anon Key입니다.
// =================================================================
const DEFAULT_SUPABASE_URL = "https://oknypcjubolxtlgudhvh.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbnlwY2p1Ym9seHRsZ3VkaHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMDQxODEsImV4cCI6MjA4Mzc4MDE4MX0.EIo1IqFpswKLi0SfHbD1U2_Vi3G5ygwaJ6t5PmhQwyQ";

const getSupabaseConfig = () => {
    let envUrl, envKey;

    try {
        // Vite / Next.js 환경 변수 안전하게 접근
        envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } catch (e) {
        // 환경 변수 접근 실패 시 process.env 시도
        try {
            envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        } catch (e2) { }
    }

    // 환경 변수가 있으면 우선 사용, 없으면 하드코딩 값 사용
    // 공백 제거 (Trim) 추가하여 붙여넣기 오류 방지
    const url = (envUrl && envUrl.includes('supabase.co')) ? envUrl.trim() : DEFAULT_SUPABASE_URL.trim();
    const key = (envKey && envKey.startsWith('eyJ')) ? envKey.trim() : DEFAULT_SUPABASE_ANON_KEY.trim();

    return { url, key };
};

const config = getSupabaseConfig();

// 클라이언트 생성 (무조건 생성 시도)
export const supabase = createClient(config.url, config.key);

// 설정 유효성 검사 함수
export const isSupabaseConfigured = () => {
    // 클라이언트 객체와 URL, KEY가 존재하는지 확인
    return !!supabase && !!config.url && !!config.key;
};

// 연결 확인 로그
if (isSupabaseConfigured()) {
    console.log(`✅ Supabase Client Initialized`);
} else {
    console.error("❌ Supabase Client Initialization Failed");
}