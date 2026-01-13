import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  MARKET_ACCOUNTS: 'po_market_accounts',
  ORDERS: 'po_orders' 
};

// DB 연결 상태 추적 변수
let connectionStatus: 'UNKNOWN' | 'CONNECTED' | 'DISCONNECTED' = 'UNKNOWN';

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
  getConnectionStatus: () => connectionStatus,

  auth: {
    signUp: async (email: string, password: string, name: string): Promise<{ user: User | null, error: string | null }> => {
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
          if (authError) return { user: null, error: authError.message };
          if (!authData.user) return { user: null, error: "회원가입에 실패했습니다." };

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
        } catch (e: any) { return { user: null, error: e.message }; }
      }

      // Mock Mode
      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
      if (users.find(u => u.email === email)) return { user: null, error: "이미 존재하는 이메일입니다." };

      const now = new Date();
      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
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
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
          if (authError) return { user: null, error: authError.message };
          if (!authData.user) return { user: null, error: "로그인에 실패했습니다." };
          if (!authData.user.email_confirmed_at) return { user: null, error: "이메일 인증이 완료되지 않았습니다." };

          const { data: dbUser, error: dbError } = await supabase.from('users').select('*').eq('id', authData.user.id).single();
          if (dbError || !dbUser) return { user: null, error: "회원 정보가 생성되지 않았습니다." };
          if (dbUser.is_verified === false) await supabase.from('users').update({ is_verified: true }).eq('id', authData.user.id);

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
        } catch (e: any) { return { user: null, error: e.message }; }
      }

      const usersStr = localStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
      const user = users.find(u => u.email === email);
      if (!user) return { user: null, error: "사용자를 찾을 수 없습니다." };
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
        return "Supabase가 연결되지 않았습니다.";
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
            const snakeUpdates = toSnakeCase(updates);
            await supabase.from('users').update(snakeUpdates).eq('id', userId);
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
    markets: {
        save: async (account: MarketAccount) => {
            if (isSupabaseConfigured() && supabase) {
                // 1. 현재 로그인된 사용자 ID 확보 (필수)
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                
                if (authError || !user) {
                    console.error("Auth Error in Save:", authError);
                    throw new Error("로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.");
                }

                // 2. DB 스키마(Snake Case)에 맞춰 엄격하게 매핑
                // credentials 객체는 Record<string, string> 타입이므로 대괄호 표기법 사용
                const payload = {
                    user_id: user.id,
                    market_type: account.marketType,
                    account_name: account.accountName,
                    is_active: account.isActive,
                    
                    // 매핑 로직 (왼쪽: DB 컬럼, 오른쪽: 프론트엔드 값)
                    vendor_id: account.credentials['vendorId'] || account.credentials['username'] || '',
                    access_key: account.credentials['accessKey'] || account.credentials['apiKey'] || account.credentials['clientId'] || '',
                    secret_key: account.credentials['secretKey'] || account.credentials['clientSecret'] || account.credentials['password'] || ''
                };

                console.log("Sending Payload to Supabase:", payload);

                // 3. Insert 실행
                const { error } = await supabase.from('market_accounts').insert(payload);

                if (error) {
                    console.error("Supabase Insert Error Detail:", error);
                    throw new Error(error.message); 
                }
                
                return;
            }

            // Local Mock 저장 로직
            const allStr = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            let all: MarketAccount[] = allStr ? JSON.parse(allStr) : [];
            all.push(account);
            localStorage.setItem(STORAGE_KEYS.MARKET_ACCOUNTS, JSON.stringify(all));
        },
        delete: async (id: string) => {
            if (isSupabaseConfigured() && supabase) {
                await supabase.from('market_accounts').delete().eq('id', id);
                return;
            }

            const allStr = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            let all: MarketAccount[] = allStr ? JSON.parse(allStr) : [];
            all = all.filter(m => m.id !== id);
            localStorage.setItem(STORAGE_KEYS.MARKET_ACCOUNTS, JSON.stringify(all));
        },
        get: async (): Promise<MarketAccount[]> => {
            if (isSupabaseConfigured() && supabase) {
                const { data, error } = await supabase.from('market_accounts').select('*');
                if (error) {
                    console.error("Supabase Select Error:", error);
                    return [];
                }
                
                // DB의 Flat Columns를 앱의 MarketAccount 타입으로 변환
                if (data) {
                    return data.map((item: any) => ({
                        id: item.id,
                        marketType: item.market_type,
                        accountName: item.account_name,
                        isActive: item.is_active,
                        createdAt: item.created_at,
                        // credentials 객체 재구성
                        credentials: {
                            accessKey: item.access_key,
                            apiKey: item.access_key,     // alias
                            clientId: item.access_key,   // alias
                            
                            secretKey: item.secret_key,
                            clientSecret: item.secret_key, // alias
                            password: item.secret_key,     // alias

                            vendorId: item.vendor_id,
                            username: item.vendor_id       // alias
                        }
                    }));
                }
                return [];
            }
            const str = localStorage.getItem(STORAGE_KEYS.MARKET_ACCOUNTS);
            return str ? JSON.parse(str) : [];
        }
    },
    orders: {
        init: () => {
            if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
            }
        },
        getAll: async (): Promise<Order[]> => {
            if (isSupabaseConfigured() && supabase) {
                try {
                    const { data, error } = await supabase.from('orders').select('*');
                    if (error) {
                        connectionStatus = 'DISCONNECTED';
                    } else if (data) {
                        connectionStatus = 'CONNECTED';
                        const convertedData = data.map(item => ({
                            ...toCamelCase(item),
                            id: String(item.id),
                            status: item.status || 'NEW',
                            platform: item.platform || 'NAVER',
                        }));
                        return convertedData as Order[];
                    }
                } catch (e) {
                    connectionStatus = 'DISCONNECTED';
                }
            } else {
                connectionStatus = 'DISCONNECTED';
            }

            const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
            if (!str) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(MOCK_ORDERS));
                return MOCK_ORDERS;
            }
            return JSON.parse(str);
        },
        updateStatus: async (orderIds: string[], newStatus: OrderStatus) => {
            if (isSupabaseConfigured() && supabase) {
                try {
                    await supabase.from('orders').update({ status: newStatus }).in('id', orderIds);
                    connectionStatus = 'CONNECTED';
                } catch(e) { console.error(e); }
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