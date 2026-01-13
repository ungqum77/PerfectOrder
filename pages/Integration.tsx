import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Platform, MarketAccount } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { saveSupabaseConfig, clearSupabaseConfig, isSupabaseConfigured } from '../lib/supabase';
import { Check, Loader2, Plus, Trash2, AlertCircle, Database, Server, Save, X, Key, Store } from 'lucide-react';

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
            { key: 'accessKey', label: 'Access Key', placeholder: '쿠팡 API Access Key' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: '쿠팡 API Secret Key' },
            { key: 'vendorId', label: '업체 코드 (Vendor ID)', placeholder: 'A00...' }
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

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        const accounts = await mockSupabase.db.markets.get();
        setMyAccounts(accounts);
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
        
        // Validation
        const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);
        if (!formAlias) return alert("계정 별칭을 입력해주세요.");
        for (const field of currentMarket!.fields) {
            if (!formCredentials[field.key]) return alert(`${field.label}을(를) 입력해주세요.`);
        }

        setModalLoading(true);

        try {
            // 디버깅용 로그: 전송하려는 데이터 확인
            const newAccount = {
                id: Math.random().toString(36).substr(2, 9), // DB에서는 무시됨(auto gen)
                marketType: selectedPlatform,
                accountName: formAlias,
                credentials: formCredentials,
                isActive: true
            };
            console.log('🚀 [Integration] Saving Account:', newAccount);

            await mockSupabase.db.markets.save(newAccount);
            
            await loadAccounts();
            setIsModalOpen(false);
            alert("계정이 성공적으로 연동되었습니다.");
        } catch (error: any) {
            console.error("🔥 [Integration] Save Failed:", error);
            alert(`저장에 실패했습니다.\n오류: ${error.message || error}`);
        } finally {
            // 성공하든 실패하든 로딩 상태 해제 (무한 로딩 방지)
            setModalLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('정말 이 계정을 삭제하시겠습니까? 수집된 주문 데이터는 보존되지만 연동이 끊어집니다.')) {
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

                            {isDbConnected ? (
                                <div className="bg-green-50 border border-green-100 rounded-2xl p-6 flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-green-500 text-white p-2 rounded-full shadow-lg shadow-green-200"><Check size={20}/></div>
                                        <div>
                                            <p className="font-bold text-green-800 text-lg">연결됨</p>
                                            <p className="text-sm text-green-600">주문 데이터가 실제 DB와 동기화되고 있습니다.</p>
                                        </div>
                                    </div>
                                    <button onClick={handleDisconnectDb} className="bg-white border border-green-200 text-green-700 px-4 py-2 rounded-xl font-bold hover:bg-green-100 transition-colors shadow-sm">
                                        연결 해제
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 flex items-start gap-4 mb-8">
                                    <AlertCircle size={24} className="text-amber-600 shrink-0 mt-1"/>
                                    <div>
                                        <p className="font-bold text-amber-800">데모 모드 실행 중</p>
                                        <p className="text-sm text-amber-700 leading-relaxed mt-1">
                                            현재 로컬 브라우저 저장소를 사용 중입니다. (새로고침 시 유지)<br/>
                                            팀원과 데이터를 공유하거나 실제 운영을 하려면 Supabase 연결이 필요합니다.
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
