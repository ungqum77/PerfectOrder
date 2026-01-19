import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, UserRole, PlanType } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (email: string, password: string, name: string) => Promise<string | null>;
  logout: () => void;
  checkPermission: () => boolean;
  refreshUser: () => void;
  resendVerification: (email: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 세션 정보를 우리 앱의 User 타입으로 변환하는 헬퍼 함수
  const mapSessionToUser = async (sessionUser: any): Promise<User | null> => {
      if (!sessionUser) return null;
      
      // DB에서 추가 정보 가져오기 시도
      let dbUser: any = null;
      if (isSupabaseConfigured() && supabase) {
          const { data } = await supabase
              .from('users')
              .select('*')
              .eq('id', sessionUser.id)
              .single();
          dbUser = data;
      }

      // DB 정보가 없으면 메타데이터나 기본값 사용 (회원가입 직후 등)
      return {
          id: sessionUser.id,
          email: sessionUser.email!,
          name: dbUser?.name || sessionUser.user_metadata?.full_name || 'User',
          role: (dbUser?.role as UserRole) || 'USER',
          plan: (dbUser?.plan as PlanType) || 'FREE',
          joinedAt: dbUser?.joined_at || new Date().toISOString(),
          trialEndsAt: dbUser?.trial_ends_at || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          subscriptionEndsAt: dbUser?.subscription_ends_at,
          isVerified: !!sessionUser.email_confirmed_at
      };
  };

  useEffect(() => {
    const initializeAuth = async () => {
        // 1. 실제 Supabase가 연결된 경우
        if (isSupabaseConfigured() && supabase) {
            // 현재 세션 가져오기
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const mappedUser = await mapSessionToUser(session.user);
                setUser(mappedUser);
            }

            // 실시간 인증 상태 변경 감지 (이메일 링크 클릭 후 복귀 시 자동 실행됨)
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    const mappedUser = await mapSessionToUser(session.user);
                    setUser(mappedUser);
                } else {
                    setUser(null);
                }
                setLoading(false);
            });

            return () => {
                subscription.unsubscribe();
            };
        } 
        // 2. Mock 모드인 경우
        else {
            const sessionUser = mockSupabase.auth.getSession();
            setUser(sessionUser);
            setLoading(false);
        }
    };

    initializeAuth();
  }, []);

  const refreshUser = async () => {
    if (isSupabaseConfigured() && supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            const mappedUser = await mapSessionToUser(session.user);
            setUser(mappedUser);
        }
    } else {
        const sessionUser = mockSupabase.auth.getSession();
        setUser(sessionUser);
    }
  };

  const login = async (email: string, password: string) => {
    const { user, error } = await mockSupabase.auth.signIn(email, password);
    // onAuthStateChange가 처리하므로 여기서 setUser를 굳이 안해도 되지만, 
    // Mock 모드를 위해 유지하거나, 즉각적인 반응을 위해 둠.
    if (user && !isSupabaseConfigured()) setUser(user);
    return error;
  };

  const signup = async (email: string, password: string, name: string) => {
    const { user, error } = await mockSupabase.auth.signUp(email, password, name);
    if (user && !isSupabaseConfigured()) setUser(user);
    return error;
  };

  const resendVerification = async (email: string) => {
      return await mockSupabase.auth.resendEmail(email);
  }

  const logout = async () => {
    await mockSupabase.auth.signOut();
    setUser(null);
  };

  const checkPermission = (): boolean => {
    if (!user) return false;
    
    if (user.role === 'ADMIN') return true;

    if (user.plan === 'PRO') {
        if (user.subscriptionEndsAt) {
            return new Date(user.subscriptionEndsAt) > new Date();
        }
        return true;
    }

    const now = new Date();
    const trialEnd = new Date(user.trialEndsAt);
    return now < trialEnd;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, checkPermission, refreshUser, resendVerification }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};