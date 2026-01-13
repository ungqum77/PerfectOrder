import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  MARKET_ACCOUNTS: 'po_market_accounts', // 키 변경
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
    // 변경된 marketAccounts 로직
    markets: {
        save: async (account: MarketAccount) => {
            if (isSupabaseConfigured() && supabase) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.from('market_accounts').insert({
                        user_id: user.id,
                        market_type: account.marketType,
                        account_name: account.accountName,
                        credentials: account.credentials,
                        is_active: account.isActive
                    });
                }
                return;
            }

            // Local Mock
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
                const { data } = await supabase.from('market_accounts').select('*');
                if (data) return toCamelCase(data); // DB snake_case -> app camelCase
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
