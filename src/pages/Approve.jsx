import { useState, useEffect } from 'react'
import { ChevronLeft, Check, X, FileText, Paperclip } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Approve() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('leave') // leave | overtime
  const [leaves, setLeaves] = useState([])
  const [overtimes, setOvertimes] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null) // id being processed

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('leave_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('overtime_requests').select('*').order('created_at', { ascending: false }),
    ]).then(([l, o]) => {
      setLeaves(l.data || [])
      setOvertimes(o.data || [])
      setLoading(false)
    })
  }, [employee])

  const handleLeave = async (id, action) => {
    if (action === '已拒絕') {
      const reason = prompt('請輸入拒絕原因：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫拒絕原因'); return }
      setProcessing(id)
      const { data } = await supabase.from('leave_requests')
        .update({ status: '已拒絕', approver: employee.name, reject_reason: reason.trim() })
        .eq('id', id).select().single()
      if (data) setLeaves(prev => prev.map(l => l.id === id ? data : l))
    } else {
      setProcessing(id)
      const { data } = await supabase.from('leave_requests')
        .update({ status: '已核准', approver: employee.name })
        .eq('id', id).select().single()
      if (data) setLeaves(prev => prev.map(l => l.id === id ? data : l))
    }
    setProcessing(null)
  }

  const handleOvertime = async (id, action) => {
    if (action === '已拒絕') {
      const reason = prompt('請輸入駁回原因：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫駁回原因'); return }
      setProcessing(id)
      const { data } = await supabase.from('overtime_requests')
        .update({ status: '已拒絕', reject_reason: reason.trim() })
        .eq('id', id).select().single()
      if (data) setOvertimes(prev => prev.map(o => o.id === id ? data : o))
    } else {
      setProcessing(id)
      const { data } = await supabase.from('overtime_requests')
        .update({ status: '已核准' })
        .eq('id', id).select().single()
      if (data) setOvertimes(prev => prev.map(o => o.id === id ? data : o))
    }
    setProcessing(null)
  }

  const pendingLeaves = leaves.filter(l => l.status === '待審核')
  const pendingOTs = overtimes.filter(o => o.status === '待審核')
  const totalPending = pendingLeaves.length + pendingOTs.length

  const statusColor = (s) => s === '已核准' ? 'var(--green)' : s === '已拒絕' ? 'var(--red)' : 'var(--orange)'
  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '已拒絕' ? 'badge-red' : 'badge-orange'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 審核中心</div>
        {totalPending > 0 && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
          }}>
            {totalPending} 件待審
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'leave', label: '請假', count: pendingLeaves.length },
          { key: 'overtime', label: '加班', count: pendingOTs.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${tab === t.key ? 'var(--cyan)' : 'var(--border2)'}`,
            background: tab === t.key ? 'var(--cyan-dim)' : 'var(--card)',
            color: tab === t.key ? 'var(--cyan)' : 'var(--t2)',
            cursor: 'pointer', position: 'relative',
          }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--orange)', color: '#fff',
                fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tab === 'leave' ? (
        <>
          {leaves.length === 0 ? (
            <div className="empty">尚無假單</div>
          ) : leaves.map(l => (
            <div key={l.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{l.employee}</span>
                  <span className="badge badge-cyan">{l.type}</span>
                </div>
                <span className={`badge ${statusBadge(l.status)}`}>{l.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
                {l.start_date}{l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
                <span style={{ marginLeft: 8, color: 'var(--t3)' }}>
                  {l.hours && l.hours < 8 ? `${l.hours}h` : `${l.days}天`}
                </span>
              </div>
              {l.reason && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{l.reason}</div>}
              {l.attachments?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {l.attachments.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                      background: 'var(--cyan-dim)', color: 'var(--cyan)', textDecoration: 'none',
                    }}>
                      <Paperclip size={10} /> 附件 {i + 1}
                    </a>
                  ))}
                </div>
              )}
              {l.reject_reason && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>拒絕原因：{l.reject_reason}</div>
              )}
              {l.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === l.id} onClick={() => handleLeave(l.id, '已核准')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === l.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === l.id} onClick={() => handleLeave(l.id, '已拒絕')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 拒絕</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          {overtimes.length === 0 ? (
            <div className="empty">尚無加班申請</div>
          ) : overtimes.map(o => (
            <div key={o.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{o.employee}</span>
                  <span style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700 }}>{o.hours}h</span>
                </div>
                <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>{o.date}</div>
              {o.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{o.reason}</div>}
              {o.reject_reason && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{o.reject_reason}</div>
              )}
              {o.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === o.id} onClick={() => handleOvertime(o.id, '已核准')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === o.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === o.id} onClick={() => handleOvertime(o.id, '已拒絕')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
