import { Link } from 'react-router-dom'

const MENUS = [
  { path: '/inventory', icon: '📦', label: '庫存查詢', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/wms/inbound', icon: '📥', label: '收貨', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/wms/outbound', icon: '📤', label: '出貨', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/wms/stock-count', icon: '📊', label: '盤點', color: 'var(--purple)', dim: 'var(--purple-dim)' },
  { path: '/wms/transfers', icon: '🔄', label: '調撥', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
]

export default function WMSHub() {
  return (
    <div className="page">
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>📦 倉儲管理</div>
      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item">
            <div className="menu-icon" style={{ background: m.dim, border: `1.5px solid ${m.color}25` }}>{m.icon}</div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: 'var(--glass)', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>更多倉儲功能開發中...</div>
      </div>
    </div>
  )
}
