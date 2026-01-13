import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Platform, MarketCredential } from '../types';
import { mockSupabase } from '../lib/mockSupabase';
import { saveSupabaseConfig, clearSupabaseConfig, isSupabaseConfigured } from '../lib/supabase';
import { Check, Loader2, Plus, Trash2, AlertCircle, Database, Server, Settings, Save } from 'lucide-react';

interface MarketInfo {
    platform: Platform;
    name: string;
    authType: 'LOGIN' | 'API';
    color: string;
    description: string;
}

const MARKETS: MarketInfo[] = [
    { platform: 'NAVER', name: '네이버 스마트스토어', authType: 'API', color: 'bg-green-500', description: '네이버 커머스 API 센터에서 애플리케이션 등록 후 ID/Secret을 입력하세요.' },
    { platform: 'COUPANG', name: '쿠팡 윙', authType: 'API', color: 'bg-red-500', description: '쿠팡 Wing 판매자 센터에서 발급받은 업체코드와 키를 입력하세요.' },
    { platform: '11ST', name: '11번가', authType: 'API', color: 'bg-red-600', description: '11번가 오픈 API 센터의 키를 입력하세요.' },
    { platform: 'GMARKET', name: '지마켓', authType: 'LOGIN', color: 'bg-emerald-600', description: 'ESM PLUS 아이디와 비밀번호로 연동합니다.' },
    { platform: 'AUCTION', name: '옥션', authType: 'LOGIN', color: 'bg-red-400', description: 'ESM PLUS 아이디와 비밀번호로 연동합니다.' },
];

const Integration = () => {
    const [activeTab, setActiveTab] = useState<string>('MARKET'); // MARKET | DATABASE
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>('NAVER');
    const [myAccounts, setMyAccounts] = useState<MarketCredential[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Market Inputs
    const [alias, setAlias] = useState('');
    const [id, setId] = useState(''); 
    const [secret, setSecret] = useState('');

    // DB Inputs
    const [dbUrl, setDbUrl] = useState(localStorage.getItem('sb_url') || '');
    const [dbKey, setDbKey] = useState(localStorage.getItem('sb_key') || '');
    const [isDbConnected, setIsDbConnected] = useState(isSupabaseConfigured());

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        const markets = await mockSupabase.db.markets.get();
        setMyAccounts(markets);
    }

    const handleConnectMarket = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        setTimeout(async () => {
            const currentMarket = MARKETS.find(m => m.platform === selectedPlatform);
            
            await mockSupabase.db.markets.save({
                id: Math.random().toString(36).substr(2, 9),
                platform: selectedPlatform,
                type: currentMarket?.authType === 'LOGIN' ? 'LOGIN' : 'API_KEY',
                alias: alias || `${currentMarket?.name} ${myAccounts.filter(m => m.platform === selectedPlatform).length + 1}`,
                isConnected: true,
                username: currentMarket?.authType === 'LOGIN' ? id : undefined, 
                apiKey: currentMarket?.authType === 'API' ? id : undefined,
                apiSecret: currentMarket?.authType === 'API' ? secret : undefined
            });
            
            await loadAccounts();
            setLoading(false);
            setAlias('');
            setId('');
            setSecret('');
            alert("성공적으로 연동되었습니다.");
        }, 1500);
    };

    const handleDelete = async (id: string) => {
        if(confirm('정말 이 계정의 연동을 해제하시겠습니까?')) {
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
    const accountsForCurrentPlatform = myAccounts.filter(m => m.platform === selectedPlatform);

    return (
        <Layout title="시스템 연동 관리">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Left: Navigation */}
                <div className="col-span-1 space-y-6">
                    <div>
                        <h4 className="px-4 text-xs font-bold text-slate-400 uppercase mb-2">외부 마켓 연동</h4>
                        <div className="space-y-1">
                            {MARKETS.map((market) => {
                                const count = myAccounts.filter(m => m.platform === market.platform).length;
                                return (
                                    <button
                                        key={market.platform}
                                        onClick={() => {
                                            setActiveTab('MARKET');
                                            setSelectedPlatform(market.platform);
                                        }}
                                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                                            activeTab === 'MARKET' && selectedPlatform === market.platform 
                                            ? 'bg-primary-50 border-primary-500 text-primary-700 font-bold' 
                                            : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`size-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${market.color}`}>
                                                {market.platform[0]}
                                            </div>
                                            <span className="text-sm">{market.name}</span>
                                        </div>
                                        {count > 0 && (
                                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h4 className="px-4 text-xs font-bold text-slate-400 uppercase mb-2">시스템 설정</h4>
                         <button
                            onClick={() => setActiveTab('DATABASE')}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                                activeTab === 'DATABASE' 
                                ? 'bg-slate-800 border-slate-900 text-white font-bold shadow-md' 
                                : 'bg-white border-transparent hover:bg-slate-50 text-slate-600'
                            }`}
                        >
                            <Database size={18} />
                            <span className="text-sm">DB 연결 설정</span>
                             {isDbConnected && <div className="ml-auto size-2 rounded-full bg-green-500"></div>}
                        </button>
                    </div>
                </div>

                {/* Right: Content Area */}
                <div className="col-span-1 md:col-span-3">
                    {activeTab === 'DATABASE' ? (
                        <div className="space-y-6 animate-fade-in">
                            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
                                        <Server size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900">Supabase 데이터베이스 연결</h3>
                                        <p className="text-slate-500 text-sm">실제 주문 데이터를 관리하기 위해 Supabase 프로젝트와 연결합니다.</p>
                                    </div>
                                </div>

                                {isDbConnected ? (
                                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-green-500 text-white p-1 rounded-full"><Check size={16}/></div>
                                            <div>
                                                <p className="font-bold text-green-800">데이터베이스가 연결되었습니다</p>
                                                <p className="text-xs text-green-600">주문 데이터가 실제 DB와 동기화됩니다.</p>
                                            </div>
                                        </div>
                                        <button onClick={handleDisconnectDb} className="text-xs bg-white border border-green-200 text-green-700 px-3 py-1.5 rounded-lg font-bold hover:bg-green-100">
                                            연결 해제
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-3 mb-8">
                                        <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5"/>
                                        <div>
                                            <p className="font-bold text-amber-800 text-sm">데모 모드 실행 중</p>
                                            <p className="text-xs text-amber-700 leading-relaxed mt-1">
                                                현재 로컬 가상 데이터를 사용 중입니다.<br/>
                                                실제 DB를 사용하려면 아래에 Supabase 프로젝트 정보를 입력하세요.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={handleSaveDb} className="space-y-5 max-w-xl">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Project URL</label>
                                        <input 
                                            type="text" 
                                            value={dbUrl}
                                            onChange={(e) => setDbUrl(e.target.value)}
                                            className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50" 
                                            placeholder="https://your-project-id.supabase.co"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">API Key (anon/public)</label>
                                        <div className="relative">
                                            <input 
                                                type="password" 
                                                value={dbKey}
                                                onChange={(e) => setDbKey(e.target.value)}
                                                className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm bg-slate-50 pr-10" 
                                                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100 flex gap-3">
                                        <button 
                                            type="submit"
                                            className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg shadow-slate-200"
                                        >
                                            <Save size={18} /> 설정 저장 및 연결
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-fade-in">
                            {/* Market Header */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
                                <div className={`size-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg ${currentMarket?.color}`}>
                                    {currentMarket?.platform[0]}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">{currentMarket?.name}</h3>
                                    <p className="text-slate-500 text-sm mt-1">{currentMarket?.description}</p>
                                </div>
                            </div>

                            {/* Connected Accounts */}
                            {accountsForCurrentPlatform.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                                    <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                        <Check size={18} className="text-green-500"/> 연동된 계정 목록
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {accountsForCurrentPlatform.map((acc) => (
                                            <div key={acc.id} className="border border-slate-200 rounded-xl p-4 flex justify-between items-center bg-slate-50">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{acc.alias}</p>
                                                    <p className="text-xs text-slate-500 mt-1 font-mono">
                                                        {acc.type === 'API_KEY' ? `Key: ${acc.apiKey?.substring(0, 8)}...` : `ID: ${acc.username}`}
                                                    </p>
                                                </div>
                                                <button 
                                                    onClick={() => handleDelete(acc.id)}
                                                    className="text-slate-400 hover:text-red-500 p-2 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Add Connection */}
                            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                                <h4 className="font-bold text-slate-900 mb-6 flex items-center gap-2">
                                    <Plus size={18} className="text-primary-600"/> 새 계정 추가
                                </h4>

                                <form onSubmit={handleConnectMarket} className="max-w-lg space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">계정 별칭 (선택)</label>
                                        <input 
                                            type="text" 
                                            value={alias}
                                            onChange={(e) => setAlias(e.target.value)}
                                            className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none text-sm" 
                                            placeholder="예: 본점, 2호점"
                                        />
                                    </div>

                                    {selectedPlatform === 'NAVER' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">애플리케이션 ID (Client ID)</label>
                                                <input 
                                                    type="text" 
                                                    value={id}
                                                    onChange={(e) => setId(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm" 
                                                    placeholder="네이버 커머스 API 센터 Client ID"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">애플리케이션 시크릿 (Client Secret)</label>
                                                <input 
                                                    type="password" 
                                                    value={secret}
                                                    onChange={(e) => setSecret(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm" 
                                                    placeholder="Client Secret"
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}

                                    {currentMarket?.authType === 'LOGIN' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">판매자 아이디</label>
                                                <input 
                                                    type="text" 
                                                    value={id}
                                                    onChange={(e) => setId(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none" 
                                                    placeholder="판매자 아이디 입력"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">비밀번호</label>
                                                <input 
                                                    type="password" 
                                                    value={secret} 
                                                    onChange={(e) => setSecret(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none" 
                                                    placeholder="비밀번호 입력"
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}

                                    {selectedPlatform !== 'NAVER' && currentMarket?.authType === 'API' && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">API Access Key</label>
                                                <input 
                                                    type="text" 
                                                    value={id}
                                                    onChange={(e) => setId(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm" 
                                                    placeholder="API Key"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">Secret Key</label>
                                                <input 
                                                    type="password" 
                                                    value={secret}
                                                    onChange={(e) => setSecret(e.target.value)}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-100 outline-none font-mono text-sm" 
                                                    placeholder="Secret Key"
                                                    required
                                                />
                                            </div>
                                        </>
                                    )}

                                    <div className="pt-4">
                                        <button 
                                            disabled={loading}
                                            type="submit"
                                            className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-2 disabled:opacity-70"
                                        >
                                            {loading ? <Loader2 className="animate-spin" size={20} /> : '계정 추가하기'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default Integration;