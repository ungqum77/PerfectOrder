import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Platform, MarketAccount } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Check, Loader2, Plus, Trash2, Key, Store, X, ShieldCheck, Database } from 'lucide-react';
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

// [Core Logic] 강력한 데이터 정제 함수 (sanitizeCredential)
// API Key 복사/붙여넣기 시 포함되는 보이지 않는 문자(ZWSP)와 공백을 제거합니다.
const sanitizeCredential = (value: string) => {
    if (!value) return "";
    return value
        .normalize("NFKC") // 1. 유니코드 정규화
        .replace(/[\u200B-\u200D\uFEFF]/g, "") // 2. 투명 문자(Zero Width Space 등) 제거
        .replace(/\u00A0/g, " ") // 3. NBSP 제거
        .replace(/[\r\n\t\u2028\u2029]/g, "") // 4. 줄바꿈 제거
        .replace(/\s+/g, "") // 5. 모든 공백 제거 (Key는 공백이 없어야 함)
        .trim();
};

// [Debug] 입력값 분석기
const analyzeInput = (input: string | undefined) => {
    if (!input) return null;
    const length = input.length;
    
    const charAnalysis = input.split('').map((char, index) => {
        const code = char.codePointAt(0) || 0;
        const isStandard = code >= 32 && code <= 126;
        return { char, code, isStandard };
    });

    return (
        <div className="mt-1.5 p-2 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-mono overflow-x-auto border border-slate-200">
            <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Length: <span className="text-slate-700 font-bold">{length}</span></span>
                <div className="flex items-center gap-1 text-emerald-600 font-bold">
                    <ShieldCheck size={10} /> 
                    <span>Smart Cleaned</span>
                </div>
            </div>
            <div className="flex flex-wrap gap-1">
                {charAnalysis.map((item, idx) => (
                    <span key={idx} className={`px-1 rounded flex items-center justify-center min-w-[16px] h-4 border ${item.isStandard ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200 text-red-600 font-bold'}`}>
                        {item.char}
                    </span>
                ))}
            </div>
        </div>
    );
};

const Integration = () => {
    const navigate = useNavigate();
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>('NAVER');
    const [myAccounts, setMyAccounts] = useState<MarketAccount[]>([]);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('연동 정보 저장');
    const [formAlias, setFormAlias] = useState('');
    const [formCredentials, setFormCredentials] = useState<Record<string, string>>({});
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

    // [Handler] 입력 시 실시간 정제
    const handleCredentialChange = (key: string, value: string) => {
        const cleanValue = sanitizeCredential(value);
        setFormCredentials(prev => ({ ...prev, [key]: cleanValue }));
    };

    // [Handler] 스마트 붙여넣기
    const handleCredentialPaste = (e: React.ClipboardEvent, key: string) => {
        e.preventDefault(); 
        const text = e.clipboardData.getData('text/plain');
        const cleanText = sanitizeCredential(text);
        setFormCredentials(prev => ({ ...prev, [key]: cleanText }));
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Guest 체크
        if (isSupabaseConfigured() && !dbAuthUser) {
            alert("⚠️ 게스트 상태입니다. 정보를 저장하려면 먼저 로그인해주세요.");
            navigate('/login');
            return;
        }

        setModalLoading(true);
        setLoadingMessage('키 검증 및 저장 중...');

        try {
            const cleanAlias = formAlias ? formAlias.trim() : "";
            if (!cleanAlias) throw new Error("계정 별칭을 입력해주세요.");

            const cleanCredentials: Record<string, string> = {};
            const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);

            currentMarket?.fields.forEach(field => {
                const val = formCredentials[field.key] || "";
                const cleanVal = sanitizeCredential(val); 
                if (!cleanVal) throw new Error(`${field.label}을(를) 입력해주세요.`);
                cleanCredentials[field.key] = cleanVal;
            });

            const newAccountPayload = {
                marketType: selectedPlatform,
                accountName: cleanAlias,
                credentials: cleanCredentials, 
                isActive: true
            };
            
            const result = await mockSupabase.db.markets.saveSimple(newAccountPayload as MarketAccount);

            if (!result.success) {
                throw new Error(result.message || "저장에 실패했습니다.");
            }

            alert("✅ 계정이 성공적으로 연동되었습니다!");
            await loadAccounts(); 
            setIsModalOpen(false);

        } catch (error: any) {
            console.error("Save Error:", error);
            alert(`❌ 연동 실패\n\n${error.message}`);
        } finally {
            setModalLoading(false);
            setLoadingMessage('연동 정보 저장');
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('정말 이 계정을 삭제하시겠습니까?')) {
            await mockSupabase.db.markets.delete(id);
            await loadAccounts();
        }
    };

    const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);
    const accountsForCurrentPlatform = myAccounts.filter(m => m.marketType === selectedPlatform);

    return (
        <Layout title="마켓 계정 연동">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-full min-h-[600px]">
                {/* Left: Market List */}
                <div className="col-span-1 space-y-6">
                    <div>
                        <h4 className="px-4 text-xs font-bold text-slate-400 uppercase mb-3">연동할 마켓 선택</h4>
                        <div className="space-y-1">
                            {MARKETS.map((market) => {
                                const count = myAccounts.filter(m => m.marketType === market.platform).length;
                                return (
                                    <button
                                        key={market.platform}
                                        onClick={() => {
                                            setSelectedPlatform(market.platform);
                                            setIsModalOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                                            selectedPlatform === market.platform 
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
                </div>

                {/* Right: Content Area */}
                <div className="col-span-1 md:col-span-3">
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
                                accountsForCurrentPlatform.map((acc: any) => (
                                    <div key={acc.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex justify-between items-center group hover:border-primary-200 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-slate-100 p-3 rounded-xl text-slate-500 relative">
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
                                        onPaste={(e) => handleCredentialPaste(e, field.key)}
                                        placeholder={field.placeholder}
                                        className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50 transition-all"
                                    />
                                    {/* 스마트 붙여넣기 결과 시각화 */}
                                    {analyzeInput(formCredentials[field.key])}
                                </div>
                            ))}

                            <div className="pt-6">
                                <button 
                                    type="submit" 
                                    disabled={modalLoading}
                                    className="w-full bg-slate-900 text-white h-12 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                                >
                                    {modalLoading ? (
                                        <><Loader2 className="animate-spin" /> {loadingMessage}</>
                                    ) : '연동 정보 저장'}
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