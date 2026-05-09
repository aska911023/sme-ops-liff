import { Check, X, Clock, Circle } from 'lucide-react'

/**
 * 垂直簽核時間軸（LIFF mobile-first）
 *
 * @param {Array} steps  資料 shape: [{ step_order, label, name, status, reject_reason }]
 *                       status: 'completed' | 'current' | 'rejected' | 'pending'
 * @param {boolean} loading
 */
export default function ChainTimeline({ steps, loading = false }) {
  if (loading) {
    return (
      <div style={{ padding: 12, textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto', width: 18, height: 18 }} />
      </div>
    )
  }
  if (!steps || steps.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--t3)', padding: 8 }}>沒有簽核鏈設定</div>
  }

  return (
    <div style={{ paddingLeft: 4, paddingTop: 4, paddingBottom: 4 }}>
      {steps.map((s, idx) => {
        const isLast = idx === steps.length - 1
        const cfg = STATUS_CFG[s.status] || STATUS_CFG.pending
        const Icon = cfg.icon
        return (
          <div key={`${s.step_order}-${idx}`} style={{ display: 'flex', gap: 10, position: 'relative' }}>
            {/* 左側：圓點 + 連線 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: cfg.bg,
                border: `2px solid ${cfg.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: cfg.iconColor || cfg.color,
                flexShrink: 0,
                zIndex: 1,
              }}>
                <Icon size={12} strokeWidth={3} />
              </div>
              {!isLast && (
                <div style={{
                  flex: 1,
                  width: 2,
                  background: 'var(--border2)',
                  marginTop: -2,
                  minHeight: 16,
                }} />
              )}
            </div>

            {/* 右側：內容 */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                  {s.label}
                </span>
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                  background: cfg.bg, color: cfg.color,
                }}>
                  {cfg.statusLabel}
                </span>
              </div>
              {s.name && (
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {s.name}
                </div>
              )}
              {s.status === 'rejected' && s.reject_reason && (
                <div style={{
                  marginTop: 6, padding: '6px 8px', borderRadius: 6,
                  background: 'rgba(248,113,113,0.12)',
                  fontSize: 11, color: 'var(--red)', whiteSpace: 'pre-wrap',
                }}>
                  退回原因：{s.reject_reason}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_CFG = {
  completed: { icon: Check,  color: 'var(--green)',  bg: 'var(--green-dim)',           statusLabel: '已通過' },
  current:   { icon: Clock,  color: 'var(--orange)', bg: 'rgba(251,146,60,0.15)',      statusLabel: '待簽核' },
  rejected:  { icon: X,      color: 'var(--red)',    bg: 'rgba(248,113,113,0.12)',     statusLabel: '已退回' },
  pending:   { icon: Circle, color: 'var(--t3)',     bg: 'var(--card)',                statusLabel: '尚未到' },
}
