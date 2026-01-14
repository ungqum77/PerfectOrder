import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package2, ArrowRight, AlertCircle, Mail, CheckCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = () => {
    const navigate = useNavigate();
    const { login, resendVerification } = useAuth();
    // [Fix] 스크린샷과 동일하게 이메일 프리필 설정
    const [email, setEmail] = useState('wellnascor@naver.com');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [needsVerification, setNeedsVerification] = useState(false);
    const [resendStatus, setResendStatus] = useState<'IDLE' | 'SENDING' | 'SENT'>('IDLE');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setNeedsVerification(false);
        setResendStatus('IDLE');

        const err = await login(email, password);
        if (err) {
            setError(err);
            if (err.includes("이메일 인증")) {
                setNeedsVerification(true);
            }
        } else {
            navigate('/');
        }
    };

    const handleResend = async () => {
        if (!email) {
            setError("이메일 주소를 입력해주세요.");
            return;
        }
        setResendStatus('SENDING');
        const err = await resendVerification(email);
        if (err) {
            setError(err);
            setResendStatus('IDLE');
        } else {
            setResendStatus('SENT');
            setError(null);
            setNeedsVerification(false); // 성공 메시지를 보여주기 위해 에러 상태 해제
            alert("인증 메일이 재발송되었습니다. 메일함을 확인해주세요.");
        }
    };

    return (
        <div className="flex h-screen w-full bg-white font-sans">
            {/* Left Side (Dark Blue) */}
            <div className="hidden lg:flex lg:w-1/2 h-full bg-slate-900 relative flex-col items-center justify-center p-12 overflow-hidden text-white">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[120px] -mr-32 -mt-32"></div>
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[100px] -ml-20 -mb-20"></div>
                
                <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
                    <div className="size-20 bg-primary-600 rounded-2xl flex items-center justify-center mb-8 shadow-2xl shadow-primary-500/30">
                        <Package2 size={40} className="text-white" />
                    </div>
                    <h1 className="text-5xl font-black leading-tight tracking-tight mb-6">
                        이커머스 운영을<br/> 더 효율적으로
                    </h1>
                    <p className="text-slate-400 text-lg leading-relaxed">
                        네이버, 쿠팡, 11번가의 주문, 재고, 배송을 한 곳에서 관리하세요.
                    </p>
                </div>
            </div>

            {/* Right Side (White) */}
            <div className="w-full lg:w-1/2 h-full flex items-center justify-center p-8 sm:p-12 overflow-y-auto bg-white">
                <div className="w-full max-w-[440px] flex flex-col">
                    <div className="mb-10">
                        <h2 className="text-3xl font-bold text-slate-900 mb-2">환영합니다</h2>
                        <p className="text-slate-500">로그인 정보를 입력해주세요.</p>
                    </div>

                    {resendStatus === 'SENT' && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3 text-green-700">
                            <CheckCircle size={20} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-sm">인증 메일 발송 완료</p>
                                <p className="text-xs mt-1">메일함(스팸함 포함)을 확인하여 인증 링크를 클릭해주세요.<br/>링크는 현재 브라우저 주소로 연결됩니다.</p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex flex-col gap-2 text-red-600 text-sm font-medium animate-shake">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} /> {error}
                            </div>
                        </div>
                    )}

                    <form className="flex flex-col gap-5" onSubmit={handleLogin}>
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
                            <div className="flex justify-between items-center">
                                <label className="text-slate-700 text-sm font-bold">비밀번호</label>
                                <a className="text-xs text-primary-600 font-bold hover:underline cursor-pointer">비밀번호 찾기</a>
                            </div>
                            <input 
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 h-12 px-4 text-base outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all" 
                                placeholder="비밀번호를 입력하세요" 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <button 
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white h-12 rounded-xl text-base font-bold shadow-lg shadow-primary-200 transition-all flex items-center justify-center gap-2 mt-4" 
                            type="submit"
                        >
                            로그인 <ArrowRight size={18} />
                        </button>
                    </form>

                    <div className="mt-8 text-center space-y-4">
                        <p className="text-slate-500 text-sm">
                            계정이 없으신가요? <span onClick={() => navigate('/signup')} className="text-primary-600 font-bold hover:underline cursor-pointer">무료 회원가입 (2일 체험)</span>
                        </p>
                        
                        {/* Always visible Resend Button */}
                        <div className="pt-4 border-t border-slate-100">
                             <button 
                                type="button"
                                onClick={handleResend}
                                disabled={resendStatus === 'SENDING'}
                                className="flex items-center justify-center gap-2 w-full py-2 text-sm text-slate-500 font-medium hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                {resendStatus === 'SENDING' ? (
                                    <><RefreshCw size={14} className="animate-spin"/> 발송 중...</>
                                ) : (
                                    <>인증 메일이 도착하지 않았나요? <span className="underline">재발송하기</span></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;