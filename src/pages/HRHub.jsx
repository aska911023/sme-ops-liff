import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MENUS = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/my-schedule', icon: '📅', label: '我的班表', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/off-request', icon: '🗓️', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/leave', icon: '📋', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/leave-balance', icon: '📊', label: '假期額度', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/overtime', icon: '🕐', label: '加班申請', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/clock-correction', icon: '🔧', label: '補打卡', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/approval-status', icon: '📊', label: '我的簽核進度', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/expenses', icon: '🧾', label: '報帳', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/expense-request', icon: '📝', label: '申請（事項/採購）', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/business-trip', icon: '✈️', label: '出差申請', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/tasks', icon: '⚙️', label: '流程回報', color: 'var(--purple)', dim: 'var(--purple-dim)' },
  { path: '/training', icon: '🎓', label: '教育訓練', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/performance', icon: '📈', label: '我的績效', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/benefits', icon: '🎁', label: '我的福利', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/documents', icon: '📁', label: '公司文件', color: 'var(--blue)', dim: 'var(--blue-dim)' },
]

const MANAGER_MENUS = [
  { path: '/approve', icon: '✅', label: '簽核中心', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/task-confirmations', icon: '✔️', label: '任務確認', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/dashboard', icon: '📊', label: '營運儀表板', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
]

export default function HRHub() {
  const { employee } = useAuth()
  // UI 閘門：5 角色制下 super_admin/admin/manager 都看得到審核中心
  // （真正的權限由 liff_approve_request RPC 依 role_permissions 把關）
  const canApprove = ['super_admin', 'admin', 'manager'].includes(employee?.role)

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

      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item">
            <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
