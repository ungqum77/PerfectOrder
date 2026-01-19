import { User, UserRole, PlanType, MarketAccount, Order, OrderStatus } from '../types';
// MOCK_ORDERS import 제거 (사용하지 않음)
import { supabase, isSupabaseConfigured } from './supabase';
import { marketApi } from './marketApi';

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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
                    } catch (e) { console.error(e); }
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
        // V3: Market Logic
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
                    console.error("DB Fetch Error:", error);
                    return [];
                }

                return data.map((item: any) => ({
                    id: item.id,
                    marketType: item.market_type,
                    accountName: item.account_name,
                    isActive: item.is_active,
                    authMode: item.auth_mode || 'API', // 기본값 API
                    createdAt: item.created_at,
                    credentials: {
                        vendorId: item.vendor_id || '',
                        username: item.vendor_id || '',
                        accessKey: item.access_key || '',
                        clientId: item.access_key || '',
                        apiKey: item.access_key || '',
                        secretKey: item.secret_key || '',
                        clientSecret: item.secret_key || '',
                        password: item.secret_key || '',
                    }
                }));
            },

            saveSimple: async (account: MarketAccount): Promise<{ success: boolean; message?: string }> => {
                if (!isSupabaseConfigured() || !supabase) {
                    return { success: false, message: "DB 클라이언트가 초기화되지 않았습니다. (Code: CLIENT_ERR)" };
                }

                const { data: { user } } = await supabase.auth.getUser();
                let userId = user?.id || mockSupabase.auth.getSession()?.id;

                if (!userId) {
                    const session = await supabase.auth.getSession();
                    userId = session.data.session?.user?.id;
                }

                if (!userId) return { success: false, message: "로그인이 필요합니다." };

                const creds = account.credentials;
                const clean = (value: string) => value ? value.trim() : "";

                const accountName = clean(account.accountName);
                let vendorId = clean(creds.vendorId || creds.username);
                let key1 = clean(creds.accessKey || creds.apiKey || creds.clientId);
                let key2 = clean(creds.secretKey || creds.clientSecret || creds.password);

                // authMode에 따라 저장할 키 필드 조정 (DB 스키마가 허용하는 범위 내에서)
                if (account.authMode === 'LOGIN') {
                    vendorId = clean(creds.username);
                    key2 = clean(creds.password);
                    key1 = 'LOGIN_MODE'; // API Key가 없음을 표시
                } else {
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
                }

                const { data: existingList } = await supabase
                    .from('market_accounts')
                    .select('account_name')
                    .eq('user_id', userId);

                if (existingList) {
                    const dupAlias = existingList.find((e: any) => e.account_name === accountName);
                    if (dupAlias) return { success: false, message: `이미 존재하는 별칭입니다: '${accountName}'` };
                }

                const payload = {
                    id: account.id || generateUUID(),
                    user_id: userId,
                    market_type: account.marketType,
                    account_name: accountName,
                    is_active: true,
                    vendor_id: vendorId,
                    access_key: key1,
                    secret_key: key2,
                    auth_mode: account.authMode || 'API',
                    created_at: new Date().toISOString()
                };

                const { error: insertError } = await supabase.from('market_accounts').insert(payload);

                if (insertError) {
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

            syncPendingItems: async () => 0
        },

        orders: {
            init: () => {
                // [Fix] 초기화를 빈 배열로 설정하여 임의의 Mock 데이터를 사용하지 않음
                if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
                    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
                }
            },
            getAll: async (): Promise<Order[]> => {
                // [Fix] Supabase 연결 시 DB에서 조회
                if (isSupabaseConfigured() && supabase) {
                    const { data } = await supabase
                        .from('orders')
                        .select('*')
                        .order('date', { ascending: false });

                    if (data) {
                        // DB Snake case -> Camel Case 매핑
                        return data.map((row: any) => ({
                            id: row.id,
                            platform: row.platform,
                            orderNumber: row.order_number,
                            productId: row.product_id,
                            productName: row.product_name,
                            option: row.option,
                            amount: row.amount,
                            ordererName: row.orderer_name,
                            ordererPhone: row.orderer_phone,
                            ordererId: row.orderer_id,
                            receiverName: row.receiver_name,
                            receiverPhone: row.receiver_phone,
                            receiverAddress: row.receiver_address,
                            shippingMemo: row.shipping_memo,
                            date: row.date,
                            paymentDate: row.payment_date,
                            status: row.status,
                            courier: row.courier,
                            invoiceNumber: row.invoice_number,
                            customerName: row.orderer_name // 호환성
                        }));
                    }
                }

                // Fallback: LocalStorage
                const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
                if (!str) {
                    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
                    return [];
                }
                return JSON.parse(str);
            },
            updateStatus: async (orderIds: string[], newStatus: OrderStatus) => {
                const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
                let orders: Order[] = str ? JSON.parse(str) : [];
                orders = orders.map(order => orderIds.includes(order.id) ? { ...order, status: newStatus } : order);
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
            },
            // [NEW] 외부 마켓 주문 동기화 함수
            syncExternalOrders: async () => {
                // 1. 등록된 마켓 계정 가져오기
                let accounts = await mockSupabase.db.markets.get();

                if (accounts.length === 0) {
                    alert("연동된 마켓 계정이 없습니다.\n[연동 관리] 메뉴에서 계정을 먼저 추가해주세요.");
                    return 0;
                }

                try {
                    // 2. 외부 API를 통해 주문 수집 (실제 데이터)
                    const newOrders = await marketApi.syncAllMarkets(accounts);

                    // 3. Supabase에 저장 (Upsert)
                    const { count, error } = await marketApi.saveOrdersToSupabase(newOrders);

                    if (error) {
                        throw new Error(`DB 저장 실패: ${error.message}`);
                    }

                    // 4. 로컬 스토리지도 캐싱 차원에서 업데이트 (선택 사항, 여기선 호환성을 위해 유지하되 DB가 Truth)
                    // 만약 DB 기반으로 전면 전환하려면 getAll()도 수정해야 함.
                    // 일단은 로컬 캐시도 최신화
                    const str = localStorage.getItem(STORAGE_KEYS.ORDERS);
                    let currentOrders: Order[] = str ? JSON.parse(str) : [];

                    // 간단 병합 로직 (DB가 Truth이므로 덮어쓰기)
                    const orderMap = new Map(currentOrders.map(o => [o.id, o]));
                    newOrders.forEach(o => orderMap.set(o.id, o));
                    const merged = Array.from(orderMap.values());

                    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(merged));

                    return count; // 저장/업데이트된 건수 반환
                } catch (e: any) {
                    console.error("Sync Error:", e);
                    throw e;
                }
            }
        }
    }
};

mockSupabase.db.orders.init();