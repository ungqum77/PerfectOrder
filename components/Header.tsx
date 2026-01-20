'use client';

import React, { useState, useEffect } from 'react';
import {
    Wifi,
    WifiOff,
    CloudCog,
    Search,
    Bell,
    RefreshCw
} from 'lucide-react';
import { mockSupabase } from '@/lib/mockSupabase';

interface HeaderProps {
    title: string;
}

export const Header = ({ title }: HeaderProps) => {
    const [dbStatus, setDbStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN'>('UNKNOWN');
    const [syncCount, setSyncCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        checkStatus();
        // 5초마다 연결 상태 및 대기열 확인
        const interval = setInterval(async () => {
            checkStatus();

            // 백그라운드 동기화 시도 (Optional)
            const pendingItems = JSON.parse(localStorage.getItem('po_pending_markets') || '[]');
            setSyncCount(pendingItems.length);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const checkStatus = () => {
        const status = mockSupabase.getConnectionStatus();
        setDbStatus(status);
    };

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const count = await mockSupabase.db.orders.syncExternalOrders();
            // 동기화 완료 메시지 개선
            if (count > 0) {
                alert(`동기화 완료!\n오늘의 데이터에서 ${count}건의 새로운 주문을 가져왔습니다.`);
                window.location.reload();
            } else {
                alert("동기화 완료!\n오늘 새로운 주문(또는 변경된 상태)이 없습니다.");
            }
        } catch (e: any) {
            console.error(e);
            alert(`동기화 중 오류가 발생했습니다.\n${e.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-8 py-4 sticky top-0 z-40">
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
                {/* DB Connection Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${dbStatus === 'CONNECTED'
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : 'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>
                    {dbStatus === 'CONNECTED' ? <Wifi size={12} /> : <WifiOff size={12} />}
                    {dbStatus === 'CONNECTED' ? 'Live DB' : 'Offline Mode'}
                </div>

                {/* Sync Status Badge */}
                {syncCount > 0 && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 animate-pulse">
                        <CloudCog size={12} />
                        {syncCount}건 대기 중
                    </div>
                )}
            </div>
            <div className="flex items-center gap-4">
                <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="주문 검색..."
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 w-64 transition-all"
                    />
                </div>
                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                <button className="flex items-center justify-center rounded-lg size-10 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors relative">
                    <Bell size={20} />
                    <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>
                <button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors shadow-sm shadow-primary-200 disabled:opacity-70 disabled:cursor-wait"
                >
                    <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                    <span>{isSyncing ? '오늘 주문 동기화' : '오늘 주문 동기화'}</span>
                </button>
            </div>
        </header>
    );
};
