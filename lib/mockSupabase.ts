import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  MARKET_ACCOUNTS: 'po_market_accounts',
  ORDERS: 'po_orders' 
};

// [회로 차단기] 에러가 발생하면 true로 변경되어 더 이상 DB를 호출하지 않음
let isOfflineMode = false;

// UUID 생성 헬퍼 (로컬 환경용)
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

// Snake Case 변환 (DB Insert용)
const toSnakeCase = (obj: any): any => {
    if (obj !== null && obj.constructor === Object) {
        return Object.keys(obj).reduce((result, key) => {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            result[snakeKey] = obj[key];
            return result;
        }, {} as any);
    }
    return obj;
};

export const mockSupabase = {
  getConnectionStatus: () => isOfflineMode ? 'DISCONNECTED' : 'CONNECTED',

  auth: {
    signUp: async (email: string, password: string, name: string): Promise<{ user: User | null, error: string | null }> => {
      // 오프라인 모드가 아니고 설정이 되어있을 때만 시도
      if (!isOfflineMode && isSupabaseConfigured() && supabase) {
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
          if (!authData.user) throw new Error("회원가입 실패");

          const now = new Date();
          const trialEndsAt = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString();
          const user: User = {
            id: authData.user.id,
            email,
            name,
            role: 'USER',
            plan: 'FREE',
            joinedAt: now.toISOString(),
            trialEndsAt: trialEndsAt,
            isVerified: false
          };
          return { user, error: null };
        } catch (e: any) { 
            console.warn("Auth Error (Switching to Local):", e.message);
            isOfflineMode = true; // 에러 발생 시 오프라인 모드 전환
        }
      }

      // Mock Mode (Local)
      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
      if (users.find(u => u.email === email)) return { user: null, error: "이미 존재하는 이메일입니다." };

      const now = new Date();
      // [중요] 로컬 유저도 UUID 포맷을 사용하여 DB 호환성 유지
      const newUser: User = {
        id: generateUUID(),
        email,
        name,
        role: email.includes('admin') ? 'ADMIN' : 'USER',
        plan: 'FREE',
        joinedAt: now.toISOString(),
        trialEndsAt: new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString(),
        isVerified: false 
      };
      users.push(newUser);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(newUser));
      return { user: newUser, error: null };
    },

    signIn: async (email: string, password: string): Promise<{ user: User | null, error: string | null }> => {
      if (!isOfflineMode && isSupabaseConfigured() && supabase) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
          if (authError) throw authError;
          if (!authData.user) throw new Error("로그인 실패");

          const { data: dbUser, error: dbError } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
          if (dbError) throw dbError;

          const user: User = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role as UserRole,
            plan: dbUser.plan as PlanType,
            joinedAt: dbUser.joined_at,
            trialEndsAt: dbUser.trial_ends_at,
            subscriptionEndsAt: dbUser.subscription_ends_at,
            isVerified: true
          };
          return { user, error: null };
        } catch (e: any) { 
            console.warn("Login Error (Switching to Local):", e.message);
            // 로그인 실패는 네트워크 오류가 아닐 수 있으므로 모드 전환은 신중하게
        }
      }

      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
      const user = users.find(u => u.email === email);
      if (!user) return { user: null, error: "사용자를 찾을 수 없습니다. (데모 계정: admin@test.com / 12341234)" };
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
      return { user, error: null };
    },

    resendEmail: async (email: string): Promise<string | null> => {
        if (!isOfflineMode && isSupabaseConfigured() && supabase) {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
                options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined }
            });
            return error ? error.message : null;
        }
        return "오프라인 모드입니다.";
    },

    signOut: async () => {
      if (!isOfflineMode && isSupabaseConfigured() && supabase) await supabase.auth.signOut();
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
        if (!isOfflineMode && isSupabaseConfigured() && supabase) {
            try {
                const snakeUpdates = toSnakeCase(updates);
                await supabase.from('users').update(snakeUpdates).eq('id', userId);
            } catch (e) { isOfflineMode = true; }
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
        if (!isOfflineMode && isSupabaseConfigured() && supabase) {
            try {
                const { data, error } = await supabase.from('users').select('*');
                if (error) throw error;
                if (data) return toCamelCase(data);
            } catch (e) { isOfflineMode = true; }
        }
        const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
        return usersStr ? JSON.parse(usersStr) : [];
      }
    },
    markets: {
        save: async (account: MarketAccount): Promise<{ success: boolean; mode: 'DB' | 'LOCAL'; message?: string }> => {
            // 1. 항상 로컬 스토리지에 먼저 저장 (안전장치)
            const allStr = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            let all: MarketAccount[] = allStr ? JSON.parse(allStr) : [];
            const existingIndex = all.findIndex(a => a.id === account.id || a.accountName === account.accountName);
            if (existingIndex >= 0) { all[existingIndex] = account; } else { all.push(account); }
            localStorage.setItem(STORAGE_KEYS.MARKET_ACCOUNTS, JSON.stringify(all));

            // 2. 오프라인 모드이거나 Supabase 설정이 없으면 종료
            if (isOfflineMode || !isSupabaseConfigured() || !supabase) {
                return { success: true, mode: 'LOCAL', message: '오프라인 모드: 브라우저에 저장되었습니다.' };
            }

            // 3. DB 저장 시도
            try {
                // 실제 유저 ID 확인 (Supabase Auth > Local Session)
                let userId = null;
                const { data: { user } } = await supabase.auth.getUser();
                
                if (user) {
                    userId = user.id;
                } else {
                    const sessionStr = localStorage.getItem(STORAGE_KEYS.SESSION);
                    const localUser = sessionStr ? JSON.parse(sessionStr) : null;
                    // 로컬 유저도 DB에 저장 시도 (위에서 SQL로 user_id를 text로 풀었으므로 가능)
                    if (localUser) userId = localUser.id; 
                }

                if (!userId) return { success: true, mode: 'LOCAL', message: '로그인 정보를 찾을 수 없어 브라우저에 저장했습니다.' };

                const payload = {
                    user_id: userId,
                    market_type: account.marketType,
                    account_name: account.accountName,
                    is_active: account.isActive,
                    vendor_id: account.credentials['vendorId'] || account.credentials['username'] || '',
                    access_key: account.credentials['accessKey'] || account.credentials['apiKey'] || account.credentials['clientId'] || '',
                    secret_key: account.credentials['secretKey'] || account.credentials['clientSecret'] || account.credentials['password'] || ''
                };

                const { error } = await supabase.from('market_accounts').insert(payload);

                if (error) {
                    console.warn("DB Save Failed:", error);
                    // 401(Unauthorized)나 RLS 정책 위반인 경우 오프라인 모드로 전환하지 않고 메시지만 반환
                    // 500번대 에러인 경우에만 오프라인 모드 전환 고려
                    return { 
                        success: true, 
                        mode: 'LOCAL', 
                        message: `DB 저장 실패(${error.code}): 브라우저에는 안전하게 저장되었습니다.` 
                    };
                }
                
                return { success: true, mode: 'DB' };

            } catch (e: any) {
                console.warn("Network/Logic Error:", e);
                return { success: true, mode: 'LOCAL', message: '오류가 발생하여 브라우저에 저장했습니다.' };
            }
        },
        delete: async (id: string) => {
            if (!isOfflineMode && isSupabaseConfigured() && supabase) {
                try { await supabase.from('market_accounts').delete().eq('id', id); } 
                catch(e) { /* Ignore delete errors */ }
            }
            const allStr = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            let all: MarketAccount[] = allStr ? JSON.parse(allStr) : [];
            all = all.filter(m => m.id !== id);
            localStorage.setItem(STORAGE_KEYS.MARKET_ACCOUNTS, JSON.stringify(all));
        },
        get: async (): Promise<MarketAccount[]> => {
            let dbAccounts: MarketAccount[] = [];
            
            if (!isOfflineMode && isSupabaseConfigured() && supabase) {
                try {
                    const { data, error } = await supabase.from('market_accounts').select('*');
                    if (error) throw error;
                    if (data) {
                        dbAccounts = data.map((item: any) => ({
                            id: item.id,
                            marketType: item.market_type,
                            accountName: item.account_name,
                            isActive: item.is_active,
                            createdAt: item.created_at,
                            credentials: {
                                vendorId: item.vendor_id || '',
                                accessKey: item.access_key || '',
                                secretKey: item.secret_key || '',
                                apiKey: item.access_key,
                                clientId: item.access_key,
                                clientSecret: item.secret_key,
                                username: item.vendor_id,
                                password: item.secret_key,
                            }
                        }));
                    }
                } catch (e) {
                    // 읽기 실패 시 조용히 넘어가고 로컬 데이터만 보여줌
                    console.warn("DB Fetch Error:", e);
                }
            }

            const localStr = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            const localAccounts: MarketAccount[] = localStr ? JSON.parse(localStr) : [];

            // Merge: DB 데이터를 우선하되, 로컬에만 있는 데이터도 보여줌
            const merged = [...dbAccounts];
            localAccounts.forEach(localAcc => {
                if (!merged.find(dbAcc => dbAcc.id === localAcc.id || dbAcc.accountName === localAcc.accountName)) {
                    merged.push(localAcc);
                }
            });

            return merged;
        }
    },
    orders: {
        init: () => {
            if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
            }
        },
        getAll: async (): Promise<Order[]> => {
            if (!isOfflineMode && isSupabaseConfigured() && supabase) {
                try {
                    const { data, error } = await supabase.from('orders').select('*');
                    if (error) throw error;
                    if (data) {
                        return data.map(item => ({
                            ...toCamelCase(item),
                            id: String(item.id),
                            status: item.status || 'NEW',
                            platform: item.platform || 'NAVER',
                        })) as Order[];
                    }
                } catch (e) { isOfflineMode = true; }
            }

            const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
            if (!str) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
                return MOCK_ORDERS;
            }
            return JSON.parse(str);
        },
        updateStatus: async (orderIds: string[], newStatus: OrderStatus) => {
            if (!isOfflineMode && isSupabaseConfigured() && supabase) {
                try { await supabase.from('orders').update({ status: newStatus }).in('id', orderIds); }
                catch(e) { isOfflineMode = true; }
            }
            const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
            let orders: Order[] = str ? JSON.parse(str) : MOCK_ORDERS;
            orders = orders.map(order => orderIds.includes(order.id) ? { ...order, status: newStatus } : order);
            localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
        }
    }
  }
};

mockSupabase.db.orders.init();