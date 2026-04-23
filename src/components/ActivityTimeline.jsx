const DOT_COLOR = {
  completed: 'var(--green)',
  updated: 'var(--orange)',
  created: 'var(--purple)',
  blocked: 'var(--red)',
}
const TYPE_ICON = { completed: '✅', updated: '🔄', created: '🆕', blocked: '🚫' }
const PERIOD_LABELS = { today: '今日更新', '7days': '過去 7 天', '30days': '過去 30 天' }

export default function ActivityTimeline({ activity, period, onPeriodChange }) {
  const emptyText = period === 'today'
    ? '今日尚無更新'
    : period === '7days' ? '過去七天無更新' : '過去 30 天無更新'

  return (
    <div className="list-item" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>📋 {PERIOD_LABELS[period]}</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>
          {new Date().toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '10px 16px 4px' }}>
        {['today', '7days', '30days'].map(p => {
          const active = p === period
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              style={{
                flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
                borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${active ? 'var(--cyan)' : 'var(--border2)'}`,
                background: active ? 'var(--cyan-dim)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--t3)',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '12px 16px 14px' }}>
        {activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--t3)', fontSize: 13 }}>
            {emptyText}
          </div>
        ) : activity.map((a, i) => (
          <div key={a.id + i} style={{ display: 'flex', gap: 12, paddingBottom: 12, position: 'relative' }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              marginTop: 4, flexShrink: 0,
              background: DOT_COLOR[a.type] || 'var(--t3)',
              boxShadow: `0 0 6px ${DOT_COLOR[a.type] || 'var(--t3)'}`,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>{a.time}</div>
              <div style={{ fontSize: 13, color: 'var(--t1)', marginTop: 1 }}>
                {TYPE_ICON[a.type] || '•'} {a.title}
              </div>
              {a.storeName && (
                <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 2 }}>🏪 {a.storeName}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
