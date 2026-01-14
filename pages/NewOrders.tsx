import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { mockSupabase } from '../lib/mockSupabase';
import { Order } from '../types';
import { Download, CheckCircle, Search, Filter, Lock, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const NewOrders = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { checkPermission } = useAuth();
    const navigate = useNavigate();
    const hasAccess = checkPermission();
    
    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setIsLoading(true);
        // 네트워크 딜레이 시뮬레이션
        setTimeout(async () => {
            const allOrders = await mockSupabase.db.orders.getAll();
            setOrders(allOrders.filter(o => o.status === 'NEW'));
            setIsLoading(false);
        }, 500);
    };

    const toggleSelect = (id: string) => {
        if (selected.includes(id)) {
            setSelected(selected.filter(item => item !== id));
        } else {
            setSelected([...selected, id]);
        }
    };

    const toggleSelectAll = () => {
        if (selected.length === orders.length) {
            setSelected([]);
        } else {
            setSelected(orders.map(o => o.id));
        }
    }

    const handleConfirmOrders = async () => {
        if (selected.length === 0) return alert("주문을 선택해주세요.");

        if (!hasAccess) {
            if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                navigate('/subscription');
            }
            return;
        }

        if (confirm(`선택한 ${selected.length}건의 주문을 확인(발주) 처리하시겠습니까?\n'배송 준비' 단계로 이동합니다.`)) {
            setIsLoading(true);
            await mockSupabase.db.orders.updateStatus(selected, 'PENDING');
            await loadOrders();
            setSelected([]);
            setIsLoading(false);
        }
    }

    // [New] 엑셀 다운로드 핸들러
    const handleExcelDownload = () => {
        if (!hasAccess) {
             if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                navigate('/subscription');
            }
            return;
        }

        if (orders.length === 0) {
            alert("다운로드할 주문이 없습니다.");
            return;
        }

        // CSV 데이터 생성
        const headers = ['주문번호', '판매처', '상품명', '옵션', '구매자', '결제금액', '상태', '주문일시'];
        const rows = orders.map(o => [
            o.orderNumber,
            o.platform,
            o.productName,
            o.option,
            o.customerName,
            o.amount,
            o.status,
            o.date
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${c}"`).join(',')) // 값에 쉼표가 있을 수 있으므로 따옴표 처리
        ].join('\n');

        // BOM(Byte Order Mark) 추가하여 엑셀에서 한글 깨짐 방지
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // 다운로드 링크 생성 및 클릭
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `new_orders_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
        <Layout title="신규 주문">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h3 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        신규 주문 관리 
                        <span className="text-primary-600 text-lg bg-primary-50 px-3 py-1 rounded-full">{orders.length}</span>
                    </h3>
                    <p className="text-slate-500 mt-1">모든 채널의 신규 주문을 확인하고 관리하세요.</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={loadOrders}
                        className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        title="새로고침"
                    >
                        <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                    </button>
                    <button 
                        onClick={handleExcelDownload}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${
                            hasAccess 
                            ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200" 
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }`}
                    >
                        {!hasAccess && <Lock size={14} />}
                        <Download size={18} /> 엑셀 다운로드
                    </button>
                    <button 
                        onClick={handleConfirmOrders}
                        disabled={selected.length === 0}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${
                            selected.length === 0 
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                            : hasAccess 
                                ? "bg-primary-600 hover:bg-primary-700 text-white shadow-primary-200"
                                : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }`}
                    >
                         {!hasAccess && <Lock size={14} />}
                        <CheckCircle size={18} /> 발주 확인 ({selected.length})
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                {/* Table Toolbar */}
                <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
                     <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                            type="text" 
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                            placeholder="주문번호, 구매자명 검색..."
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <Filter size={16} /> 필터
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <p className="text-sm font-medium">주문 목록을 불러오는 중...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <CheckCircle size={48} className="text-slate-200 mb-4" />
                        <p className="text-lg font-bold text-slate-600">신규 주문이 없습니다.</p>
                        <p className="text-sm">모든 주문을 확인했습니다.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-4 w-12 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selected.length === orders.length && orders.length > 0}
                                            onChange={toggleSelectAll}
                                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" 
                                        />
                                    </th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">판매처</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">주문번호</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">상품 정보</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">구매자</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">결제금액</th>
                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">상태</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {orders.map((order) => (
                                    <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${selected.includes(order.id) ? 'bg-blue-50/30' : ''}`}>
                                        <td className="p-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selected.includes(order.id)}
                                                onChange={() => toggleSelect(order.id)}
                                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" 
                                            />
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold text-white
                                                ${order.platform === 'NAVER' ? 'bg-green-500' : 
                                                order.platform === 'COUPANG' ? 'bg-red-500' : 'bg-slate-500'}`}>
                                                {getPlatformName(order.platform)}
                                            </span>
                                        </td>
                                        <td className="p-4 font-mono text-sm text-slate-600">{order.orderNumber}</td>
                                        <td className="p-4">
                                            <p className="text-sm font-bold text-slate-900">{order.productName}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">옵션: {order.option}</p>
                                        </td>
                                        <td className="p-4 text-sm text-slate-700">{order.customerName}</td>
                                        <td className="p-4 text-sm font-bold text-slate-900 text-right">₩{order.amount.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-100">
                                                신규
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default NewOrders;