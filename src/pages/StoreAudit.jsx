import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Check, X, ClipboardCheck, AlertCircle } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUS_COLOR = {
  '草稿':   '#94a3b8',
  '待確認': '#6366f1',
  '申請中': '#f59e0b',
  '已核准': '#22c55e',
  '已退回': '#ef4444',
}

export default function StoreAudit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId || !id) return
    setLoading(true)
    const { data: res, error } = await supabase.rpc('liff_get_store_audit_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_audit_id: Number(id),
    })
    if (error || !res?.ok) {
      alert('載入失敗：' + (error?.message || res?.error || 'unknown'))
      setLoading(false)
      return
    }
    setData(res)
    setLoading(false)
  }, [lineProfile?.lineUserId, id])

  useEffect(() => { load() }, [load])

  // 群組化 items
  const grouped = useMemo(() => {
    if (!data?.items) return {}
    return data.items.reduce((acc, item) => {
      const k = item.category_code
      if (!acc[k]) acc[k] = { name: item.category_name, items: [] }
      acc[k].items.push(item)
      return acc
    }, {})
  }, [data])

  const stats = useMemo(() => {
    if (!data?.items) return { passed: 0, failed: 0, deducted: 0, total: 0 }
    const passed = data.items.filter(i => i.passed === true).length
    const failed = data.items.filter(i => i.passed === false).length
    const deducted = data.items.filter(i => i.passed === false).reduce((s, i) => s + (i.deduct_score || 0), 0)
    const total = data.items.reduce((s, i) => s + (i.deduct_score || 0), 0)
    return { passed, failed, deducted, total }
  }, [data])

  const doApprove = async () => {
    if (busy) return
    if (!confirm(data.can_confirm ? '確認此份稽核屬實？' : '確認核准此份稽核？')) return
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_approve_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: 'store_audit',
      p_id: Number(id),
      p_action: 'approve',
      p_reason: null,
    })
    setBusy(false)
    if (error || !res?.ok) {
      alert('失敗：' + (error?.message || res?.error || 'unknown'))
      return
    }
    alert('完成')
    load()
  }

  const doReject = async () => {
    if (busy) return
    if (!rejectReason.trim()) { alert('請填退回原因'); return }
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_approve_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: 'store_audit',
      p_id: Number(id),
      p_action: 'reject',
      p_reason: rejectReason.trim(),
    })
    setBusy(false)
    if (error || !res?.ok) {
      alert('失敗：' + (error?.message || res?.error || 'unknown'))
      return
    }
    setShowReject(false)
    setRejectReason('')
    alert('已退回')
    load()
  }

  if (loading) {
    return (
      <div className="page">
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      </div>
    )
  }

  if (!data?.audit) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="empty"><AlertCircle size={32} style={{ opacity: 0.4 }} /><div>找不到稽核單</div></div>
      </div>
    )
  }

  const a = data.audit
  const statusColor = STATUS_COLOR[a.status] || '#94a3b8'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>

      {/* Header */}
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={18} /> 稽核單 #{a.id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {a.store_name} · {a.audit_date}{a.shift ? ` · ${a.shift}` : ''}
          </div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700,
          background: `${statusColor}22`, color: statusColor,
        }}>{a.status}</span>
      </div>

      {/* 統計 */}
      <div style={{
        margin: '12px 0', padding: 12, background: 'var(--glass)', borderRadius: 10,
        display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: 12,
      }}>
        <div>
          <div style={{ color: 'var(--t3)' }}>合格</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e' }}>{stats.passed}</div>
        </div>
        <div>
          <div style={{ color: 'var(--t3)' }}>不合格</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{stats.failed}</div>
        </div>
        <div>
          <div style={{ color: 'var(--t3)' }}>扣分</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: stats.deducted > 0 ? '#ef4444' : 'var(--t2)' }}>
            {stats.deducted}/{stats.total}
          </div>
        </div>
      </div>

      {/* 基本資訊 */}
      <Section title="基本資訊">
        <Row label="稽核員" value={a.auditor_name} />
        {a.arrive_time && <Row label="到店" value={a.arrive_time.slice(0, 5)} />}
        {a.depart_time && <Row label="離店" value={a.depart_time.slice(0, 5)} />}
        {a.approver && <Row label={a.status === '已退回' ? '退回人' : '核簽人'} value={a.approver} />}
        {a.reject_reason && <Row label="退回原因" value={a.reject_reason} color="#ef4444" />}
      </Section>

      {/* 當班人員 */}
      {data.on_duty?.length > 0 && (
        <Section title="當班人員">
          {data.on_duty.map((d, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', padding: '6px 0',
              borderBottom: i < data.on_duty.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13,
            }}>
              <span>{d.employee_name}</span>
              {d.confirmed
                ? <span style={{ color: '#22c55e', fontSize: 11 }}>✓ 已確認</span>
                : <span style={{ color: '#f59e0b', fontSize: 11 }}>等待中</span>}
            </div>
          ))}
        </Section>
      )}

      {/* 評核項目（按分類） */}
      {Object.entries(grouped).map(([code, group]) => (
        <Section key={code} title={`${code}、${group.name}`}
          subtitle={`${group.items.length} 項 · 不合格 ${group.items.filter(i => i.passed === false).length}`}>
          {group.items.map(item => {
            const failed = item.passed === false
            return (
              <div key={item.id} style={{
                padding: '8px 0', borderBottom: '1px solid var(--border)',
                background: failed ? 'rgba(239,68,68,0.05)' : 'transparent',
                paddingLeft: 6, marginLeft: -6, paddingRight: 6, marginRight: -6,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 18 }}>{item.item_no}</span>
                  <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{item.item_text}</span>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                    background: item.passed === true ? 'rgba(34,197,94,0.15)' : item.passed === false ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)',
                    color: item.passed === true ? '#22c55e' : item.passed === false ? '#ef4444' : 'var(--t3)',
                  }}>
                    {item.passed === true ? '✓' : item.passed === false ? `-${item.deduct_score}` : '—'}
                  </span>
                </div>
                {failed && item.responsible_employee_name && (
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 24, marginTop: 2 }}>
                    責任人：{item.responsible_employee_name}
                  </div>
                )}
              </div>
            )
          })}
        </Section>
      ))}

      {/* Action buttons */}
      {(data.can_confirm || data.can_approve) && !showReject && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 24px', background: 'var(--bg)', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowReject(true)} disabled={busy}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #ef4444',
              background: 'transparent', color: '#ef4444', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
            <X size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            退回
          </button>
          <button
            onClick={doApprove} disabled={busy}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              opacity: busy ? 0.5 : 1,
            }}>
            <Check size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {data.can_confirm ? '確認屬實' : '核准'}
          </button>
        </div>
      )}

      {/* 退回原因 modal */}
      {showReject && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => { if (e.target === e.currentTarget) setShowReject(false) }}>
          <div style={{
            width: '100%', maxWidth: 480, padding: 20, background: 'var(--bg)',
            borderTopLeftRadius: 16, borderTopRightRadius: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>退回原因 *</div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="請說明退回理由…"
              rows={4}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--glass)', color: 'var(--t1)', fontSize: 13, resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { setShowReject(false); setRejectReason('') }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--t2)', fontSize: 13, cursor: 'pointer',
                }}>取消</button>
              <button
                onClick={doReject} disabled={busy || !rejectReason.trim()}
                style={{
                  flex: 2, padding: '10px', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  opacity: (busy || !rejectReason.trim()) ? 0.5 : 1,
                }}>確定退回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginTop: 16, padding: 12, background: 'var(--glass)', borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>
        {subtitle && <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ color: color || 'var(--t1)', textAlign: 'right', maxWidth: '70%' }}>{value}</span>
    </div>
  )
}
