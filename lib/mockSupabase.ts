import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  // MARKET_ACCOUNTS 키는 더 이상 사용하지 않음 (DB 강제)
  ORDERS: 'po_orders' 
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

// 로컬 스토리지에 유저 저장 헬퍼 (백업용)
const saveLocalUser = (user: User) => {
    const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
    const users: User[] = usersStr ? JSON.parse(usersStr) : [];
    
    const existingIndex = users.findIndex(u => u.email === user.email);
    if (existingIndex >= 0) {
        users[existingIndex] = user;
    } else {
        users.push(user);
    }
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
};

export const mockSupabase = {
  getConnectionStatus: () => isSupabaseConfigured() ? 'CONNECTED' : 'DISCONNECTED',

  auth: {
    signUp: async (email: string, password: string, name: string): Promise<{ user: User | null, error: string | null }> => {
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString();
      const localId = generateUUID(); 

      // 1. Supabase 회원가입 시도
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

      // 2. Mock Fallback
      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
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

      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
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
            const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
            let users: User[] = usersStr ? JSON.parse(usersStr) : [];
            users = users.map(u => u.id === userId ? { ...u, ...updates } : u);
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
            
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
            const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
            return usersStr ? JSON.parse(usersStr) : [];
        }
    },
    
    // [핵심 변경] 마켓 계정: 무조건 DB 저장 & 컬럼 매핑 강화 & Update 지원
    markets: {
        save: async (account: MarketAccount): Promise<{ success: boolean; mode: 'DB' | 'LOCAL'; message?: string }> => {
            
            // 1. DB 연결 확인
            if (!isSupabaseConfigured() || !supabase) {
                return { success: false, mode: 'LOCAL', message: 'DB 연결이 설정되지 않았습니다. Integration 페이지에서 설정을 확인하세요.' };
            }

            // 2. 유저 ID 식별
            let userId = null;
            const { data: { user } } = await supabase.auth.getUser();
            
            if (user) {
                userId = user.id;
            } else {
                // Supabase Auth 세션이 없으면 로컬 스토리지에서 백업용 ID라도 찾음
                const sessionStr = localStorage.getItem(STORAGE_KEYS.SESSION);
                const localUser = sessionStr ? JSON.parse(sessionStr) : null;
                if (localUser) userId = localUser.id;
            }

            if (!userId) {
                return { success: false, mode: 'LOCAL', message: '로그인 정보가 유효하지 않아 DB에 저장할 수 없습니다.' };
            }

            // 3. [핵심] DB 컬럼 매핑 (Mapping Logic)
            // Integration.tsx의 MARKETS 상수 정의에 따라 키값이 다름을 처리
            let vendorId = '';
            let accessKey = '';
            let secretKey = '';
            
            const creds = account.credentials;

            switch (account.marketType) {
                case 'NAVER':
                    // 네이버: Client ID -> access_key, Client Secret -> secret_key
                    accessKey = creds.clientId || '';
                    secretKey = creds.clientSecret || '';
                    break;
                case 'COUPANG':
                    // 쿠팡: Vendor ID -> vendor_id, Access Key -> access_key, Secret Key -> secret_key
                    vendorId = creds.vendorId || '';
                    accessKey = creds.accessKey || '';
                    secretKey = creds.secretKey || '';
                    break;
                case '11ST':
                    // 11번가: API Key -> access_key
                    accessKey = creds.apiKey || '';
                    break;
                case 'GMARKET':
                case 'AUCTION':
                    // 지마켓/옥션: ID -> vendor_id, PW -> secret_key
                    vendorId = creds.username || '';
                    secretKey = creds.password || '';
                    break;
                default:
                    // 기타: 가능한 모든 키 시도
                    vendorId = creds.vendorId || creds.username || '';
                    accessKey = creds.accessKey || creds.apiKey || creds.clientId || '';
                    secretKey = creds.secretKey || creds.clientSecret || creds.password || '';
            }

            try {
                // 4. DB 저장 시도 (Update or Insert)
                const payload: any = {
                    user_id: userId,          // 1. 유저 ID
                    market_type: account.marketType,
                    account_name: account.accountName,
                    is_active: account.isActive,
                    
                    // 2. 매핑된 변수 사용
                    vendor_id: vendorId,     
                    access_key: accessKey,   
                    secret_key: secretKey    
                };

                let error;

                // ID가 존재하고 유효하다면 UPDATE, 아니면 INSERT
                if (account.id && typeof account.id === 'string' && account.id.trim() !== '') {
                     const { error: updateError } = await supabase
                        .from('market_accounts')
                        .update(payload)
                        .eq('id', account.id);
                     error = updateError;
                } else {
                     const { error: insertError } = await supabase
                        .from('market_accounts')
                        .insert(payload);
                     error = insertError;
                }

                // 5. 에러 핸들링
                if (error) {
                    console.error("DB Save Error:", error);
                    return { success: false, mode: 'LOCAL', message: `DB 저장 실패: ${error.message}` };
                }
                
                return { success: true, mode: 'DB' };

            } catch (e: any) {
                console.error("Critical DB Error:", e);
                return { success: false, mode: 'LOCAL', message: `시스템 오류: ${e.message}` };
            }
        },
        
        delete: async (id: string) => {
            if (isSupabaseConfigured() && supabase) {
                await supabase.from('market_accounts').delete().eq('id', id);
            }
        },

        get: async (): Promise<MarketAccount[]> => {
            if (!isSupabaseConfigured() || !supabase) return [];

            try {
                let userId = null;
                const { data: { user } } = await supabase.auth.getUser();
                if (user) userId = user.id;
                else {
                    const sessionStr = localStorage.getItem(STORAGE_KEYS.SESSION);
                    if (sessionStr) userId = JSON.parse(sessionStr).id;
                }

                let query = supabase.from('market_accounts').select('*');
                if (userId) {
                    query = query.eq('user_id', userId);
                }

                const { data, error } = await query;

                if (error) {
                    console.error("DB Fetch Error:", error);
                    return [];
                }

                if (data) {
                    return data.map((item: any) => ({
                        id: item.id,
                        marketType: item.market_type,
                        accountName: item.account_name,
                        isActive: item.is_active,
                        createdAt: item.created_at,
                        credentials: {
                            // 역방향 매핑 (DB -> Frontend)
                            vendorId: item.vendor_id || '',
                            accessKey: item.access_key || '',
                            secretKey: item.secret_key || '',
                            // 컴포넌트 호환성을 위한 별칭(Alias) 제공
                            clientId: item.access_key, 
                            clientSecret: item.secret_key, 
                            apiKey: item.access_key,
                            username: item.vendor_id, 
                            password: item.secret_key, 
                        }
                    }));
                }
                return [];
            } catch (e) {
                console.error("DB Logic Error:", e);
                return [];
            }
        }
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