import { Link } from 'react-router-dom'

const MENUS = [
  { path: '/crm/customer-lookup', icon: '🔍', label: '客戶查詢', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/customer/new', icon: '➕', label: '新增客戶', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/crm/members', icon: '💳', label: '會員查詢', color: 'var(--purple)', dim: 'var(--purple-dim)' },
  { path: '/crm/service', icon: '🎧', label: '客服工單', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
]

export default function CRMHub() {
  return (
    <div className="page">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🤝 客戶管理</div>
      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item">
            <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--glass)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>更多 CRM 功能開發中...</div>
      </div>
    </div>
  )
}
