import { useEffect, useMemo, useState } from 'react'
import { Check, X, Clock, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'

/**
 * 垂直簽核時間軸（LIFF mobile-first）
 *
 * @param {Array} steps  資料 shape: [{ step_order, label, name, status, reject_reason }]
 *                       status: 'completed' | 'current' | 'rejected' | 'pending'
 * @param {boolean} loading
 * @param {string} [requestType] 傳入 'leave'/'overtime'/'trip'/'correction'/'expense'/'expense_request' 自動 fetch 停留時間
 * @param {number} [requestId]
 */
export default function ChainTimeline({ steps, loading = false, requestType, requestId }) {
  // 廠商 #7：簽核每關停留時間 — 自動 fetch approval_step_history audit
  const [timeline, setTimeline] = useState([])
  useEffect(() => {
    if (!requestType || !requestId) { setTimeline([]); return }
    let cancelled = false
    supabase.rpc('get_approval_timeline', {
      p_request_type: requestType,
      p_request_id: Number(requestId),
    }).then(({ data, error }) => {
      if (cancelled) return
      if (error) { console.warn('get_approval_timeline failed:', error); return }
      setTimeline(Array.isArray(data) ? data : [])
    })
    return () => { cancelled = true }
  }, [requestType, requestId])

  // 合併 duration_text 到 steps
  const mergedSteps = useMemo(() => {
    if (!timeline.length) return steps
    return (steps || []).map((s, idx) => {
      const t = timeline.find(x => x.step_order === (s.step_order ?? idx)) || timeline[idx]
      if (!t) return s
      return { ...s, duration_text: t.duration_text }
    })
  }, [steps, timeline])

  return _renderTimeline(mergedSteps, loading)
}

function _renderTimeline(steps, loading) {
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
              {s.duration_text && (
                <div style={{
                  fontSize: 10, color: 'var(--t2)', marginTop: 3,
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '1px 6px', borderRadius: 3,
                  background: s.status === 'current' ? 'rgba(251,146,60,0.10)' : 'var(--card)',
                }}>
                  ⏱ 停留 {s.duration_text}
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
