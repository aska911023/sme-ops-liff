import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { ClipboardList, Users, Package, DollarSign } from 'lucide-react'

// Hub pages (4 tabs)
import HRHub from './pages/HRHub'
import CRMHub from './pages/CRMHub'
import WMSHub from './pages/WMSHub'
import SalesHub from './pages/SalesHub'

// HR pages
import ClockPage from './pages/Clock'
import Salary from './pages/Salary'
import Leave from './pages/Leave'
import Tasks from './pages/Tasks'
import TaskNew from './pages/TaskNew'
import Dashboard from './pages/Dashboard'
import Todo from './pages/Todo'
import Expenses from './pages/Expenses'
import OffRequest from './pages/OffRequest'
import BusinessTrip from './pages/BusinessTrip'
import LeaveOfAbsence from './pages/LeaveOfAbsence'
import Overtime from './pages/Overtime'
import Approve from './pages/Approve'
import TaskConfirmations from './pages/TaskConfirmations'
import ClockCorrection from './pages/ClockCorrection'
import MySchedule from './pages/MySchedule'
import ApprovalStatus from './pages/ApprovalStatus'
import ExpenseRequest from './pages/ExpenseRequest'
import CoverInvitations from './pages/CoverInvitations'
import LeaveBalance from './pages/LeaveBalance'
import Documents from './pages/Documents'
import Benefits from './pages/Benefits'
import Training from './pages/Training'
import Performance from './pages/Performance'
import RejectReasonPopup from './pages/RejectReasonPopup'

// CRM pages
import NewCustomer from './pages/NewCustomer'
import CustomerLookup from './pages/crm/CustomerLookup'
import MemberLookup from './pages/crm/MemberLookup'
import ServiceTickets from './pages/crm/ServiceTickets'

// WMS pages
import InventoryPage from './pages/Inventory'
import WMSInbound from './pages/wms/Inbound'
import WMSOutbound from './pages/wms/Outbound'
import WMSStockCount from './pages/wms/StockCount'
import WMSTransfers from './pages/wms/Transfers'

// Sales pages
import POSMobile from './pages/sales/POSMobile'
import SalesOrders from './pages/sales/Orders'
import SalesQuotations from './pages/sales/Quotations'
import SalesReturns from './pages/sales/Returns'
import SalesCommission from './pages/sales/Commission'

// LINE rejects LIFF URIs with sub-paths, so the BOT links us with ?to=/route.
// Other query params (e.g. ?to=/tasks&task=123&filter=all) must be forwarded
// to the target route so BOT deep-links like 「更新任務」can pre-open the right task.
function LiffDeepLinkRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const to = params.get('to')
    if (!to || !to.startsWith('/')) return
    params.delete('to')
    const rest = params.toString()
    const target = rest ? `${to}${to.includes('?') ? '&' : '?'}${rest}` : to
    navigate(target, { replace: true })
  }, [])
  return null
}

function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const tabs = [
    { path: '/', icon: <ClipboardList size={20} />, label: 'HR', match: ['/', '/clock', '/salary', '/leave', '/leave-balance', '/tasks', '/expenses', '/off-request', '/business-trip', '/leave-of-absence', '/overtime', '/approve', '/task-confirmations', '/clock-correction', '/my-schedule', '/approval-status', '/expense-request', '/dashboard', '/todo', '/documents', '/benefits', '/training', '/performance'] },
    { path: '/crm', icon: <Users size={20} />, label: 'CRM', match: ['/crm', '/customer'] },
    { path: '/wms', icon: <Package size={20} />, label: 'WMS', match: ['/wms', '/inventory'] },
    { path: '/sales', icon: <DollarSign size={20} />, label: 'Sales', match: ['/sales'] },
  ]

  const activeTab = tabs.find(t => t.match.some(m => pathname === m || (m !== '/' && pathname.startsWith(m))))

  return (
    <div className="tab-bar">
      {tabs.map(t => (
        <button
          key={t.path}
          className={`tab-item ${activeTab?.path === t.path ? 'active' : ''}`}
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
  const { loading, error, employee, lineProfile } = useAuth()

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
        <div style={{ fontSize: 11, color: 'var(--t3)', padding: '8px 16px', background: 'var(--glass)', borderRadius: 8, maxWidth: '80%', wordBreak: 'break-all' }}>
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
        <div style={{ color: 'var(--t2)', fontSize: 15, textAlign: 'center', padding: '0 32px', marginBottom: 20, fontWeight: 600 }}>
          尚未綁定員工帳號
        </div>
        <div style={{
          padding: '14px 18px', margin: '0 24px 20px', borderRadius: 12,
          background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.3)',
          maxWidth: 360,
        }}>
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700, marginBottom: 6 }}>
            🚀 推薦：自助綁定
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
            回 LINE 對話框傳訊給機器人：<br />
            <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
              /註冊 你的姓名
            </code>
            <br />
            （例：<code>/註冊 張小明</code>），完成後重開此頁。
          </div>
        </div>
        {uid && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>無法自助？把這串 ID 給管理員：</div>
            <div
              onClick={() => { navigator.clipboard?.writeText(uid); alert('已複製！') }}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--t2)', fontSize: 11,
                fontFamily: 'monospace', wordBreak: 'break-all',
                cursor: 'pointer', textAlign: 'center', maxWidth: 320,
              }}
            >
              {uid}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>點擊複製</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <LiffDeepLinkRedirect />
      <Routes>
        {/* HR Hub + pages */}
        <Route path="/" element={<HRHub />} />
        <Route path="/clock" element={<ClockPage />} />
        <Route path="/salary" element={<Salary />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/new" element={<TaskNew />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/todo" element={<Todo />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/off-request" element={<OffRequest />} />
        <Route path="/business-trip" element={<BusinessTrip />} />
        <Route path="/leave-of-absence" element={<LeaveOfAbsence />} />
        <Route path="/overtime" element={<Overtime />} />
        <Route path="/approve" element={<Approve />} />
        <Route path="/approve/:tabSlug" element={<Approve />} />
        <Route path="/task-confirmations" element={<TaskConfirmations />} />
        <Route path="/clock-correction" element={<ClockCorrection />} />
        <Route path="/my-schedule" element={<MySchedule />} />
        <Route path="/approval-status" element={<ApprovalStatus />} />
        <Route path="/expense-request" element={<ExpenseRequest />} />
        <Route path="/cover-invitations" element={<CoverInvitations />} />
        <Route path="/leave-balance" element={<LeaveBalance />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/benefits" element={<Benefits />} />
        <Route path="/training" element={<Training />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/reject-reason" element={<RejectReasonPopup />} />

        {/* CRM Hub + pages */}
        <Route path="/crm" element={<CRMHub />} />
        <Route path="/customer/new" element={<NewCustomer />} />
        <Route path="/crm/customer-lookup" element={<CustomerLookup />} />
        <Route path="/crm/members" element={<MemberLookup />} />
        <Route path="/crm/service" element={<ServiceTickets />} />

        {/* WMS Hub + pages */}
        <Route path="/wms" element={<WMSHub />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/wms/inbound" element={<WMSInbound />} />
        <Route path="/wms/outbound" element={<WMSOutbound />} />
        <Route path="/wms/stock-count" element={<WMSStockCount />} />
        <Route path="/wms/transfers" element={<WMSTransfers />} />

        {/* Sales Hub + pages */}
        <Route path="/sales" element={<SalesHub />} />
        <Route path="/sales/pos" element={<POSMobile />} />
        <Route path="/sales/orders" element={<SalesOrders />} />
        <Route path="/sales/quotations" element={<SalesQuotations />} />
        <Route path="/sales/returns" element={<SalesReturns />} />
        <Route path="/sales/commission" element={<SalesCommission />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </div>
  )
}
