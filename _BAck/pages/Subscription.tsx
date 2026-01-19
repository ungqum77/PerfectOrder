import React from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { mockSupabase } from '../lib/mockSupabase';
import { Check, Star } from 'lucide-react';

const Subscription = () => {
    const { user, refreshUser } = useAuth();

    const handleSubscribe = async () => {
        if (confirm("월 9,900원을 결제하시겠습니까? (모의 결제)")) {
            // Update user to PRO
            await mockSupabase.db.users.update(user!.id, {
                plan: 'PRO',
                subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });
            alert("구독이 완료되었습니다. 감사합니다!");
            refreshUser();
        }
    };

    return (
        <Layout title="구독 관리">
            <div className="text-center mb-12">
                <h2 className="text-3xl font-black text-slate-900 mb-4">요금제 선택</h2>
                <p className="text-slate-500">비즈니스 규모에 맞는 최적의 플랜을 선택하세요.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8 justify-center max-w-5xl mx-auto">
                {/* Free Plan */}
                <div className={`flex-1 bg-white p-8 rounded-3xl border-2 ${user?.plan === 'FREE' ? 'border-slate-300' : 'border-slate-100'} shadow-sm relative overflow-hidden`}>
                     {user?.plan === 'FREE' && (
                        <div className="absolute top-0 right-0 bg-slate-200 text-slate-600 px-4 py-1 text-xs font-bold rounded-bl-xl">
                            현재 이용중
                        </div>
                    )}
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Free</h3>
                    <div className="text-4xl font-black text-slate-900 mb-6">₩0 <span className="text-base font-medium text-slate-400">/월</span></div>
                    <p className="text-slate-500 text-sm mb-8">기본적인 주문 조회 기능을 체험해보세요.</p>
                    
                    <ul className="space-y-4 mb-8">
                        <li className="flex items-center gap-3 text-slate-700 text-sm"><Check size={18} className="text-slate-400"/> 주문 조회 무제한</li>
                        <li className="flex items-center gap-3 text-slate-700 text-sm"><Check size={18} className="text-slate-400"/> 마켓 연동 무제한</li>
                        <li className="flex items-center gap-3 text-slate-400 text-sm line-through decoration-slate-300"><Check size={18} className="text-slate-200"/> 엑셀 다운로드</li>
                         <li className="flex items-center gap-3 text-slate-400 text-sm line-through decoration-slate-300"><Check size={18} className="text-slate-200"/> 주문 상태 변경</li>
                    </ul>

                    <button disabled className="w-full py-4 rounded-xl bg-slate-100 text-slate-400 font-bold cursor-not-allowed">
                        기본 제공
                    </button>
                </div>

                {/* Pro Plan */}
                <div className={`flex-1 bg-white p-8 rounded-3xl border-2 ${user?.plan === 'PRO' ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-primary-100'} shadow-xl relative overflow-hidden transform md:-translate-y-4`}>
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-primary-400 to-primary-600"></div>
                     {user?.plan === 'PRO' && (
                        <div className="absolute top-2 right-0 bg-primary-100 text-primary-700 px-4 py-1 text-xs font-bold rounded-l-xl">
                            구독중
                        </div>
                    )}
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xl font-bold text-slate-900">Pro</h3>
                        <div className="bg-amber-100 text-amber-700 p-2 rounded-lg"><Star size={20} fill="currentColor" /></div>
                    </div>
                    <div className="text-4xl font-black text-slate-900 mb-6">₩9,900 <span className="text-base font-medium text-slate-400">/월</span></div>
                    <p className="text-slate-500 text-sm mb-8">모든 기능을 제한 없이 이용하세요.</p>
                    
                    <ul className="space-y-4 mb-8">
                        <li className="flex items-center gap-3 text-slate-900 font-medium text-sm"><div className="p-1 bg-primary-100 rounded-full text-primary-600"><Check size={14}/></div> 주문 조회 무제한</li>
                        <li className="flex items-center gap-3 text-slate-900 font-medium text-sm"><div className="p-1 bg-primary-100 rounded-full text-primary-600"><Check size={14}/></div> 마켓 연동 무제한</li>
                        <li className="flex items-center gap-3 text-slate-900 font-medium text-sm"><div className="p-1 bg-primary-100 rounded-full text-primary-600"><Check size={14}/></div> 엑셀 대량 다운로드</li>
                        <li className="flex items-center gap-3 text-slate-900 font-medium text-sm"><div className="p-1 bg-primary-100 rounded-full text-primary-600"><Check size={14}/></div> 송장 전송 및 발주 확인</li>
                    </ul>

                    {user?.plan === 'PRO' ? (
                        <div className="text-center text-primary-600 font-bold py-4">
                            이용해 주셔서 감사합니다!
                        </div>
                    ) : (
                         <button 
                            onClick={handleSubscribe}
                            className="w-full py-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold shadow-lg shadow-primary-200 transition-all"
                        >
                            지금 시작하기
                        </button>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default Subscription;
