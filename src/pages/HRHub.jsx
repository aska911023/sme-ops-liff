import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MENUS = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/my-schedule', icon: '📅', label: '我的班表', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/off-request', icon: '🗓️', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/leave', icon: '📋', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/overtime', icon: '🕐', label: '加班申請', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/clock-correction', icon: '🔧', label: '補打卡', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/approval-status', icon: '🛡️', label: '簽核狀態', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/expenses', icon: '🧾', label: '報帳', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/business-trip', icon: '✈️', label: '出差申請', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/tasks', icon: '⚙️', label: '流程回報', color: 'var(--purple)', dim: 'var(--purple-dim)' },
]

const MANAGER_MENUS = [
  { path: '/approve', icon: '✅', label: '審核中心', color: 'var(--green)', dim: 'var(--green-dim)' },
]

export default function HRHub() {
  const { employee } = useAuth()
  const isManager = employee?.role === 'manager'

  return (
    <div className="page">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>📋 人事管理</div>

      {isManager && (
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
