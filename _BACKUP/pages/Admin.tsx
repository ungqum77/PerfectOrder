import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { mockSupabase } from '../lib/mockSupabase';
import { User } from '../types';
import { useNavigate } from 'react-router-dom';

const Admin = () => {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState<User[]>([]);
    const [announcement, setAnnouncement] = useState('');

    useEffect(() => {
        if (user && user.role !== 'ADMIN') {
            alert("관리자 권한이 없습니다.");
            navigate('/');
            return;
        }

        const loadUsers = async () => {
            const data = await mockSupabase.db.users.getAll();
            setUsers(data);
        };
        loadUsers();
    }, [user, navigate]);

    const extendSubscription = async (targetUserId: string) => {
        const target = users.find(u => u.id === targetUserId);
        if (!target) return;

        // Add 30 days to existing sub end or now
        const currentEnd = target.subscriptionEndsAt ? new Date(target.subscriptionEndsAt).getTime() : Date.now();
        const newEnd = new Date(currentEnd + 30 * 24 * 60 * 60 * 1000).toISOString();

        await mockSupabase.db.users.update(targetUserId, {
            plan: 'PRO',
            subscriptionEndsAt: newEnd
        });
        
        // Refresh local list
        const updatedUsers = await mockSupabase.db.users.getAll();
        setUsers(updatedUsers);
        alert(`${target.name}님의 구독을 1개월 연장했습니다.`);
    };

    return (
        <Layout title="관리자 설정">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Announcement Config */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">공지사항 관리</h3>
                    <textarea 
                        className="w-full h-32 border border-slate-200 rounded-xl p-4 text-sm resize-none focus:ring-2 focus:ring-primary-100 outline-none"
                        placeholder="전체 사용자에게 보낼 공지사항을 입력하세요..."
                        value={announcement}
                        onChange={e => setAnnouncement(e.target.value)}
                    ></textarea>
                    <div className="mt-4 flex justify-end">
                        <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800">
                            공지사항 게시
                        </button>
                    </div>
                </div>

                {/* User Management */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                    <h3 className="text-lg font-bold text-slate-900 mb-4">사용자 관리 ({users.length}명)</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                                <tr>
                                    <th className="p-3">이름</th>
                                    <th className="p-3">이메일</th>
                                    <th className="p-3">플랜</th>
                                    <th className="p-3">가입일</th>
                                    <th className="p-3">구독 만료일</th>
                                    <th className="p-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map(u => (
                                    <tr key={u.id} className="text-sm">
                                        <td className="p-3 font-bold">{u.name} {u.role === 'ADMIN' && '(관리자)'}</td>
                                        <td className="p-3 text-slate-500">{u.email}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${u.plan === 'PRO' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {u.plan}
                                            </span>
                                        </td>
                                        <td className="p-3 text-slate-500">{new Date(u.joinedAt).toLocaleDateString()}</td>
                                        <td className="p-3 text-slate-500">
                                            {u.subscriptionEndsAt ? new Date(u.subscriptionEndsAt).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button 
                                                onClick={() => extendSubscription(u.id)}
                                                className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-100 border border-emerald-200"
                                            >
                                                +1개월 연장
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default Admin;
