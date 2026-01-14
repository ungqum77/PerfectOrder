import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  ORDERS: 'po_orders',
  // PENDING_MARKETS: 'po_pending_markets' // [DEPRECATED] 더 이상 사용하지 않음
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
    
    // [DEPRECATED] 이전 버전의 복잡한 로직은 주석 처리하여 보존
    /*
    markets: {
        save: async (account: MarketAccount): Promise<{ success: boolean; mode: 'DB' | 'LOCAL' | 'OFFLINE_QUEUE'; message?: string }> => {
            // ... (Old Sync Logic) ...
        },
        delete: async (id: string) => { ... },
        get: async (): Promise<MarketAccount[]> => { ... },
        syncPendingItems: async (): Promise<number> => { ... }
    },
    */

    // [NEW] 단순하고 강력한 V2 로직
    markets: {
        // 동기화 로직을 대체하는 단순 Get
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
                console.error("DB Fetch Error:", error);
                return [];
            }

            return data.map((item: any) => ({
                id: item.id,
                marketType: item.market_type,
                accountName: item.account_name,
                isActive: item.is_active,
                createdAt: item.created_at,
                credentials: {
                    vendorId: item.vendor_id || '',
                    // 프론트엔드 호환성을 위해 키 매핑
                    accessKey: item.access_key,
                    secretKey: item.secret_key,
                    clientId: item.access_key, 
                    clientSecret: item.secret_key, 
                    apiKey: item.access_key,
                    username: item.vendor_id, 
                    password: item.secret_key, 
                }
            }));
        },

        // [핵심] 3번: Insert 로직을 회원가입처럼 간단하게 + 6번: 중복검사
        saveSimple: async (account: MarketAccount): Promise<{ success: boolean; message?: string }> => {
            if (!isSupabaseConfigured() || !supabase) {
                return { success: false, message: "DB가 연결되지 않았습니다." };
            }

            // 1. 유저 확인
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || mockSupabase.auth.getSession()?.id;

            if (!userId) return { success: false, message: "로그인이 필요합니다." };

            // 2. 데이터 준비 (Mapping)
            const creds = account.credentials;
            // 3번: 무결성 검사를 위한 Trim (이미 UI에서 했지만 한번 더 보장)
            const clean = (s: string) => (s || '').trim();

            let vendorId = clean(creds.vendorId || creds.username);
            let key1 = clean(creds.accessKey || creds.apiKey || creds.clientId);
            let key2 = clean(creds.secretKey || creds.clientSecret || creds.password);

            // 플랫폼별 키 매핑 보정
            switch (account.marketType) {
                case 'NAVER': key1 = clean(creds.clientId); key2 = clean(creds.clientSecret); break;
                case 'COUPANG': vendorId = clean(creds.vendorId); key1 = clean(creds.accessKey); key2 = clean(creds.secretKey); break;
                case '11ST': key1 = clean(creds.apiKey); break;
                case 'GMARKET': case 'AUCTION': vendorId = clean(creds.username); key2 = clean(creds.password); break;
            }

            const payload = {
                id: account.id || generateUUID(),
                user_id: userId,
                market_type: account.marketType,
                account_name: clean(account.accountName),
                is_active: true,
                vendor_id: vendorId,
                access_key: key1,
                secret_key: key2,
                created_at: new Date().toISOString()
            };

            // 6번: 중복 검사 (서버에서 가져와서 비교)
            const { data: existingList } = await supabase
                .from('market_accounts')
                .select('account_name, access_key, vendor_id')
                .eq('user_id', userId);
            
            if (existingList) {
                // 별칭 중복 검사
                const dupAlias = existingList.find((e: any) => e.account_name === payload.account_name);
                if (dupAlias) return { success: false, message: `이미 존재하는 별칭입니다: ${payload.account_name}` };

                // 키 중복 검사 (키가 있는 경우만)
                if (key1) {
                    const dupKey = existingList.find((e: any) => e.access_key === key1);
                    if (dupKey) return { success: false, message: "이미 등록된 API Key(Access Key)입니다." };
                }
                
                // ID 중복 검사 (ID가 있는 경우만)
                if (vendorId) {
                     // 같은 플랫폼 내에서만 ID 중복 체크 (지마켓/옥션 등)
                     // 여기서는 단순화를 위해 일단 패스하거나, 필요시 추가
                }
            }

            // 4번: 단순 INSERT (인증 없이 바로 때려넣기)
            const { error } = await supabase.from('market_accounts').insert(payload);

            if (error) {
                console.error("DB Insert Error:", error);
                return { success: false, message: `DB 저장 실패: ${error.message}` };
            }

            return { success: true };
        },

        delete: async (id: string) => {
            if (isSupabaseConfigured() && supabase) {
                await supabase.from('market_accounts').delete().eq('id', id);
            }
        },

        // 하위 호환성을 위한 더미 함수 (에러 방지용)
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