'use client';

import React, { useState, useEffect, useRef } from 'react';
import { mockSupabase } from '@/lib/mockSupabase';
import { Order } from '@/types';
import { Truck, Lock, RefreshCw, Loader2, Upload, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';

// 국내 주요 택배사 목록
const COURIERS = [
    "CJ대한통운", "우체국택배", "한진택배", "롯데택배", "로젠택배", "경동택배", "대신택배", "일양로지스",
    "합동택배", "천일택배", "건영택배", "CU편의점택배", "GSPostbox택배", "한의사랑택배", "다방택배",
    "굿투럭", "호남택배", "원더스퀵", "농협택배", "SLX택배", "GTS로지스", "성원글로벌", "용마로지스",
    "삼다수가정배송", "로지스밸리", "농협하나로마트", "오늘회러쉬", "투데이", "큐런", "GSI익스프레스"
];

const PendingPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState<string[]>([]); // 상세 정보 토글용
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { checkPermission } = useAuth();
    const router = useRouter();
    const hasAccess = checkPermission();

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setIsLoading(true);
        setTimeout(async () => {
            const allOrders = await mockSupabase.db.orders.getAll();
            setOrders(allOrders.filter((o: Order) => o.status === 'PENDING'));
            setIsLoading(false);
        }, 500);
    };

    const toggleRow = (id: string) => {
        setExpandedRows(prev =>
            prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
        );
    };

    // 개별 송장 번호 업데이트 핸들러
    const handleInvoiceChange = (id: string, value: string) => {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, invoiceNumber: value } : o));
    };

    // 개별 택배사 변경 핸들러
    const handleCourierChange = (id: string, value: string) => {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, courier: value } : o));
    };

    // 송장 전송 (상태 변경)
    const handleDispatch = async (orderId?: string) => {
        if (!hasAccess) {
            if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                router.push('/subscription');
            }
            return;
        }

        const targets = orderId
            ? orders.filter(o => o.id === orderId)
            : orders.filter(o => o.invoiceNumber && o.courier); // 전체 전송 시 송장번호 있는 것만

        if (targets.length === 0) {
            alert("전송할 주문이 없거나 송장번호가 입력되지 않았습니다.");
            return;
        }

        if (confirm(`${targets.length}건의 송장을 전송하고 '배송 중' 상태로 변경하시겠습니까?`)) {
            setIsLoading(true);

            // 실제 로직: API로 마켓에 송장 전송 후 DB 업데이트
            // 여기서는 DB 업데이트만 시뮬레이션
            const targetIds = targets.map(t => t.id);
            await mockSupabase.db.orders.updateStatus(targetIds, 'SHIPPING');

            await loadOrders();
            setIsLoading(false);
            alert("처리가 완료되었습니다.");
        }
    }

    // 엑셀(CSV) 대량 업로드 핸들러
    const handleBulkUploadClick = () => {
        if (!hasAccess) {
            if (confirm("이 기능은 구독 회원 전용입니다. 구독 페이지로 이동하시겠습니까?")) {
                router.push('/subscription');
            }
            return;
        }
        fileInputRef.current?.click();
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            // CSV 파싱 (간이)
            const lines = text.split('\n');
            let updatedCount = 0;

            const newOrders = [...orders];

            lines.forEach(line => {
                // CSV 포맷 가정: 주문번호, 택배사, 송장번호
                const [orderNum, courier, invoice] = line.split(',').map(s => s.trim().replace(/"/g, ''));
                if (orderNum && invoice) {
                    const targetIndex = newOrders.findIndex(o => o.orderNumber === orderNum);
                    if (targetIndex >= 0) {
                        newOrders[targetIndex].courier = courier || newOrders[targetIndex].courier || 'CJ대한통운';
                        newOrders[targetIndex].invoiceNumber = invoice;
                        updatedCount++;
                    }
                }
            });

            if (updatedCount > 0) {
                setOrders(newOrders);
                alert(`${updatedCount}건의 송장 정보가 입력되었습니다.\n저장하려면 '전체 송장 전송'을 눌러주세요.`);
            } else {
                alert("일치하는 주문번호를 찾지 못했습니다.\nCSV 형식을 확인해주세요: 주문번호, 택배사, 송장번호");
            }
        };
        reader.readAsText(file);
        // Reset file input
        e.target.value = '';
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
            <Header title="배송 준비" />
            <div className="p-8 max-w-[1600px] w-full mx-auto animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 flex flex-wrap gap-4 justify-between items-center shadow-sm">
                    <div className="flex gap-6 items-center">
                        <div className="flex flex-col">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">조회 기간</label>
                            <div className="text-slate-900 font-bold text-sm mt-1">최근 30일</div>
                        </div>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <div className="flex flex-col w-64">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">검색</label>
                            <input type="text" className="bg-transparent border-none p-0 text-sm font-medium focus:ring-0 placeholder-slate-300 mt-1" placeholder="주문번호, 수령자명, 상품명" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={handleBulkUploadClick}
                            className="px-4 py-3 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                        >
                            {!hasAccess && <Lock size={14} />}
                            <FileSpreadsheet size={18} className="text-emerald-600" />
                            엑셀 대량 등록
                        </button>
                        <button onClick={loadOrders} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                        </button>
                        <button
                            onClick={() => handleDispatch()}
                            disabled={orders.length === 0}
                            className={`px-6 py-3 rounded-xl text-sm font-bold shadow-md transition-colors flex items-center gap-2 ${orders.length === 0
                                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                    : hasAccess
                                        ? "bg-slate-900 text-white hover:bg-slate-800"
                                        : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                }`}
                        >
                            {!hasAccess && <Lock size={14} />}
                            <Truck size={16} /> 전체 송장 전송
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px] flex flex-col">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <Loader2 className="animate-spin mb-2" size={32} />
                            <p className="text-sm font-medium">데이터 로딩 중...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-xs font-bold text-slate-500 uppercase">
                                        <th className="p-4 w-8"></th>
                                        <th className="p-4 w-12"><input type="checkbox" className="rounded border-gray-300" /></th>
                                        <th className="p-4">판매처/주문일</th>
                                        <th className="p-4">주문정보(번호/ID)</th>
                                        <th className="p-4">상품정보</th>
                                        <th className="p-4">수령자 정보</th>
                                        <th className="p-4">배송 관리 (택배사/송장)</th>
                                        <th className="p-4 w-24">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.length === 0 ? (
                                        <tr><td colSpan={8} className="p-12 text-center text-slate-500">처리할 배송 건이 없습니다.</td></tr>
                                    ) : orders.map((order) => (
                                        <React.Fragment key={order.id}>
                                            <tr className={`hover:bg-slate-50 transition-colors ${expandedRows.includes(order.id) ? 'bg-slate-50' : ''}`}>
                                                <td className="p-4 text-center cursor-pointer" onClick={() => toggleRow(order.id)}>
                                                    {expandedRows.includes(order.id) ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                                                </td>
                                                <td className="p-4"><input type="checkbox" className="rounded border-gray-300" /></td>
                                                <td className="p-4">
                                                    <div className="font-bold text-slate-800 text-sm">{getPlatformName(order.platform)}</div>
                                                    <div className="text-xs text-slate-400 mt-0.5">{order.date.split(' ')[0]}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-sm font-mono text-primary-700 font-medium">{order.orderNumber}</div>
                                                    {order.ordererId && <div className="text-xs text-slate-400 mt-0.5">ID: {order.ordererId}</div>}
                                                </td>
                                                <td className="p-4 max-w-[300px] truncate">
                                                    <div className="text-sm font-bold text-slate-900 truncate" title={order.productName}>{order.productName}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5 truncate" title={order.option}>옵션: {order.option}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-sm font-bold text-slate-900">{order.receiverName}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{order.receiverPhone}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex gap-2">
                                                        <select
                                                            value={order.courier || 'CJ대한통운'}
                                                            onChange={(e) => handleCourierChange(order.id, e.target.value)}
                                                            className="text-sm rounded-lg border-slate-200 bg-white py-1.5 px-2 focus:border-primary-500 focus:ring-primary-500 w-32"
                                                        >
                                                            {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={order.invoiceNumber || ''}
                                                            onChange={(e) => handleInvoiceChange(order.id, e.target.value)}
                                                            className="w-40 text-sm border border-amber-200 bg-amber-50 rounded-lg py-1.5 px-3 placeholder-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200 font-mono"
                                                            placeholder="송장번호"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <button
                                                        onClick={() => handleDispatch(order.id)}
                                                        className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors shadow-sm"
                                                    >
                                                        전송
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* 상세 정보 확장 영역 */}
                                            {expandedRows.includes(order.id) && (
                                                <tr className="bg-slate-50 border-b border-slate-100">
                                                    <td colSpan={8} className="p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">주문 상세</h5>
                                                                <div className="flex justify-between"><span className="text-slate-500">주문금액</span> <span className="font-mono font-bold">₩{order.amount.toLocaleString()}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">결제일시</span> <span className="text-slate-700">{order.paymentDate || '-'}</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">상품번호</span> <span className="text-slate-700 font-mono">{order.productId || '-'}</span></div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">주문자/수령자 상세</h5>
                                                                <div className="flex justify-between"><span className="text-slate-500">주문자명</span> <span className="text-slate-700">{order.ordererName} ({order.ordererPhone})</span></div>
                                                                <div className="flex justify-between"><span className="text-slate-500">주소</span> <span className="text-slate-700 text-right break-words w-48">{order.receiverAddress}</span></div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <h5 className="font-bold text-slate-900 border-b pb-2 mb-2">배송 요청사항</h5>
                                                                <p className="text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 min-h-[60px]">
                                                                    {order.shippingMemo || '요청사항 없음'}
                                                                </p>
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

export default PendingPage;
