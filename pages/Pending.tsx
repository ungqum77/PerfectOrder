import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { mockSupabase } from '../lib/mockSupabase';
import { Order } from '../types';
import { Truck, Lock, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Pending = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { checkPermission } = useAuth();
    const navigate = useNavigate();
    const hasAccess = checkPermission();

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setIsLoading(true);
        setTimeout(async () => {
            const allOrders = await mockSupabase.db.orders.getAll();
            setOrders(allOrders.filter(o => o.status === 'PENDING'));
            setIsLoading(false);
        }, 500);
    };

    const handleDispatch = async (orderId?: string) => {
        if (!hasAccess) {
             if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                navigate('/subscription');
            }
            return;
        }

        const targets = orderId ? [orderId] : orders.map(o => o.id);
        if (targets.length === 0) return;

        if (confirm("송장을 전송하고 '배송 중' 상태로 변경하시겠습니까?")) {
            setIsLoading(true);
            await mockSupabase.db.orders.updateStatus(targets, 'SHIPPING');
            await loadOrders();
            setIsLoading(false);
            alert("처리되었습니다.");
        }
    }

    const getPlatformName = (platform: string) => {
        switch(platform) {
            case 'NAVER': return '네이버';
            case 'COUPANG': return '쿠팡';
            case '11ST': return '11번가';
            case 'GMARKET': return '지마켓';
            default: return platform;
        }
    }

    return (
        <Layout title="배송 준비">
             <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 flex flex-wrap gap-4 justify-between items-center shadow-sm">
                <div className="flex gap-6 items-center">
                    <div className="flex flex-col">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">조회 기간</label>
                        <div className="text-slate-900 font-bold text-sm mt-1">2024.05.01 - 2024.05.21</div>
                    </div>
                    <div className="h-8 w-px bg-slate-200"></div>
                    <div className="flex flex-col w-64">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">검색</label>
                        <input type="text" className="bg-transparent border-none p-0 text-sm font-medium focus:ring-0 placeholder-slate-300 mt-1" placeholder="구매자명 또는 주문번호" />
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={loadOrders} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <button 
                        onClick={() => handleDispatch()}
                        disabled={orders.length === 0}
                        className={`px-6 py-3 rounded-xl text-sm font-bold shadow-md transition-colors flex items-center gap-2 ${
                            orders.length === 0 
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                            : hasAccess 
                                ? "bg-slate-900 text-white hover:bg-slate-800"
                                : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }`}
                    >
                        {!hasAccess && <Lock size={14} />}
                        <Truck size={16} /> 전체 송장 전송 ({orders.length})
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <p className="text-sm font-medium">데이터 로딩 중...</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-xs font-bold text-slate-500 uppercase">
                                <th className="p-4 w-12"><input type="checkbox" className="rounded border-gray-300"/></th>
                                <th className="p-4">판매처</th>
                                <th className="p-4">주문번호</th>
                                <th className="p-4">구매자</th>
                                <th className="p-4 w-1/3">상품명</th>
                                <th className="p-4">택배사</th>
                                <th className="p-4 w-48">송장번호</th>
                                <th className="p-4 w-24">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {orders.length === 0 ? (
                                <tr><td colSpan={8} className="p-12 text-center text-slate-500">처리할 배송 건이 없습니다.</td></tr>
                            ) : orders.map((order) => (
                                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4"><input type="checkbox" className="rounded border-gray-300"/></td>
                                    <td className="p-4 text-sm font-bold text-slate-700">{getPlatformName(order.platform)}</td>
                                    <td className="p-4 text-sm text-primary-600 font-mono">{order.orderNumber}</td>
                                    <td className="p-4 text-sm font-medium text-slate-900">{order.customerName}</td>
                                    <td className="p-4 text-sm text-slate-600 truncate max-w-[200px]">{order.productName}</td>
                                    <td className="p-4">
                                        <select className="text-sm rounded-lg border-slate-200 bg-white py-1.5 px-3 focus:border-primary-500 focus:ring-primary-500 w-full">
                                            <option>CJ대한통운</option>
                                            <option>우체국택배</option>
                                            <option>롯데택배</option>
                                        </select>
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="text" 
                                            className="w-full text-sm border border-amber-200 bg-amber-50 rounded-lg py-1.5 px-3 placeholder-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200" 
                                            placeholder="송장번호 입력"
                                            defaultValue={order.invoiceNumber}
                                        />
                                    </td>
                                    <td className="p-4">
                                        <button 
                                            onClick={() => handleDispatch(order.id)}
                                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
                                        >
                                            개별 전송
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </Layout>
    );
};

export default Pending;