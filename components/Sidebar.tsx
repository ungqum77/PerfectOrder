'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    ShoppingBag,
    Package2,
    Truck,
    AlertTriangle,
    Wallet,
    Link as LinkIcon,
    BarChart3,
    ShieldAlert,
    CreditCard,
    LogOut
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const Sidebar = () => {
    const pathname = usePathname();
    const { user, logout, checkPermission } = useAuth();
    const isActive = (path: string) => pathname === path;
    const hasAccess = checkPermission();

    const menuItems = [
        { path: "/", label: "홈", icon: LayoutDashboard },
        { path: "/new-orders", label: "신규 주문", icon: ShoppingBag },
        { path: "/pending", label: "배송 준비", icon: Package2 },
        { path: "/delivery", label: "배송 중", icon: Truck },
        { path: "/claims", label: "취소/반품/교환", icon: AlertTriangle },
        { path: "/settlement", label: "정산 관리", icon: Wallet },
        { path: "/integration", label: "연동 관리", icon: LinkIcon },
        { path: "/analysis", label: "통계 분석", icon: BarChart3 },
        { path: "/subscription", label: "구독 관리", icon: CreditCard },
    ];

    if (user?.role === 'ADMIN') {
        menuItems.push({ path: "/admin", label: "관리자 설정", icon: ShieldAlert });
    }

    // 빌드 타임 (YY.MM.DD.HH.MM.SS)
    const buildVersion = "2.0.0 (Next.js)";

    return (
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col fixed h-full z-50 shadow-sm">
            <div className="p-6">
                <div className="flex items-center gap-3">
                    <div className="bg-primary-600 size-10 rounded-lg flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
                        <Package2 size={24} />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-slate-900 text-base font-bold leading-none">PerfectOrder</h1>
                        <p className="text-slate-400 text-xs font-medium mt-1">
                            {user?.role === 'ADMIN' ? '관리자 모드' : user?.plan === 'PRO' ? 'PRO Plan' : 'Free Plan'}
                        </p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 px-4 flex flex-col gap-1 mt-4 overflow-y-auto no-scrollbar">
                {menuItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group ${active
                                    ? 'bg-primary-50 text-primary-600'
                                    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            <item.icon
                                size={20}
                                className={active ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-900'}
                            />
                            <span className={`text-sm ${active ? 'font-bold' : 'font-medium'}`}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-100">
                <div className="mb-4 px-2">
                    {!hasAccess && user?.role !== 'ADMIN' && (
                        <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 mb-2">
                            <p className="text-xs font-bold text-orange-700">체험 기간이 만료되었습니다.</p>
                            <Link href="/subscription" className="text-[10px] text-orange-600 underline mt-1 block">구독하러 가기 &rarr;</Link>
                        </div>
                    )}
                    {hasAccess && user?.plan === 'FREE' && user?.trialEndsAt && (
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-2">
                            <p className="text-xs font-bold text-blue-700">무료 체험 중</p>
                            <p className="text-[10px] text-blue-500">
                                {new Date(user.trialEndsAt).toLocaleDateString()} 까지
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3">
                    <div
                        className="bg-center bg-no-repeat bg-cover rounded-full size-9 border border-slate-200 bg-slate-200 flex items-center justify-center text-slate-500 font-bold"
                    >
                        {user?.name?.[0]}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold truncate text-slate-900">{user?.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    </div>
                    <button onClick={logout} className="text-slate-400 hover:text-slate-700">
                        <LogOut size={16} />
                    </button>
                </div>

                {/* Version Info */}
                <div className="text-center">
                    <p className="text-[10px] text-slate-300 font-mono">ver {buildVersion}</p>
                </div>
            </div>
        </aside>
    );
};
