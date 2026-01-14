import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
import { MOCK_ORDERS } from '../constants';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  USERS: 'po_users',
  SESSION: 'po_session',
  ORDERS: 'po_orders',
  PENDING_MARKETS: 'po_pending_markets' // [NEW] 오프라인 대기열 키
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
    
    // [핵심 변경] 마켓 계정: 저장 실패 시 로컬 대기열로 이동
    markets: {
        save: async (account: MarketAccount): Promise<{ success: boolean; mode: 'DB' | 'LOCAL' | 'OFFLINE_QUEUE'; message?: string }> => {
            // 1. 유저 ID 식별
            let userId = null;
            if (isSupabaseConfigured() && supabase) {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
            }
            if (!userId) {
                const sessionStr = localStorage.getItem(STORAGE_KEYS.SESSION);
                const localUser = sessionStr ? JSON.parse(sessionStr) : null;
                if (localUser) userId = localUser.id;
            }

            // 2. 페이로드 구성 (DB용)
            const creds = account.credentials;
            // 매핑 로직 유지
            let vendorId = creds.vendorId || creds.username || '';
            let accessKey = creds.accessKey || creds.apiKey || creds.clientId || '';
            let secretKey = creds.secretKey || creds.clientSecret || creds.password || '';

            switch (account.marketType) {
                case 'NAVER': accessKey = creds.clientId || ''; secretKey = creds.clientSecret || ''; break;
                case 'COUPANG': vendorId = creds.vendorId || ''; accessKey = creds.accessKey || ''; secretKey = creds.secretKey || ''; break;
                case '11ST': accessKey = creds.apiKey || ''; break;
                case 'GMARKET': case 'AUCTION': vendorId = creds.username || ''; secretKey = creds.password || ''; break;
            }

            const payload: any = {
                id: account.id || generateUUID(), // ID가 없으면 미리 생성
                user_id: userId,
                market_type: account.marketType,
                account_name: account.accountName,
                is_active: account.isActive,
                vendor_id: vendorId,     
                access_key: accessKey,   
                secret_key: secretKey,
                created_at: new Date().toISOString()
            };

            // 3. DB 저장 시도 (타임아웃 적용)
            try {
                if (isSupabaseConfigured() && supabase && userId) {
                    const dbPromise = (async () => {
                         // 이미 존재하는 ID면 Update, 아니면 Insert
                         const { data: existing } = await supabase.from('market_accounts').select('id').eq('id', payload.id).maybeSingle();
                         
                         if (existing) {
                             return await supabase.from('market_accounts').update(payload).eq('id', payload.id);
                         } else {
                             return await supabase.from('market_accounts').insert(payload);
                         }
                    })();

                    // 4초 타임아웃: 4초 안에 DB 응답 없으면 바로 로컬 저장으로 넘어감
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 4000));
                    
                    const { error }: any = await Promise.race([dbPromise, timeoutPromise]);

                    if (error) throw error;
                    return { success: true, mode: 'DB' };
                } else {
                    throw new Error("NO_DB_CONNECTION");
                }

            } catch (e: any) {
                console.warn("⚠️ DB Save Failed or Timeout. Saving to Offline Queue.", e.message);
                
                // [OFFLINE FALLBACK] 실패 시 로컬 대기열에 저장
                const pendingList = getLocalData<any>(STORAGE_KEYS.PENDING_MARKETS);
                
                // 기존 대기열에 같은 ID가 있으면 업데이트, 없으면 추가
                const idx = pendingList.findIndex((item: any) => item.id === payload.id);
                if (idx >= 0) pendingList[idx] = payload;
                else pendingList.push(payload);
                
                setLocalData(STORAGE_KEYS.PENDING_MARKETS, pendingList);

                return { 
                    success: true, 
                    mode: 'OFFLINE_QUEUE', 
                    message: '서버 응답이 늦어 로컬에 우선 저장되었습니다. 연결 시 자동 동기화됩니다.' 
                };
            }
        },
        
        delete: async (id: string) => {
            // 1. DB 삭제 시도
            if (isSupabaseConfigured() && supabase) {
                await supabase.from('market_accounts').delete().eq('id', id);
            }
            // 2. 로컬 대기열에서도 삭제
            const pendingList = getLocalData<any>(STORAGE_KEYS.PENDING_MARKETS);
            const newList = pendingList.filter(item => item.id !== id);
            setLocalData(STORAGE_KEYS.PENDING_MARKETS, newList);
        },

        get: async (): Promise<MarketAccount[]> => {
            let dbData: any[] = [];

            // 1. DB 데이터 가져오기
            if (isSupabaseConfigured() && supabase) {
                try {
                    let userId = null;
                    const { data: { user } } = await supabase.auth.getUser();
                    userId = user?.id;

                    // 로그인 안되어 있으면 로컬 세션 확인
                    if (!userId) {
                         const session = mockSupabase.auth.getSession();
                         if (session) userId = session.id;
                    }

                    if (userId) {
                        const { data, error } = await supabase.from('market_accounts').select('*').eq('user_id', userId);
                        if (!error && data) dbData = data;
                    }
                } catch (e) {
                    console.warn("DB Fetch Failed, using local data only.");
                }
            }

            // 2. 로컬 대기열(Pending) 데이터 가져오기
            const pendingList = getLocalData<any>(STORAGE_KEYS.PENDING_MARKETS);

            // 3. 병합 (로컬 대기열이 최신일 수 있으므로 ID가 겹치면 로컬 우선)
            // DB 데이터 맵핑
            const mappedDbData = dbData.map((item: any) => ({
                id: item.id,
                marketType: item.market_type,
                accountName: item.account_name,
                isActive: item.is_active,
                createdAt: item.created_at,
                credentials: {
                    vendorId: item.vendor_id || '',
                    accessKey: item.access_key || '',
                    secretKey: item.secret_key || '',
                    clientId: item.access_key, 
                    clientSecret: item.secret_key, 
                    apiKey: item.access_key,
                    username: item.vendor_id, 
                    password: item.secret_key, 
                },
                _source: 'DB' // 디버깅용 태그
            }));

            // 로컬 데이터 맵핑
            const mappedPendingData = pendingList.map((item: any) => ({
                id: item.id,
                marketType: item.market_type,
                accountName: item.account_name,
                isActive: item.is_active,
                createdAt: item.created_at,
                credentials: {
                    vendorId: item.vendor_id || '',
                    accessKey: item.access_key || '',
                    secretKey: item.secret_key || '',
                    clientId: item.access_key,
                    clientSecret: item.secret_key,
                    apiKey: item.access_key,
                    username: item.vendor_id,
                    password: item.secret_key,
                },
                _source: 'LOCAL_PENDING' // 디버깅용 태그
            }));

            // ID 기준으로 병합 (pending이 덮어씀)
            const mergedMap = new Map();
            mappedDbData.forEach((item: any) => mergedMap.set(item.id, item));
            mappedPendingData.forEach((item: any) => mergedMap.set(item.id, item));

            return Array.from(mergedMap.values());
        },

        // [NEW] 대기열 처리 함수 (Sync Process)
        syncPendingItems: async (): Promise<number> => {
            if (!isSupabaseConfigured() || !supabase) return 0;
            
            const pendingList = getLocalData<any>(STORAGE_KEYS.PENDING_MARKETS);
            if (pendingList.length === 0) return 0;

            console.log(`🔄 Syncing ${pendingList.length} pending items...`);
            
            let successCount = 0;
            const remainingList = [];

            for (const item of pendingList) {
                try {
                    // user_id가 누락되었을 경우 현재 유저로 보정
                    if (!item.user_id) {
                         const { data: { user } } = await supabase.auth.getUser();
                         if (user) item.user_id = user.id;
                         else throw new Error("No User ID");
                    }

                    // Upsert (Insert or Update)
                    const { error } = await supabase.from('market_accounts').upsert(item);
                    
                    if (error) throw error;
                    successCount++;
                } catch (e) {
                    console.error("Sync Item Failed:", e);
                    remainingList.push(item); // 실패하면 남겨둠
                }
            }

            setLocalData(STORAGE_KEYS.PENDING_MARKETS, remainingList);
            return successCount;
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