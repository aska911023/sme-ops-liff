import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Hand, Clock, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyCoverEvent } from '../lib/approvalNotify'

export default function CoverInvitations() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(null)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const { data } = await supabase.rpc('liff_list_open_cover_requests', {
      p_line_user_id: lineProfile.lineUserId,
    })
    setInvitations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  const handleClaim = async (cr) => {
    if (!confirm(`確定接 ${cr.shift_date} ${cr.shift_label} 這班？\n（送出後立即生效，會更新你的班表）`)) return
    setClaiming(cr.id)
    const { data: result, error } = await supabase.rpc('liff_claim_cover_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: cr.id,
    })
    setClaiming(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) {
      const msg = {
        TOO_LATE_OR_NOT_ELIGIBLE: '太慢了！已經有人接了 (或邀請已過期)',
        YOU_ALREADY_HAVE_SHIFT: '你當天已經有班了，不能再接',
      }
      alert(msg[result?.error] || `失敗：${result?.error}`)
      reload()
      return
    }
    // 推 LINE 通知主管 + 其他候選人
    notifyCoverEvent({
      event: 'claimed',
      payload: {
        requester_emp_id: result.requester_emp_id,
        invited_emp_ids: (result.invited_emp_ids || []).filter(id => id !== null),
        absent_emp_name: result.absent_emp_name,
        shift_date: result.shift_date,
        shift_label: result.shift_label,
        claimer_name: result.claimer_name,
      },
    }).catch(err => console.warn('notify failed', err))
    alert('✅ 代班成立！班表已更新')
    reload()
  }

  // 計算還剩多久過期
  const timeLeft = (expires_at) => {
    if (!expires_at) return '無期限'
    const ms = new Date(expires_at) - new Date()
    if (ms <= 0) return '已過期'
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (h > 0) return `剩 ${h}h${m > 0 ? ` ${m}m` : ''}`
    return `剩 ${m}m`
  }

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🆘 待認領代班</div>
        {invitations.length > 0 && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(245,158,11,0.15)', color: 'var(--orange)',
          }}>{invitations.length} 件可接</span>
        )}
      </div>

      {invitations.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: 14, marginBottom: 6 }}>目前沒有待認領的代班</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>有人發出代班邀請時會 LINE 通知你</div>
        </div>
      ) : (
        invitations.map(cr => (
          <div key={cr.id} className="list-item" style={{
            background: 'var(--card)',
            borderLeft: '3px solid var(--orange)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>
                  {cr.shift_date}
                  <span style={{ marginLeft: 10, color: 'var(--cyan)', fontFamily: 'monospace', fontSize: 14 }}>{cr.shift_label}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>
                  代 <span style={{ fontWeight: 700 }}>{cr.absent_emp_name}</span> 的班
                </div>
                {cr.actual_start && cr.actual_end && (
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4, fontFamily: 'monospace' }}>
                    {cr.actual_start.slice(0, 5)} ~ {cr.actual_end.slice(0, 5)}
                    {cr.actual_hours && <span style={{ marginLeft: 8 }}>({cr.actual_hours}h)</span>}
                  </div>
                )}
                {cr.store && (
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>🏪 {cr.store}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>
                <Clock size={11} /> {timeLeft(cr.expires_at)}
              </div>
            </div>

            {cr.reason && (
              <div style={{
                fontSize: 12, color: 'var(--t2)', padding: '6px 10px',
                background: 'var(--card-2)', borderRadius: 6, marginBottom: 8,
              }}>
                💬 {cr.reason}
              </div>
            )}

            <div style={{
              fontSize: 11, color: 'var(--t3)', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <AlertTriangle size={11} /> 先搶先贏 · 接了立即生效
            </div>

            <button disabled={claiming === cr.id} onClick={() => handleClaim(cr)} style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--orange)', color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: claiming === cr.id ? 0.5 : 1,
            }}>
              <Hand size={16} /> {claiming === cr.id ? '處理中...' : '我可以接'}
            </button>
          </div>
        ))
      )}
    </div>
  )
}
