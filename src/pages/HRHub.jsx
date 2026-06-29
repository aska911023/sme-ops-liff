import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FontSizeControl from '../components/FontSizeControl'

// 員工選單分群（每個 group 一行 sub-header + grid）
const MENU_GROUPS = [
  {
    title: '我的狀態',
    items: [
      { path: '/tasks', icon: '⚙️', label: '我的任務', color: 'var(--purple)', dim: 'var(--purple-dim)' },
      { path: '/my-schedule', icon: '📅', label: '我的班表', color: 'var(--blue)', dim: 'var(--blue-dim)' },
      { path: '/approval-status', icon: '📊', label: '我的簽核進度', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
    ],
  },
  {
    title: '各類申請',
    items: [
      { path: '/expense-request', icon: '📝', label: '非經常性費用申請', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
      { path: '/expenses', icon: '🧾', label: '經常性費用報銷', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
      { path: '/overtime', icon: '🕐', label: '加班申請', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
      { path: '/business-trip', icon: '✈️', label: '出差申請', color: 'var(--blue)', dim: 'var(--blue-dim)' },
      { path: '/off-request', icon: '🗓️', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
      { path: '/leave-of-absence', icon: '⏸️', label: '留職停薪', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
      { path: '/transfer-request', icon: '📦', label: '商品調撥', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
    ],
  },
  {
    title: '出勤',
    items: [
      { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
      { path: '/cover-invitations', icon: '🆘', label: '待認領代班', color: 'var(--orange)', dim: 'rgba(245,158,11,0.15)' },
      { path: '/clock-correction', icon: '🔧', label: '補打卡', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
      { path: '/early-leave', icon: '🕒', label: '提早下班登記', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
    ],
  },
  {
    title: '假期',
    items: [
      { path: '/leave', icon: '📋', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
      { path: '/leave-balance', icon: '📊', label: '假期額度', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
      { path: '/benefits', icon: '🎁', label: '我的福利', color: 'var(--green)', dim: 'var(--green-dim)' },
    ],
  },
  {
    title: '薪酬績效',
    items: [
      { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
      { path: '/performance', icon: '📈', label: '我的績效', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
    ],
  },
  {
    title: '學習與文件',
    items: [
      { path: '/training', icon: '🎓', label: '教育訓練', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
      { path: '/documents', icon: '📁', label: '公司文件', color: 'var(--blue)', dim: 'var(--blue-dim)' },
    ],
  },
]

// 任務確認 (2026-05-09) 整合進「簽核中心 > 任務 tab」(/approve/task)，
// 此處不再獨立列出。/task-confirmations 路由仍保留供 LINE deep link 用。
const MANAGER_MENUS = [
  { path: '/dashboard', icon: '📊', label: '儀表板', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/approve', icon: '✅', label: '簽核中心', color: 'var(--green)', dim: 'var(--green-dim)' },
]

const STORE_AUDIT_MENU = { path: '/store-audits', icon: '🔍', label: '門市稽核', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' }

export default function HRHub() {
  const { employee } = useAuth()
  // UI 閘門：5 角色制下 super_admin/admin/manager 都看得到審核中心
  // （真正的權限由 liff_approve_request RPC 依 role_permissions 把關）
  const canApprove = ['super_admin', 'admin', 'manager'].includes(employee?.role)
  // 門市稽核下放門市機：store_staff 也能開單稽核
  const canAudit = ['super_admin', 'admin', 'manager', 'store_staff'].includes(employee?.role)

  return (
    <div className="page">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>📋 人事管理</div>

      {canApprove && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', marginBottom: 10 }}>主管功能</div>
          <div className="menu-grid" style={{ marginBottom: 20 }}>
            {MANAGER_MENUS.map(m => (
              <Link key={m.path} to={m.path} className="menu-item" style={{ border: '1.5px solid rgba(52,211,153,0.2)' }}>
                <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
                <div className="menu-label">{m.label}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      {canAudit && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', marginBottom: 10 }}>門市功能</div>
          <div className="menu-grid" style={{ marginBottom: 20 }}>
            <Link to={STORE_AUDIT_MENU.path} className="menu-item">
              <div className="menu-icon" style={{ background: STORE_AUDIT_MENU.dim, border: `1.5px solid ${STORE_AUDIT_MENU.color}25` }}>{STORE_AUDIT_MENU.icon}</div>
              <div className="menu-label">{STORE_AUDIT_MENU.label}</div>
            </Link>
          </div>
        </>
      )}

      {MENU_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 8, paddingLeft: 4 }}>
            {group.title}
          </div>
          <div className="menu-grid">
            {group.items.map(m => (
              <Link key={m.path} to={m.path} className="menu-item">
                <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
                <div className="menu-label">{m.label}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* 字體大小調整 */}
      <div style={{ marginTop: 20 }}>
        <FontSizeControl />
      </div>
    </div>
  )
}
