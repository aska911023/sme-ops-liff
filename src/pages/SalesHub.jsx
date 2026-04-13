import { Link } from 'react-router-dom'

const MENUS = [
  { path: '/sales/pos', icon: '🏪', label: 'POS 收銀', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/sales/orders', icon: '📝', label: '訂單查詢', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/sales/quotations', icon: '📄', label: '報價單', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/sales/returns', icon: '↩️', label: '退貨處理', color: 'var(--red)', dim: 'var(--red-dim)' },
  { path: '/sales/commission', icon: '💰', label: '佣金查詢', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
]

export default function SalesHub() {
  return (
    <div className="page">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>💰 銷售管理</div>
      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item">
            <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--glass)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>更多銷售功能開發中...</div>
      </div>
    </div>
  )
}
