import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle, Check, Sparkles, Mail, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured } from '../lib/supabase';

const Signup = () => {
    const navigate = useNavigate();
    const { signup, resendVerification } = useAuth(); // resendVerification 추가
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [successStep, setSuccessStep] = useState(false);
    const [resendStatus, setResendStatus] = useState<'IDLE' | 'SENDING' | 'SENT'>('IDLE');

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const err = await signup(email, password, name);
        if (err) {
            setError(err);
        } else {
            if (isSupabaseConfigured()) {
                setSuccessStep(true);
            } else {
                alert("체험 모드: 이메일 인증 없이 바로 로그인됩니다.");
                navigate('/');
            }
        }
    };

    const handleResend = async () => {
        setResendStatus('SENDING');
        const err = await resendVerification(email);
        if (err) {
            alert(err);
            setResendStatus('IDLE');
        } else {
            setResendStatus('SENT');
            alert("인증 메일이 재발송되었습니다.");
        }
    };

    if (successStep) {
        return (
            <div className="flex h-screen w-full bg-slate-50 items-center justify-center p-4">
                <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100 animate-scale-in">
                    <div className="size-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Mail size={36} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">인증 메일이 발송되었습니다</h2>
                    <p className="text-slate-500 mb-8 leading-relaxed">
                        <span className="font-bold text-slate-800">{email}</span> 주소로<br/>
                        인증 링크를 보냈습니다.<br/>
                        메일함을 확인하고 링크를 클릭하면 가입이 완료됩니다.
                    </p>
                    
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 text-sm text-slate-600 text-left flex items-start gap-3">
                        <ShieldCheck size={20} className="shrink-0 text-primary-600 mt-0.5" />
                        <div>
                            <p className="font-bold text-slate-800">이메일 인증이 필요한 이유</p>
                            <p className="mt-1 text-xs">안전한 서비스 이용과 계정 보호를 위해 이메일 인증을 완료해야 로그인이 가능합니다.</p>
                        </div>
                    </div>

                    <button 
                        onClick={() => navigate('/login')}
                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors"
                    >
                        로그인 페이지로 이동
                    </button>

                    <button 
                        onClick={handleResend}
                        disabled={resendStatus === 'SENDING' || resendStatus === 'SENT'}
                        className="mt-6 flex items-center justify-center gap-2 w-full text-slate-400 text-sm hover:text-primary-600 underline transition-colors"
                    >
                        {resendStatus === 'SENDING' ? (
                            <><RefreshCw size={14} className="animate-spin"/> 발송 중...</>
                        ) : resendStatus === 'SENT' ? (
                            <>재발송 완료</>
                        ) : (
                            <>메일이 오지 않았나요? 재발송하기</>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen w-full bg-white font-sans">
            {/* Left Side - Form */}
            <div className="w-full lg:w-1/2 h-full flex items-center justify-center p-8 sm:p-12 overflow-y-auto bg-white">
                <div className="w-full max-w-[440px] flex flex-col">
                    <div className="mb-8">
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">무료 회원가입</h2>
                        <p className="text-slate-500">2일 동안 모든 기능을 무료로 체험해보세요.</p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-8">
                        <h4 className="text-blue-800 font-bold text-sm mb-2">가입 혜택</h4>
                        <ul className="space-y-1">
                            <li className="flex items-center gap-2 text-blue-700 text-xs font-medium">
                                <Check size={14} /> 모든 마켓(네이버, 쿠팡 등) 연동 가능
                            </li>
                            <li className="flex items-center gap-2 text-blue-700 text-xs font-medium">
                                <Check size={14} /> 주문 수집 및 상태 변경 기능 체험
                            </li>
                             <li className="flex items-center gap-2 text-blue-700 text-xs font-medium">
                                <Check size={14} /> 엑셀 대량 다운로드
                            </li>
                        </ul>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-sm font-medium">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}

                    <form className="flex flex-col gap-4" onSubmit={handleSignup}>
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 text-sm font-bold">이름 (업체명)</label>
                            <input 
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 h-12 px-4 text-base outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all" 
                                placeholder="업체명을 입력하세요" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 text-sm font-bold">이메일 주소</label>
                            <input 
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 h-12 px-4 text-base outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all" 
                                placeholder="name@company.com" 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 text-sm font-bold">비밀번호</label>
                            <input 
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 h-12 px-4 text-base outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all" 
                                placeholder="최소 6자 이상" 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                minLength={6}
                                required
                            />
                        </div>
                        <button 
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white h-12 rounded-xl text-base font-bold shadow-lg shadow-primary-200 transition-all flex items-center justify-center gap-2 mt-4" 
                            type="submit"
                        >
                            가입 완료 및 이메일 인증 <ArrowRight size={18} />
                        </button>
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-slate-500 text-sm">
                            이미 계정이 있으신가요? <span onClick={() => navigate('/login')} className="text-primary-600 font-bold hover:underline cursor-pointer">로그인</span>
                        </p>
                    </div>
                </div>
            </div>

             {/* Right Side (Graphic) */}
             <div className="hidden lg:flex lg:w-1/2 h-full bg-slate-50 relative flex-col items-center justify-center p-12 overflow-hidden border-l border-slate-100">
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-100/50 rounded-full blur-[100px] -mr-40 -mt-40"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-100/50 rounded-full blur-[80px] -ml-20 -mb-20"></div>
                
                <div className="relative z-10 w-full max-w-md">
                    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 transform rotate-3 hover:rotate-0 transition-all duration-500">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="size-12 bg-primary-100 text-primary-600 rounded-2xl flex items-center justify-center">
                                <Sparkles size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">Premium Features</h3>
                                <p className="text-slate-500 text-sm">Unlock your potential</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="h-4 bg-slate-100 rounded-full w-3/4"></div>
                            <div className="h-4 bg-slate-100 rounded-full w-full"></div>
                            <div className="h-4 bg-slate-100 rounded-full w-5/6"></div>
                            <div className="h-32 bg-slate-50 rounded-xl w-full border border-slate-100 mt-6 flex items-center justify-center text-slate-300">
                                Analytics Preview
                            </div>
                        </div>
                        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                            <div className="text-sm font-bold text-slate-400">PerfectOrder Inc.</div>
                            <div className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold">Pro Plan</div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 mt-12 text-center max-w-md">
                     <h3 className="text-2xl font-bold text-slate-900 mb-3">
                        성장의 파트너가 되어드립니다
                    </h3>
                    <p className="text-slate-500 leading-relaxed">
                        복잡한 주문 관리는 저희에게 맡기시고<br/>
                        사장님은 매출 증대에만 집중하세요.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signup;