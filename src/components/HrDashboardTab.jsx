import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 特殊狀態 meta（含申請中變體：pending → 虛線＋半透明）
const STATUS_META = {
  leave:            { icon: '🌴', label: '休假',      color: 'var(--cyan)' },
  sick:             { icon: '🏥', label: '病假',      color: 'var(--orange)' },
  personal:         { icon: '📋', label: '事假',      color: 'var(--yellow)' },
  overtime:         { icon: '⚡', label: '加班',      color: 'var(--purple)' },
  trip:             { icon: '✈️', label: '出差',      color: 'var(--blue)' },
  leave_pending:    { icon: '🌴', label: '休假·申請中', color: 'var(--cyan)',   pending: true },
  sick_pending:     { icon: '🏥', label: '病假·申請中', color: 'var(--orange)', pending: true },
  personal_pending: { icon: '📋', label: '事假·申請中', color: 'var(--yellow)', pending: true },
  overtime_pending: { icon: '⚡', label: '加班·申請中', color: 'var(--purple)', pending: true },
  trip_pending:     { icon: '✈️', label: '出差·申請中', color: 'var(--blue)',   pending: true },
}

const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 12 }
const secTitle = { fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }
const nt = v => `NT$ ${Number(v || 0).toLocaleString()}`

export default function HrDashboardTab({ lineUserId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!lineUserId) return
    setLoading(true); setErr(null)
    supabase.rpc('liff_hr_dashboard', { p_line_user_id: lineUserId, p_store: null })
      .then(({ data, error }) => {
        if (error || !data?.ok) {
          setErr(data?.error === 'FORBIDDEN' ? '沒有權限查看人力儀表板' : (error?.message || data?.error || '載入失敗'))
        } else setData(data)
        setLoading(false)
      })
  }, [lineUserId])

  if (loading) return <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (err) return <div className="empty" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--t3)' }}>{err}</div>
  if (!data) return null

  const { today, alerts, stats, scope } = data
  const hasAlerts = alerts.ot_near_limit.length || alerts.permit_expiry.length || alerts.probation_ending.length
  const maxOt = Math.max(1, ...stats.ot_by_store.map(o => Number(o.hours) || 0))

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
        {scope.store} · 在職 {scope.team_count} 人
      </div>

      {/* ── A. 今日概況 ── */}
      <div style={card}>
        <div style={secTitle}>👥 今日概況</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: today.special.length ? 12 : 0 }}>
          <Pill label="已打卡" value={today.clocked_in} color="var(--green)" />
          <Pill label="遲到" value={today.late} color={today.late > 0 ? 'var(--orange)' : 'var(--t3)'} />
          {today.not_clocked > 0 && <Pill label="未打卡" value={today.not_clocked} color="var(--red)" />}
        </div>
        {today.special.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
            {today.special.map((p, i) => {
              const m = STATUS_META[p.status] || STATUS_META.leave
              // 請假/病假/事假類:標實際假別(特休/婚假/喪假…),申請中補「·申請中」;其餘用通用標籤
              const isLeave = ['leave', 'sick', 'personal', 'leave_pending', 'sick_pending', 'personal_pending'].includes(p.status)
              const label = isLeave && p.type
                ? (m.pending ? `${p.type}·申請中` : p.type)
                : m.label
              return (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 8, borderRadius: 10,
                  background: 'var(--glass)', border: m.pending ? `1.5px dashed ${m.color}` : '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', background: m.color, opacity: m.pending ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15,
                    position: 'relative',
                  }}>
                    {(p.name || '?').charAt(0)}
                    <span style={{ position: 'absolute', bottom: -3, right: -3, fontSize: 11 }}>{m.icon}</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t1)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 9, color: m.color, fontWeight: 600, textAlign: 'center' }}>{label}</div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>今日無人休假／請假／加班／出差</div>
        )}
      </div>

      {/* ── B. 需注意 ── */}
      {hasAlerts ? (
        <div style={card}>
          <div style={secTitle}>⚠️ 需注意</div>
          {alerts.ot_near_limit.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>🔥 加班接近上限（本月 ≥36h，法定 46h）</div>
              {alerts.ot_near_limit.map((o, i) => (
                <Row key={i} left={o.name} right={`${Number(o.hours).toFixed(1)}h`} rightColor={Number(o.hours) >= 46 ? 'var(--red)' : 'var(--orange)'} />
              ))}
            </div>
          )}
          {alerts.probation_ending.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📅 試用期將到期（7 天內）</div>
              {alerts.probation_ending.map((e, i) => <Row key={i} left={e.name} right={e.date} />)}
            </div>
          )}
          {alerts.permit_expiry.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>🪪 外籍證件將到期（30 天內）</div>
              {alerts.permit_expiry.map((e, i) => <Row key={i} left={e.name} right={e.date} rightColor="var(--orange)" />)}
            </div>
          )}
        </div>
      ) : null}

      {/* ── C. 本月統計 ── */}
      <div style={card}>
        <div style={secTitle}>📊 本月統計</div>

        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>🔥 加班分門市（共 {Number(stats.ot_total_hours).toFixed(0)}h）</div>
        {stats.ot_by_store.length > 0 ? stats.ot_by_store.map((o, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 78, fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.store}</div>
            <div style={{ flex: 1, height: 7, background: 'var(--glass)', borderRadius: 4 }}>
              <div style={{ width: `${(Number(o.hours) / maxOt) * 100}%`, height: '100%', background: 'var(--orange)', borderRadius: 4 }} />
            </div>
            <div style={{ width: 46, fontSize: 11, textAlign: 'right', color: 'var(--t1)' }}>{Number(o.hours).toFixed(1)}h</div>
          </div>
        )) : <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 12 }}>本月無加班</div>}

        <div style={{ fontSize: 11, color: 'var(--t3)', margin: '14px 0 6px' }}>🌴 請假</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--glass)' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>已核准</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{Number(stats.leave.approved_days).toFixed(1)} 天</div>
          </div>
          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: 'var(--glass)', border: stats.leave.pending_days > 0 ? '1px solid var(--orange)' : '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>🔵 申請中</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: stats.leave.pending_days > 0 ? 'var(--orange)' : 'var(--t3)' }}>{Number(stats.leave.pending_days).toFixed(1)} 天</div>
            <div style={{ fontSize: 10, color: 'var(--t3)' }}>{stats.leave.pending_count} 件待簽</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Pill({ label, value, color }) {
  return (
    <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'var(--glass)', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</div>
    </div>
  )
}

function Row({ left, right, rightColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--t1)' }}>{left}</span>
      <span style={{ fontWeight: 700, color: rightColor || 'var(--t2)' }}>{right}</span>
    </div>
  )
}
