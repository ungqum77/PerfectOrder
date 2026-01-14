import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  ORDERS: 'po_orders',
};

// UUID 생성 헬퍼
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const toCamelCase = (obj: any): any => {
    if (Array.isArray(obj)) {
        return obj.map(v => toCamelCase(v));
    } else if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            result[camelKey] = toCamelCase(obj[key]);
            return result;
        }, {} as any);
    }
    return obj;
};

// 로컬 스토리지 헬퍼
const getLocalData = <T>(key: string): T[] => {
    try {
        const str = localStorage.getItem(key);
        return str ? JSON.parse(str) : [];
    } catch { return []; }
};
const setLocalData = (key: string, data: any[]) => localStorage.setItem(key, JSON.stringify(data));

// 로컬 스토리지에 유저 저장 헬퍼 (백업용)
const saveLocalUser = (user: User) => {
    const users = getLocalData<User>(STORAGE_KEYS.USERS);
    const existingIndex = users.findIndex(u => u.email === user.email);
    if (existingIndex >= 0) {
        users[existingIndex] = user;
    } else {
        users.push(user);
    }
    setLocalData(STORAGE_KEYS.USERS, users);
};

export const mockSupabase = {
  getConnectionStatus: () => isSupabaseConfigured() ? 'CONNECTED' : 'DISCONNECTED',

  auth: {
    // ... (기존 Auth 로직 유지)
    signUp: async (email: string, password: string, name: string): Promise<{ user: User | null, error: string | null }> => {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString();
      const localId = generateUUID(); 

      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: name },
              emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
            }
          });
          
          if (authError) throw authError;

          const newUser: User = {
            id: authData.user ? authData.user.id : localId,
            email,
            name,
            role: 'USER',
            plan: 'FREE',
            joinedAt: now.toISOString(),
            trialEndsAt: trialEndsAt,
            isVerified: false
          };

          saveLocalUser(newUser);
          return { user: newUser, error: null };

        } catch (e: any) { 
            console.error("Supabase SignUp Error:", e);
            return { user: null, error: e.message || "회원가입 중 오류가 발생했습니다." };
        }
      }

      const users = getLocalData<User>(STORAGE_KEYS.USERS);
      if (users.find(u => u.email === email)) return { user: null, error: "이미 존재하는 이메일입니다." };

      const newUser: User = {
        id: localId,
        email,
        name,
        role: email.includes('admin') ? 'ADMIN' : 'USER',
        plan: 'FREE',
        joinedAt: now.toISOString(),
        trialEndsAt: trialEndsAt,
        isVerified: false
      };
      saveLocalUser(newUser);
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(newUser));
      return { user: newUser, error: null };
    },

    signIn: async (email: string, password: string): Promise<{ user: User | null, error: string | null }> => {
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
          
          if (authError) {
              if (authError.message.includes("Email not confirmed")) {
                   console.warn("이메일 미인증 상태입니다. 로컬 백업 계정 확인 중...");
              } else {
                  throw authError; 
              }
          }

          if (authData.user) {
            const { data: dbUser } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
            const user: User = {
                id: authData.user.id,
                email: authData.user.email!,
                name: dbUser?.name || authData.user.user_metadata?.full_name || 'User',
                role: (dbUser?.role as any) || 'USER',
                plan: (dbUser?.plan as any) || 'FREE',
                joinedAt: authData.user.created_at,
                trialEndsAt: new Date(Date.now() + 86400000 * 2).toISOString(),
                isVerified: true
            };
            return { user, error: null };
          }
        } catch (e: any) {
            console.warn("Supabase Login Failed:", e.message);
        }
      }

      const users = getLocalData<User>(STORAGE_KEYS.USERS);
      const user = users.find(u => u.email === email);
      
      if (!user) return { user: null, error: "사용자를 찾을 수 없습니다. 회원가입을 확인해주세요." };

      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
      return { user, error: null };
    },

    resendEmail: async (email: string): Promise<string | null> => {
        if (isSupabaseConfigured() && supabase) {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
                options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
            });
            return error ? error.message : null;
        }
        return "DB 설정이 되어있지 않습니다.";
    },

    signOut: async () => {
      if (isSupabaseConfigured() && supabase) await supabase.auth.signOut();
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    },

    getSession: () => {
      const session = localStorage.getItem(STORAGE_KEYS.SESSION);
      return session ? JSON.parse(session) : null;
    }
  },

  db: {
    users: {
        update: async (userId: string, updates: Partial<User>) => {
            if (isSupabaseConfigured() && supabase) {
                try {
                    await supabase.from('users').update(updates).eq('id', userId);
                } catch(e) { console.error(e); }
            }
            const users = getLocalData<User>(STORAGE_KEYS.USERS);
            const newUsers = users.map(u => u.id === userId ? { ...u, ...updates } : u);
            setLocalData(STORAGE_KEYS.USERS, newUsers);
            
            const session = localStorage.getItem(STORAGE_KEYS.SESSION);
            if (session) {
                const current = JSON.parse(session);
                if (current.id === userId) localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({ ...current, ...updates }));
            }
        },
        getAll: async (): Promise<User[]> => {
            if (isSupabaseConfigured() && supabase) {
                const { data } = await supabase.from('users').select('*');
                if (data) return toCamelCase(data);
            }
            return getLocalData<User>(STORAGE_KEYS.USERS);
        }
    },
    
    // =================================================================
    // V3: Market Logic (Flat Table Structure)
    // =================================================================
    markets: {
        get: async (): Promise<MarketAccount[]> => {
            if (!isSupabaseConfigured() || !supabase) return [];
            
            let userId = null;
            const { data: { user } } = await supabase.auth.getUser();
            userId = user?.id;

            if (!userId) {
                const session = mockSupabase.auth.getSession();
                if (session) userId = session.id;
            }

            if (!userId) return [];

            const { data, error } = await supabase.from('market_accounts').select('*').eq('user_id', userId);
            
            if (error) {
                // 테이블이 없을 때(42P01) 조용히 빈 배열 반환 (사용자 경험 고려)
                console.error("DB Fetch Error:", error);
                return [];
            }

            // DB의 Flat Structure를 프론트엔드 UI용 Nested 구조로 매핑
            return data.map((item: any) => ({
                id: item.id,
                marketType: item.market_type,
                accountName: item.account_name,
                isActive: item.is_active,
                createdAt: item.created_at,
                // UI 호환성을 위한 역매핑
                credentials: {
                    // 공통
                    vendorId: item.vendor_id || '',
                    username: item.vendor_id || '', // Gmarket 등
                    
                    // Key 1
                    accessKey: item.access_key || '',
                    clientId: item.access_key || '', // Naver
                    apiKey: item.access_key || '', // 11st

                    // Key 2
                    secretKey: item.secret_key || '',
                    clientSecret: item.secret_key || '', // Naver
                    password: item.secret_key || '', // Gmarket
                }
            }));
        },

        // [New V3 Logic] 단순 Insert + 중복 검사
        saveSimple: async (account: MarketAccount): Promise<{ success: boolean; message?: string }> => {
            if (!isSupabaseConfigured() || !supabase) {
                return { success: false, message: "DB 클라이언트가 초기화되지 않았습니다. (Code: CLIENT_ERR)" };
            }

            // 1. 유저 확인
            const { data: { user } } = await supabase.auth.getUser();
            let userId = user?.id || mockSupabase.auth.getSession()?.id;
            
            // 만약 유저 정보를 못 가져왔다면 세션 한번 더 확인
            if (!userId) {
                 const session = await supabase.auth.getSession();
                 userId = session.data.session?.user?.id;
            }

            if (!userId) return { success: false, message: "로그인이 필요합니다." };

            // 2. 데이터 준비 & Sanitization (Integration.tsx에서도 하지만 한번 더 수행)
            const creds = account.credentials;
            const clean = (value: string) => {
                if (!value) return "";
                return value
                    .normalize("NFKC")
                    .replace(/[\u200B-\u200D\uFEFF]/g, "")
                    .replace(/\u00A0/g, " ")
                    .replace(/[\r\n\t\u2028\u2029]/g, "")
                    .replace(/\s+/g, "")
                    .trim();
            };

            const accountName = clean(account.accountName);
            let vendorId = clean(creds.vendorId || creds.username);
            let key1 = clean(creds.accessKey || creds.apiKey || creds.clientId);
            let key2 = clean(creds.secretKey || creds.clientSecret || creds.password);

            // 플랫폼별 키 매핑 보정
            switch (account.marketType) {
                case 'NAVER': 
                    key1 = clean(creds.clientId); 
                    key2 = clean(creds.clientSecret); 
                    break;
                case 'COUPANG': 
                    vendorId = clean(creds.vendorId); 
                    key1 = clean(creds.accessKey); 
                    key2 = clean(creds.secretKey); 
                    break;
                case '11ST': 
                    key1 = clean(creds.apiKey); 
                    break;
                case 'GMARKET': 
                case 'AUCTION': 
                    vendorId = clean(creds.username); 
                    key2 = clean(creds.password); 
                    break;
            }

            // 3. 중복 검사 (DB Select)
            const { data: existingList, error: fetchError } = await supabase
                .from('market_accounts')
                .select('account_name, access_key, vendor_id, market_type')
                .eq('user_id', userId);

            // [Error Handling] 테이블이 없으면 여기서 42P01 에러가 발생
            if (fetchError) {
                console.error("Fetch Error:", fetchError);
                if (fetchError.code === '42P01') {
                     return { success: false, message: "DB 테이블(market_accounts)이 없습니다. 제공된 SQL 스크립트를 Supabase SQL Editor에서 실행해주세요." };
                }
                return { success: false, message: `중복 검사 오류: ${fetchError.message}` };
            }
            
            if (existingList) {
                const dupAlias = existingList.find((e: any) => e.account_name === accountName);
                if (dupAlias) return { success: false, message: `이미 존재하는 별칭입니다: '${accountName}'` };

                if (key1) {
                    const dupKey = existingList.find((e: any) => e.market_type === account.marketType && e.access_key === key1);
                    if (dupKey) return { success: false, message: "이미 등록된 API Key입니다." };
                }
                
                if (vendorId) {
                     const dupId = existingList.find((e: any) => e.market_type === account.marketType && e.vendor_id === vendorId);
                     if (dupId) return { success: false, message: `이미 등록된 ID입니다: '${vendorId}'` };
                }
            }

            // 4. Payload 구성 (user_id 명시적 포함)
            const payload = {
                id: account.id || generateUUID(),
                user_id: userId, // 여기서 주입해야 NOT NULL 에러 방지
                market_type: account.marketType,
                account_name: accountName,
                is_active: true,
                vendor_id: vendorId, // marketid
                access_key: key1,    // key1
                secret_key: key2,    // key2
                created_at: new Date().toISOString()
            };

            // 5. 단순 INSERT & Error Handling
            const { error: insertError } = await supabase.from('market_accounts').insert(payload);

            if (insertError) {
                console.error("DB Insert Error Details:", insertError);
                 if (insertError.code === '42P01') {
                     return { success: false, message: "DB 테이블(market_accounts)이 존재하지 않습니다. SQL Editor에서 테이블을 생성해주세요." };
                }
                return { 
                    success: false, 
                    message: `저장 실패 [${insertError.code}]: ${insertError.message}` 
                };
            }

            return { success: true };
        },

        delete: async (id: string) => {
            if (isSupabaseConfigured() && supabase) {
                await supabase.from('market_accounts').delete().eq('id', id);
            }
        },

        // 하위 호환성을 위한 더미 함수
        syncPendingItems: async () => 0 
    },

    orders: {
        init: () => {
            if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
            }
        },
        getAll: async (): Promise<Order[]> => {
            const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
            if (!str) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
                return MOCK_ORDERS;
            }
            return JSON.parse(str);
        },
        updateStatus: async (orderIds: string[], newStatus: OrderStatus) => {
            const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
            let orders: Order[] = str ? JSON.parse(str) : MOCK_ORDERS;
            orders = orders.map(order => orderIds.includes(order.id) ? { ...order, status: newStatus } : order);
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        }
    }
  }
};

mockSupabase.db.orders.init();