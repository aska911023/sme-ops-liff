import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Clock, CalendarDays, Package, LayoutGrid } from 'lucide-react'
import Home from './pages/Home'
import ClockPage from './pages/Clock'
import Salary from './pages/Salary'
import Leave from './pages/Leave'
import InventoryPage from './pages/Inventory'
import Tasks from './pages/Tasks'
import Expenses from './pages/Expenses'
import NewCustomer from './pages/NewCustomer'

function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tabs = [
    { path: '/', icon: <LayoutGrid />, label: '首頁' },
    { path: '/clock', icon: <Clock />, label: '打卡' },
    { path: '/leave', icon: <CalendarDays />, label: '請假' },
    { path: '/inventory', icon: <Package />, label: '庫存' },
  ]
  return (
    <div className="tab-bar">
      {tabs.map(t => (
        <button
          key={t.path}
          className={`tab-item ${pathname === t.path ? 'active' : ''}`}
          onClick={() => navigate(t.path)}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const { loading, error, employee } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div style={{ color: 'var(--t3)', fontSize: 13 }}>載入中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 48 }}>😵</div>
        <div style={{ color: 'var(--t2)', fontSize: 14, textAlign: 'center', padding: '0 32px', marginBottom: 16 }}>{error}</div>
        <div style={{ fontSize: 11, color: 'var(--t3)', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, maxWidth: '80%', wordBreak: 'break-all' }}>
          LIFF ID: {import.meta.env.VITE_LIFF_ID || '(未設定)'}
        </div>
      </div>
    )
  }

  if (!employee) {
    const uid = lineProfile?.lineUserId || ''
    return (
      <div className="loading-screen">
        <div style={{ fontSize: 48 }}>🔗</div>
        <div style={{ color: 'var(--t2)', fontSize: 14, textAlign: 'center', padding: '0 32px', marginBottom: 20 }}>
          尚未綁定員工帳號<br />請將下方 ID 提供給管理員
        </div>
        {uid && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>你的 LINE User ID：</div>
            <div
              onClick={() => { navigator.clipboard?.writeText(uid); alert('已複製！') }}
              style={{
                padding: '10px 20px', borderRadius: 10,
                background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.3)',
                color: 'var(--cyan)', fontSize: 13, fontWeight: 700,
                fontFamily: 'monospace', wordBreak: 'break-all',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              {uid}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>點擊上方可複製</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/clock" element={<ClockPage />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/customer/new" element={<NewCustomer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  )
}
