import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Platform, MarketAccount } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { supabase, saveSupabaseConfig, clearSupabaseConfig, isSupabaseConfigured } from '../lib/supabase';
import { Check, Loader2, Plus, Trash2, AlertCircle, Database, Server, Save, X, Key, Store, RefreshCw, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MarketInfo {
    platform: Platform;
    name: string;
    authType: 'LOGIN' | 'API';
    color: string;
    description: string;
    fields: { key: string, label: string, type?: string, placeholder?: string }[];
}

const MARKETS: MarketInfo[] = [
    { 
        platform: 'NAVER', 
        name: '네이버 스마트스토어', 
        authType: 'API', 
        color: 'bg-green-500', 
        description: '네이버 커머스 API 센터에서 애플리케이션 등록 후 ID/Secret을 발급받으세요.',
        fields: [
            { key: 'clientId', label: '애플리케이션 ID (Client ID)', placeholder: 'API 센터에서 복사한 Client ID' },
            { key: 'clientSecret', label: '애플리케이션 시크릿 (Client Secret)', type: 'password', placeholder: 'API 센터에서 복사한 Secret' }
        ]
    },
    { 
        platform: 'COUPANG', 
        name: '쿠팡 윙', 
        authType: 'API', 
        color: 'bg-red-500', 
        description: '쿠팡 Wing 판매자 센터 > 판매자 정보 > 추가판매정보 > 오픈API 키 발급에서 확인하세요.',
        fields: [
            { key: 'vendorId', label: '업체 코드 (Vendor ID)', placeholder: 'A00...' },
            { key: 'accessKey', label: 'Access Key', placeholder: '쿠팡 API Access Key' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: '쿠팡 API Secret Key' },
        ]
    },
    { 
        platform: '11ST', 
        name: '11번가', 
        authType: 'API', 
        color: 'bg-red-600', 
        description: '11번가 오픈 API 센터(셀러 오피스)에서 API Key를 발급받으세요.',
        fields: [
            { key: 'apiKey', label: 'Open API Key', placeholder: '11번가 API Key' }
        ]
    },
    { 
        platform: 'GMARKET', 
        name: '지마켓', 
        authType: 'LOGIN', 
        color: 'bg-emerald-600', 
        description: 'ESM PLUS 아이디와 비밀번호로 연동합니다.',
        fields: [
            { key: 'username', label: 'ESM Master ID', placeholder: 'ESM 아이디' },
            { key: 'password', label: '비밀번호', type: 'password', placeholder: '비밀번호' }
        ]
    },
    { 
        platform: 'AUCTION', 
        name: '옥션', 
        authType: 'LOGIN', 
        color: 'bg-red-400', 
        description: 'ESM PLUS 아이디와 비밀번호로 연동합니다.',
        fields: [
            { key: 'username', label: 'ESM Master ID', placeholder: 'ESM 아이디' },
            { key: 'password', label: '비밀번호', type: 'password', placeholder: '비밀번호' }
        ]
    },
];

const Integration = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<string>('MARKET'); // MARKET | DATABASE
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>('NAVER');
    const [myAccounts, setMyAccounts] = useState<MarketAccount[]>([]);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [formAlias, setFormAlias] = useState('');
    const [formCredentials, setFormCredentials] = useState<Record<string, string>>({});

    // DB Settings
    const [dbUrl, setDbUrl] = useState(localStorage.getItem('sb_url') || '');
    const [dbKey, setDbKey] = useState(localStorage.getItem('sb_key') || '');
    const [isDbConnected, setIsDbConnected] = useState(isSupabaseConfigured());
    const [dbAuthUser, setDbAuthUser] = useState<any>(null);

    useEffect(() => {
        loadAccounts();
        checkDbAuth();
    }, []);

    const checkDbAuth = async () => {
        if (supabase) {
            const { data } = await supabase.auth.getUser();
            setDbAuthUser(data.user);
        }
    };

    const loadAccounts = async () => {
        try {
            const accounts = await mockSupabase.db.markets.get();
            setMyAccounts(accounts);
        } catch (e) {
            console.error("Failed to load accounts:", e);
        }
    }

    const openAddModal = () => {
        setFormAlias('');
        setFormCredentials({});
        setIsModalOpen(true);
    };

    const handleCredentialChange = (key: string, value: string) => {
        setFormCredentials(prev => ({ ...prev, [key]: value }));
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);
        if (!formAlias) return alert("계정 별칭을 입력해주세요.");
        for (const field of currentMarket!.fields) {
            if (!formCredentials[field.key]) return alert(`${field.label}을(를) 입력해주세요.`);
        }

        setModalLoading(true);

        try {
            const newAccount = {
                id: Math.random().toString(36).substr(2, 9), 
                marketType: selectedPlatform,
                accountName: formAlias,
                credentials: formCredentials, 
                isActive: true
            };
            
            // 저장 호출
            const result = await mockSupabase.db.markets.save(newAccount);
            
            await loadAccounts();
            setIsModalOpen(false);
            
            if (result.mode === 'LOCAL') {
                if (isDbConnected && !dbAuthUser) {
                    alert(`[주의] DB 연결은 되어있으나, Supabase 로그인이 되어있지 않습니다.\n\n로컬 데모 계정은 DB에 저장할 수 없어 브라우저에만 저장되었습니다.\n실제 DB 저장을 원하시면 로그아웃 후 '회원가입'을 통해 Supabase 계정을 생성하세요.`);
                } else {
                    alert(`[알림] ${result.message}\n계정 정보는 브라우저에 안전하게 저장되었습니다.`);
                }
            } else {
                alert("✅ DB에 성공적으로 저장되었습니다!");
            }

        } catch (error: any) {
            console.error("🔥 Error:", error);
            alert(`오류가 발생했습니다: ${error.message}`);
        } finally {
            setModalLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('정말 이 계정을 삭제하시겠습니까?')) {
            await mockSupabase.db.markets.delete(id);
            await loadAccounts();
        }
    };

    const handleSaveDb = (e: React.FormEvent) => {
        e.preventDefault();
        if (!dbUrl || !dbKey) return alert("URL과 API Key를 모두 입력해주세요.");
        if (confirm("설정을 저장하고 페이지를 새로고침 하시겠습니까?")) {
            saveSupabaseConfig(dbUrl, dbKey);
        }
    }

    const handleDisconnectDb = () => {
        if (confirm("DB 연결 정보를 삭제하시겠습니까?")) {
            clearSupabaseConfig();
        }
    }

    const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);
    const accountsForCurrentPlatform = myAccounts.filter(m => m.marketType === selectedPlatform);

    return (
        <Layout title="시스템 연동 관리">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full min-h-[600px]">
                {/* Left: Navigation Sidebar */}
                <div className="col-span-1 space-y-6">
                    <div>
                        <h4 className="px-4 text-xs font-bold text-slate-400 uppercase mb-3">마켓 선택</h4>
                        <div className="space-y-1">
                            {MARKETS.map((market) => {
                                const count = myAccounts.filter(m => m.marketType === market.platform).length;
                                return (
                                    <button
                                        key={market.platform}
                                        onClick={() => {
                                            setActiveTab('MARKET');
                                            setSelectedPlatform(market.platform);
                                            setIsModalOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                            activeTab === 'MARKET' && selectedPlatform === market.platform 
                                            ? 'bg-white border-primary-500 text-primary-700 font-bold shadow-sm ring-1 ring-primary-100' 
                                            : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`size-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shadow-sm ${market.color}`}>
                                                {market.platform[0]}
                                            </div>
                                            <span className="text-sm">{market.name}</span>
                                        </div>
                                        {count > 0 && (
                                            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                        <h4 className="px-4 text-xs font-bold text-slate-400 uppercase mb-3">시스템 설정</h4>
                         <button
                            onClick={() => setActiveTab('DATABASE')}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                activeTab === 'DATABASE' 
                                ? 'bg-slate-800 border-slate-900 text-white font-bold shadow-md' 
                                : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600'
                            }`}
                        >
                            <Database size={20} />
                            <span className="text-sm">DB 연결 설정</span>
                             {isDbConnected && <div className="ml-auto size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>}
                        </button>
                    </div>
                </div>

                {/* Right: Content Area */}
                <div className="col-span-1 md:col-span-3">
                    {activeTab === 'DATABASE' ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm animate-fade-in">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="p-3 bg-slate-100 rounded-2xl text-slate-600">
                                    <Server size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Supabase 데이터베이스 연결</h3>
                                    <p className="text-slate-500 text-sm mt-1">실제 주문 데이터를 관리하기 위해 Supabase 프로젝트와 연결합니다.</p>
                                </div>
                            </div>

                            {/* Status Panel */}
                            {isDbConnected ? (
                                <div className="bg-green-50 border border-green-100 rounded-2xl p-6 mb-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-green-500 text-white p-1.5 rounded-full"><Check size={16}/></div>
                                            <span className="font-bold text-green-800">DB 연결 성공</span>
                                        </div>
                                        <button onClick={handleDisconnectDb} className="text-xs text-green-600 hover:text-green-800 underline">연결 해제</button>
                                    </div>
                                    
                                    <div className="bg-white/60 rounded-xl p-4 text-sm space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Project URL</span>
                                            <span className="font-mono text-slate-700">{dbUrl.split('.')[0]}...</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-slate-500">인증 상태</span>
                                            {dbAuthUser ? (
                                                <span className="text-green-600 font-bold flex items-center gap-1">
                                                    <Check size={12}/> 인증됨 ({dbAuthUser.email})
                                                </span>
                                            ) : (
                                                <span className="text-amber-600 font-bold flex items-center gap-1">
                                                    <AlertCircle size={12}/> 미인증 (Guest)
                                                </span>
                                            )}
                                        </div>
                                        {!dbAuthUser && (
                                            <div className="mt-2 text-xs text-amber-700 bg-amber-100/50 p-2 rounded">
                                                주의: 현재 로컬 데모 계정으로 로그인되어 있습니다.<br/>DB에 데이터를 저장하려면 Supabase에 등록된 계정으로 로그인해야 합니다.
                                                <button onClick={() => { mockSupabase.auth.signOut(); navigate('/login'); }} className="ml-2 underline font-bold">로그인 하러 가기</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex items-start gap-4 mb-8">
                                    <AlertCircle size={24} className="text-slate-400 shrink-0 mt-1"/>
                                    <div>
                                        <p className="font-bold text-slate-700">연결되지 않음</p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            URL과 API Key를 입력하여 연결하세요.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSaveDb} className="space-y-6 max-w-2xl">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Project URL</label>
                                    <input 
                                        type="text" 
                                        value={dbUrl}
                                        onChange={(e) => setDbUrl(e.target.value)}
                                        className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50 transition-all" 
                                        placeholder="https://your-project-id.supabase.co"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">API Key (anon/public)</label>
                                    <input 
                                        type="password" 
                                        value={dbKey}
                                        onChange={(e) => setDbKey(e.target.value)}
                                        className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50 transition-all" 
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        required
                                    />
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <button 
                                        type="submit"
                                        className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-xl shadow-slate-200"
                                    >
                                        <Save size={18} /> 설정 저장 및 연결
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            {/* Market Header */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-start justify-between">
                                <div className="flex items-center gap-5">
                                    <div className={`size-16 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg ${currentMarket?.color}`}>
                                        {currentMarket?.platform[0]}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold text-slate-900">{currentMarket?.name}</h3>
                                        <p className="text-slate-500 text-sm mt-1 max-w-lg leading-relaxed">{currentMarket?.description}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={openAddModal}
                                    className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-slate-200 transition-all active:scale-95"
                                >
                                    <Plus size={18} /> 계정 추가
                                </button>
                            </div>

                            {/* Connected Accounts List */}
                            <div className="grid grid-cols-1 gap-4">
                                {accountsForCurrentPlatform.length === 0 ? (
                                    <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                                        <Store className="mx-auto text-slate-300 mb-4" size={48} />
                                        <p className="text-slate-500 font-medium">연동된 {currentMarket?.name} 계정이 없습니다.</p>
                                        <p className="text-slate-400 text-sm mt-1">우측 상단 버튼을 눌러 계정을 추가하세요.</p>
                                    </div>
                                ) : (
                                    accountsForCurrentPlatform.map((acc) => (
                                        <div key={acc.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex justify-between items-center group hover:border-primary-200 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-slate-100 p-3 rounded-xl text-slate-500">
                                                    <Store size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                        {acc.accountName}
                                                        {acc.isActive && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full">Active</span>}
                                                    </h4>
                                                    <div className="flex items-center gap-4 mt-1">
                                                        <p className="text-xs text-slate-400 font-mono">ID: {acc.id.substring(0, 8)}...</p>
                                                        {Object.keys(acc.credentials).slice(0, 1).map(key => (
                                                            <p key={key} className="text-xs text-slate-400 font-mono flex items-center gap-1">
                                                                <Key size={10} /> {key}: {acc.credentials[key].substring(0, 4)}****
                                                            </p>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => handleDelete(acc.id)}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="연동 해제"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Account Modal */}
            {isModalOpen && currentMarket && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <span className={`size-3 rounded-full ${currentMarket.color}`}></span>
                                {currentMarket.name} 계정 추가
                            </h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleAddAccount} className="p-8 space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                    계정 별칭 <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="text" 
                                    value={formAlias}
                                    onChange={(e) => setFormAlias(e.target.value)}
                                    placeholder="예: 강남 1호점, 본사 직영점"
                                    className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none text-sm transition-all"
                                    autoFocus
                                />
                                <p className="text-xs text-slate-400">관리 목적의 이름입니다. 편하게 정해주세요.</p>
                            </div>

                            <div className="border-t border-slate-100 my-4"></div>

                            {currentMarket.fields.map((field) => (
                                <div key={field.key} className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                        {field.label} <span className="text-red-500">*</span>
                                    </label>
                                    <input 
                                        type={field.type || 'text'}
                                        value={formCredentials[field.key] || ''}
                                        onChange={(e) => handleCredentialChange(field.key, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50 transition-all"
                                    />
                                </div>
                            ))}

                            <div className="pt-6">
                                <button 
                                    type="submit" 
                                    disabled={modalLoading}
                                    className="w-full bg-slate-900 text-white h-12 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                                >
                                    {modalLoading ? <Loader2 className="animate-spin" /> : '연동 정보 저장'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default Integration;