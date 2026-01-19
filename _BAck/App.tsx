import React from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import NewOrders from './pages/NewOrders';
import Claims from './pages/Claims';
import Pending from './pages/Pending';
import Subscription from './pages/Subscription';
import Integration from './pages/Integration';
import Admin from './pages/Admin';
import Layout from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';

// Protected Route Component
const ProtectedRoute = () => {
    const { user, loading } = useAuth();
    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
    return user ? <Outlet /> : <Navigate to="/login" replace />;
};

const App = () => {
    return (
        <AuthProvider>
            <HashRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    
                    <Route element={<ProtectedRoute />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/new-orders" element={<NewOrders />} />
                        <Route path="/claims" element={<Claims />} />
                        <Route path="/pending" element={<Pending />} />
                        <Route path="/subscription" element={<Subscription />} />
                        <Route path="/integration" element={<Integration />} />
                        <Route path="/admin" element={<Admin />} />
                        
                        <Route path="/delivery" element={<LayoutPlaceholder title="배송 현황" />} />
                        <Route path="/settlement" element={<LayoutPlaceholder title="정산 관리" />} />
                        <Route path="/analysis" element={<LayoutPlaceholder title="매출 분석" />} />
                    </Route>
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </HashRouter>
        </AuthProvider>
    );
};

const LayoutPlaceholder = ({ title }: { title: string }) => {
    return (
        <Layout title={title}>
            <div className="flex flex-col items-center justify-center h-[50vh] text-slate-400">
                <div className="size-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">🚧</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">준비 중입니다</h3>
                <p>서비스 준비 중입니다.</p>
            </div>
        </Layout>
    )
}

export default App;
