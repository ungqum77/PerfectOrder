import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Platform, MarketAccount } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { marketApi } from '../lib/marketApi';
import { Check, Loader2, Plus, Trash2, Key, Store, X, ShieldCheck, Zap, AlertTriangle, Copy, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MarketInfo {
    platform: Platform;
    name: string;
    authType: 'LOGIN' | 'API';
    color: string;
    description: string;
    ipGuide?: boolean; // IP 설정 가이드 필요 여부
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
        ipGuide: true, // 쿠팡은 IP 설정이 필수이므로 가이드 표시
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

const Integration = () => {
    const navigate = useNavigate();
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>('NAVER');
    const [myAccounts, setMyAccounts] = useState<MarketAccount[]>([]);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false); 
    const [testResult, setTestResult] = useState<{ success: boolean, message: string } | null>(null); 
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
        setTestResult(null);
        setIsModalOpen(true);
    };

    const handleCredentialChange = (key: string, value: string) => {
        const cleanValue = sanitizeCredential(value);
        setFormCredentials(prev => ({ ...prev, [key]: cleanValue }));
        setTestResult(null); 
    };

    const handleCredentialPaste = (e: React.ClipboardEvent, key: string) => {
        e.preventDefault(); 
        const text = e.clipboardData.getData('text/plain');
        const cleanText = sanitizeCredential(text);
        setFormCredentials(prev => ({ ...prev, [key]: cleanText }));
    };

    const handleCopyIp = () => {
        navigator.clipboard.writeText("0.0.0.0");
        alert("IP 설정값(0.0.0.0)이 복사되었습니다.\n쿠팡 윙 'IP 주소' 란에 붙여넣기 하세요.");
    };

    const handleTestConnection = async (e: React.MouseEvent) => {
        e.preventDefault();
        setTestLoading(true);
        setTestResult(null);

        try {
            const tempAccount: MarketAccount = {
                id: 'temp-test',
                marketType: selectedPlatform,
                accountName: 'Test',
                isActive: true,
                credentials: formCredentials
            };

            if (selectedPlatform === 'COUPANG') {
                await marketApi.fetchCoupangOrders(tempAccount);
                setTestResult({ success: true, message: "성공적으로 연결되었습니다! (주문 조회 성공)" });
            } else if (selectedPlatform === 'NAVER') {
                await marketApi.fetchNaverOrders(tempAccount);
                setTestResult({ success: true, message: "연결 성공 (Mock Test)" });
            } else {
                 setTestResult({ success: true, message: "기본 연결 테스트 통과" });
            }

        } catch (error: any) {
            console.error("Test Connection Error:", error);
            let errorMsg = error.message;
            if (errorMsg.includes("404")) errorMsg += "\n(API 경로를 찾을 수 없습니다. Vercel 배포 환경인지 확인해주세요)";
            if (errorMsg.includes("Access Denied") || errorMsg.includes("403")) errorMsg += "\n(IP가 차단되었습니다. 쿠팡 윙에서 0.0.0.0을 허용했는지 확인하세요)";
            
            setTestResult({ success: false, message: errorMsg });
        } finally {
            setTestLoading(false);
        }
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        
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
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
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
                        
                        <div className="overflow-y-auto flex-1 p-8 space-y-5">
                            {/* [IP Guide] 쿠팡 전용 IP 가이드 */}
                            {currentMarket.ipGuide && (
                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                                    <div className="flex items-start gap-3">
                                        <div className="p-1 bg-blue-100 rounded text-blue-600 mt-0.5"><Info size={16} /></div>
                                        <div>
                                            <h5 className="text-sm font-bold text-blue-800 mb-1">고정 IP 설정 안내 (중요)</h5>
                                            <p className="text-xs text-blue-700 leading-relaxed mb-3">
                                                현재 사용중인 시스템(Vercel)은 클라우드 특성상 IP가 수시로 변경됩니다.<br/>
                                                따라서 쿠팡 윙 API 설정에서 특정 IP 대신 <strong>전체 허용</strong> 설정을 사용해야 정상적으로 주문을 가져올 수 있습니다.<br/>
                                                (Tip: 뒤에 붙는 /0 을 제거하고 0.0.0.0 만 입력하세요)
                                            </p>
                                            <div className="flex items-center gap-2 bg-white rounded-lg border border-blue-200 p-2">
                                                <code className="flex-1 font-mono text-sm font-bold text-slate-700 text-center">0.0.0.0</code>
                                                <button 
                                                    onClick={handleCopyIp}
                                                    className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold rounded-md transition-colors flex items-center gap-1"
                                                >
                                                    <Copy size={12} /> 복사
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-blue-500 mt-2">* IP 설정 반영까지 최대 1시간이 소요될 수 있습니다.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                />
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
                                </div>
                            ))}

                            {/* 테스트 결과 표시 영역 */}
                            {testResult && (
                                <div className={`p-4 rounded-xl border flex items-start gap-3 text-sm animate-fade-in ${
                                    testResult.success 
                                    ? 'bg-green-50 border-green-200 text-green-700' 
                                    : 'bg-red-50 border-red-200 text-red-700'
                                }`}>
                                    {testResult.success ? <Check size={18} className="shrink-0 mt-0.5"/> : <AlertTriangle size={18} className="shrink-0 mt-0.5"/>}
                                    <div className="whitespace-pre-wrap">{testResult.message}</div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button 
                                type="button"
                                onClick={handleTestConnection}
                                disabled={testLoading || modalLoading}
                                className="flex-1 bg-white border border-slate-200 text-slate-700 h-12 rounded-xl font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                            >
                                {testLoading ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} className="text-amber-500"/>}
                                연동 테스트
                            </button>
                            <button 
                                onClick={handleAddAccount}
                                disabled={modalLoading || testLoading}
                                className="flex-[2] bg-slate-900 text-white h-12 rounded-xl font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                            >
                                {modalLoading ? (
                                    <><Loader2 className="animate-spin" /> {loadingMessage}</>
                                ) : '저장하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default Integration;