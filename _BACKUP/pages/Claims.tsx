import React, { useState } from 'react';
import Layout from '../components/Layout';
import { MOCK_CLAIMS } from '../constants';
import { Claim } from '../types';
import { X, Check, XCircle } from 'lucide-react';

const Claims = () => {
    const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

    const getStatusName = (status: string) => {
        switch(status) {
            case 'REQUESTED': return '요청됨';
            case 'APPROVED': return '승인됨';
            case 'REJECTED': return '반려됨';
            default: return status;
        }
    }

    const getTypeName = (type: string) => {
        switch(type) {
            case 'RETURN': return '반품';
            case 'EXCHANGE': return '교환';
            case 'CANCEL': return '취소';
            default: return type;
        }
    }

    return (
        <Layout title="클레임 관리">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
                <div className="flex border-b border-slate-200">
                    <button className="px-8 py-4 border-b-2 border-primary-600 text-primary-600 font-bold text-sm bg-primary-50/50">반품 (1)</button>
                    <button className="px-8 py-4 border-b-2 border-transparent text-slate-500 text-sm font-medium hover:text-slate-800 hover:bg-slate-50">취소 (1)</button>
                    <button className="px-8 py-4 border-b-2 border-transparent text-slate-500 text-sm font-medium hover:text-slate-800 hover:bg-slate-50">교환 (0)</button>
                </div>
                
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 border-b border-slate-200">
                        <tr>
                            <th className="p-4">구분</th>
                            <th className="p-4">주문번호</th>
                            <th className="p-4">상품명</th>
                            <th className="p-4">사유</th>
                            <th className="p-4">상태</th>
                            <th className="p-4 text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {MOCK_CLAIMS.map((claim) => (
                            <tr 
                                key={claim.id} 
                                onClick={() => setSelectedClaim(claim)} 
                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold
                                        ${claim.type === 'RETURN' ? 'bg-red-50 text-red-600 border border-red-100' : 
                                          'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                        {getTypeName(claim.type)}
                                    </span>
                                </td>
                                <td className="p-4 text-sm text-slate-600">{claim.orderId}</td>
                                <td className="p-4 font-bold text-slate-900 text-sm">{claim.productName}</td>
                                <td className="p-4 text-sm text-slate-500 max-w-xs truncate">{claim.reason}</td>
                                <td className="p-4">
                                    <span className={`text-xs font-bold
                                        ${claim.status === 'REQUESTED' ? 'text-orange-500' : 'text-green-500'}`}>
                                        {getStatusName(claim.status)}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <button className="text-primary-600 text-sm font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                                        상세보기
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Claim Detail Modal */}
            {selectedClaim && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl scale-100 animate-scale-in">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-900">클레임 상세 정보</h3>
                            <button 
                                onClick={() => setSelectedClaim(null)}
                                className="size-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">구매자</p>
                                    <p className="font-bold text-slate-900">{selectedClaim.customerName}</p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">일시</p>
                                    <p className="font-bold text-slate-900">{selectedClaim.date}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 p-4 border border-slate-100 rounded-xl">
                                <div className="size-20 bg-slate-100 rounded-lg shrink-0"></div>
                                <div>
                                    <p className="font-bold text-slate-900">{selectedClaim.productName}</p>
                                    <p className="text-sm text-slate-500 mt-1">Ref ID: {selectedClaim.orderId}</p>
                                </div>
                            </div>

                            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                <p className="text-xs font-bold text-red-800 uppercase mb-2">반품/취소 사유</p>
                                <p className="text-sm text-red-700 leading-relaxed">{selectedClaim.reason}</p>
                            </div>

                            {selectedClaim.images.length > 0 && (
                                <div>
                                    <p className="font-bold text-slate-900 mb-3">증빙 사진</p>
                                    <div className="flex gap-3 overflow-x-auto pb-2">
                                        {selectedClaim.images.map((img, i) => (
                                            <img key={i} src={img} alt="Evidence" className="size-24 rounded-lg object-cover border border-slate-200 shadow-sm" />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                            <button 
                                onClick={() => setSelectedClaim(null)} 
                                className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                닫기
                            </button>
                            <button className="px-6 py-2.5 bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold flex items-center gap-2 hover:bg-red-200 transition-colors">
                                <XCircle size={18} /> 거부
                            </button>
                            <button className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-700 shadow-lg shadow-primary-200 transition-colors">
                                <Check size={18} /> 승인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default Claims;
