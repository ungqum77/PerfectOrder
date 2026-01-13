import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { ShoppingBag, Package, AlertCircle, TrendingUp, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SALES_DATA } from '../constants';
import { mockSupabase } from '../lib/mockSupabase';
import { Order } from '../types';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ label, value, sub, icon: Icon, colorClass, path }: any) => {
    const navigate = useNavigate();
    return (
        <div 
            onClick={() => navigate(path)}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${colorClass}`}>
                    <Icon size={22} className="opacity-90" />
                </div>
                <div className="flex items-center text-slate-400 group-hover:text-primary-600 transition-colors">
                    <ArrowRight size={18} />
                </div>
            </div>
            <p className="text-slate-500 text-sm font-semibold mb-1">{label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{value}</h3>
            <p className="text-xs font-medium text-slate-400">{sub}</p>
        </div>
    );
};

const Dashboard = () => {
    const [counts, setCounts] = useState({ new: 0, pending: 0, claims: 2 });
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);

    useEffect(() => {
        const loadStats = async () => {
            const orders = await mockSupabase.db.orders.getAll();
            setCounts({
                new: orders.filter(o => o.status === 'NEW').length,
                pending: orders.filter(o => o.status === 'PENDING').length,
                claims: 2 // Mock data fixed for now
            });
            setRecentOrders(orders.slice(0, 5));
        };
        loadStats();
    }, []);

    return (
        <Layout title="대시보드">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard 
                    label="신규 주문" 
                    value={counts.new} 
                    sub="지금 확인 필요" 
                    icon={ShoppingBag} 
                    colorClass="bg-blue-50 text-blue-600"
                    path="/new-orders"
                />
                <StatCard 
                    label="발송 대기" 
                    value={counts.pending} 
                    sub="송장 입력 필요" 
                    icon={Package} 
                    colorClass="bg-amber-50 text-amber-600"
                    path="/pending"
                />
                <StatCard 
                    label="클레임" 
                    value={counts.claims} 
                    sub="반품 1, 취소 1" 
                    icon={AlertCircle} 
                    colorClass="bg-red-50 text-red-600"
                    path="/claims"
                />
                <StatCard 
                    label="총 매출" 
                    value="₩2.4M" 
                    sub="이번 달 +12.5%" 
                    icon={TrendingUp} 
                    colorClass="bg-emerald-50 text-emerald-600"
                    path="/analysis"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Chart */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">주간 매출 현황</h3>
                            <p className="text-sm text-slate-500">전체 채널 매출 분석</p>
                        </div>
                        <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg px-3 py-2 outline-none">
                            <option>이번 주</option>
                            <option>지난 주</option>
                        </select>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={SALES_DATA}>
                                <defs>
                                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 12, fill: '#94a3b8'}} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 12, fill: '#94a3b8'}} 
                                    tickFormatter={(value) => `${value / 1000}k`}
                                />
                                <Tooltip 
                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    formatter={(value: number) => [`₩${value.toLocaleString()}`, '매출']}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="amount" 
                                    stroke="#3b82f6" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorAmount)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Orders List */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 mb-6">최근 활동</h3>
                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                        {recentOrders.map((order) => (
                            <div key={order.id} className="flex items-center gap-4">
                                <div className={`size-10 rounded-full flex items-center justify-center shrink-0 font-bold text-[10px] text-white
                                    ${order.platform === 'NAVER' ? 'bg-green-500' : 
                                      order.platform === 'COUPANG' ? 'bg-red-500' : 'bg-slate-400'}`}>
                                    {order.platform === 'NAVER' ? 'N' : order.platform === 'COUPANG' ? 'C' : order.platform[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-900 truncate">{order.productName}</p>
                                    <p className="text-xs text-slate-500 flex items-center gap-2">
                                        <span>{order.customerName}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span>{order.date}</span>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-slate-900">₩{order.amount.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-6 py-3 rounded-xl bg-slate-50 text-slate-600 text-sm font-bold hover:bg-slate-100 transition-colors">
                        전체 활동 보기
                    </button>
                </div>
            </div>
        </Layout>
    );
};

export default Dashboard;