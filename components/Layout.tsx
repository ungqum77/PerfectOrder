import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Package2, 
  Truck, 
  AlertTriangle, 
  Wallet, 
  Link as LinkIcon, 
  BarChart3, 
  Bell, 
  LogOut,
  RefreshCw,
  Search,
  CreditCard,
  ShieldAlert,
  Database,
  Wifi,
  WifiOff,
  CloudCog,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mockSupabase } from '../lib/mockSupabase';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

const Sidebar = () => {
  const location = useLocation();
  const { user, logout, checkPermission } = useAuth();
  const isActive = (path: string) => location.pathname === path;
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

  // 빌드 타임 (MM.DD.HH.MM)
  const buildVersion = "1.0.9 (05.24.16.30)";

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
              to={item.path} 
              className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group ${
                active 
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
                    <Link to="/subscription" className="text-[10px] text-orange-600 underline mt-1 block">구독하러 가기 &rarr;</Link>
                </div>
            )}
            {hasAccess && user?.plan === 'FREE' && (
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

const Header = ({ title }: { title: string }) => {
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
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${
            dbStatus === 'CONNECTED' 
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

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen flex flex-col">
        <Header title={title} />
        <div className="p-8 max-w-[1600px] w-full mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;