'use client';

import React, { useState, useEffect } from 'react';
import { mockSupabase } from '@/lib/mockSupabase';
import { Order } from '@/types';
import { Download, CheckCircle, Search, Filter, Lock, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';

const NewOrdersPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState<string[]>([]);
    const { checkPermission } = useAuth();
    const router = useRouter();
    const hasAccess = checkPermission();

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setIsLoading(true);
        // 네트워크 딜레이 시뮬레이션
        setTimeout(async () => {
            const allOrders = await mockSupabase.db.orders.getAll();
            setOrders(allOrders.filter((o: Order) => o.status === 'NEW'));
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

    const toggleRow = (id: string) => {
        setExpandedRows(prev =>
            prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
        );
    };

    const handleConfirmOrders = async () => {
        if (selected.length === 0) return alert("주문을 선택해주세요.");

        if (!hasAccess) {
            if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                router.push('/subscription');
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
                router.push('/subscription');
            }
            return;
        }

        if (orders.length === 0) {
            alert("다운로드할 주문이 없습니다.");
            return;
        }

        // CSV 데이터 생성 (확장된 필드 반영)
        const headers = [
            '주문번호', '판매처', '상품명', '옵션', '수량', '주문금액',
            '주문자명', '주문자전화', '수령자명', '수령자전화', '수령자주소', '배송메모',
            '주문일시', '상태'
        ];

        const rows = orders.map(o => [
            o.orderNumber,
            o.platform,
            o.productName,
            o.option,
            '1', // 수량 필드가 없으므로 기본 1
            o.amount,
            o.ordererName,
            o.ordererPhone,
            o.receiverName,
            o.receiverPhone,
            o.receiverAddress,
            o.shippingMemo,
            o.date,
            o.status
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `new_orders_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getPlatformName = (platform: string) => {
        switch (platform) {
            case 'NAVER': return '네이버';
            case 'COUPANG': return '쿠팡';
            case '11ST': return '11번가';
            case 'GMARKET': return '지마켓';
            default: return platform;
        }
    }

    return (
        <>
            <Header title="신규 주문" />
            <div className="p-8 max-w-[1600px] w-full mx-auto animate-fade-in">
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
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${hasAccess
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
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-all ${selected.length === 0
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
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        <th className="p-4 w-8"></th>
                                        <th className="p-4 w-12 text-center">
                                            <input
                                                type="checkbox"
                                                checked={selected.length === orders.length && orders.length > 0}
                                                onChange={toggleSelectAll}
                                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-4">판매처/주문일</th>
                                        <th className="p-4">주문번호</th>
                                        <th className="p-4 w-1/3">상품 정보</th>
                                        <th className="p-4">구매자/수령자</th>
                                        <th className="p-4 text-right">결제금액</th>
                                        <th className="p-4 text-center">상태</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.map((order) => (
                                        <React.Fragment key={order.id}>
                                            <tr className={`hover:bg-slate-50 transition-colors ${selected.includes(order.id) ? 'bg-blue-50/30' : ''}`}>
                                                <td className="p-4 text-center cursor-pointer" onClick={() => toggleRow(order.id)}>
                                                    {expandedRows.includes(order.id) ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.includes(order.id)}
                                                        onChange={() => toggleSelect(order.id)}
                                                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`w-fit px-2.5 py-0.5 rounded-md text-[10px] font-bold text-white
                                                            ${order.platform === 'NAVER' ? 'bg-green-500' :
                                                                order.platform === 'COUPANG' ? 'bg-red-500' : 'bg-slate-500'}`}>
                                                            {getPlatformName(order.platform)}
                                                        </span>
                                                        <span className="text-xs text-slate-400">{order.date.split(' ')[0]}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 font-mono text-sm text-slate-600 font-bold">{order.orderNumber}</td>
                                                <td className="p-4 max-w-[300px] truncate">
                                                    <p className="text-sm font-bold text-slate-900 truncate" title={order.productName}>{order.productName}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate" title={order.option}>옵션: {order.option}</p>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-sm text-slate-900 font-bold">{order.ordererName}</div>
                                                    <div className="text-xs text-slate-500">{order.receiverName}</div>
                                                </td>
                                                <td className="p-4 text-sm font-bold text-slate-900 text-right font-mono">₩{order.amount.toLocaleString()}</td>
                                                <td className="p-4 text-center">
                                                    <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-full text-[10px] font-bold border border-red-100">
                                                        신규
                                                    </span>
                                                </td>
                                            </tr>
                                            {/* 상세 정보 확장 영역 */}
                                            {expandedRows.includes(order.id) && (
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <td colSpan={8} className="p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">수령자 정보</h5>
                                                                <div className="flex justify-between"><span className="text-slate-500">이름</span> <span className="font-bold">{order.receiverName}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">전화번호</span> <span>{order.receiverPhone}</span></div>
                                                                <div className="flex flex-col gap-1 mt-1">
                                                                    <span className="text-slate-500">주소</span>
                                                                    <span className="text-slate-700 font-medium break-words bg-slate-50 p-2 rounded border border-slate-100">{order.receiverAddress}</span>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">주문자 정보</h5>
                                                                <div className="flex justify-between"><span className="text-slate-500">이름</span> <span className="font-bold">{order.ordererName}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">전화번호</span> <span>{order.ordererPhone}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">ID</span> <span className="font-mono text-slate-600">{order.ordererId || '-'}</span></div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">기타 정보</h5>
                                                                <div className="flex justify-between"><span className="text-slate-500">상품번호</span> <span className="font-mono">{order.productId || '-'}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">결제일시</span> <span>{order.paymentDate || '-'}</span></div>
                                                                <div className="mt-2">
                                                                    <span className="text-slate-500 text-xs">배송메모</span>
                                                                    <p className="text-slate-700 bg-amber-50 p-2 rounded border border-amber-100 mt-1 text-xs">
                                                                        {order.shippingMemo || '없음'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default NewOrdersPage;
