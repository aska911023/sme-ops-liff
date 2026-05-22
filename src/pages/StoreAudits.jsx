import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ClipboardCheck, AlertCircle, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUS_COLOR = {
  '草稿':   '#94a3b8',
  '待確認': '#6366f1',
  '申請中': '#f59e0b',
  '已核准': '#22c55e',
  '已退回': '#ef4444',
}
const ROLE_LABEL = {
  auditor: '我發起',
  on_duty: '我當班',
  approver: '待我簽核',
}

export default function StoreAudits() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')  // all | need_action | mine

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const { data, error } = await supabase.rpc('liff_list_store_audits', {
      p_line_user_id: lineProfile.lineUserId, p_limit: 50,
    })
    if (error || !data?.ok) {
      console.error('load audits', error)
      setLoading(false); return
    }
    setList(data.list || [])
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'need_action') return list.filter(r => r.need_my_approve)
    if (filter === 'mine') return list.filter(r => r.my_role === 'auditor')
    return list
  }, [list, filter])

  const counts = {
    all: list.length,
    need_action: list.filter(r => r.need_my_approve).length,
    mine: list.filter(r => r.my_role === 'auditor').length,
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={18} /> 門市稽核
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            顯示與你相關的稽核單
          </div>
        </div>
        <button onClick={() => navigate('/store-audits/new')}
          style={{
            padding: '8px 12px', borderRadius: 8, border: 'none',
            background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {/* 篩選 tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
        {[
          { key: 'all', label: `全部 (${counts.all})` },
          { key: 'need_action', label: `待我簽核 (${counts.need_action})` },
          { key: 'mine', label: `我發起 (${counts.mine})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: filter === t.key ? 'var(--cyan)' : 'var(--glass)',
              color: filter === t.key ? '#fff' : 'var(--t2)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <AlertCircle size={32} style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 8, fontSize: 13 }}>沒有符合的稽核單</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const statusColor = STATUS_COLOR[r.status] || '#94a3b8'
            return (
              <div key={r.id}
                onClick={() => navigate(`/store-audit/${r.id}`)}
                style={{
                  padding: 12, background: 'var(--glass)', borderRadius: 10, cursor: 'pointer',
                  border: r.need_my_approve ? '1.5px solid var(--orange)' : '1px solid var(--border)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>#{r.id} · {r.store_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      {r.audit_date}{r.shift ? ` · ${r.shift}` : ''} · 稽核員 {r.auditor_name}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                    background: `${statusColor}22`, color: statusColor,
                  }}>{r.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                  <span style={{
                    padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(99,102,241,0.15)', color: '#6366f1',
                  }}>
                    {ROLE_LABEL[r.my_role]}
                  </span>
                  <span style={{ color: r.total_deducted > 0 ? '#ef4444' : 'var(--t3)' }}>
                    扣 {r.total_deducted} / {r.total_max_score}
                  </span>
                </div>
                {r.need_my_approve && (
                  <div style={{
                    marginTop: 6, padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
                    fontSize: 11, fontWeight: 700, textAlign: 'center',
                  }}>⚠ 等你簽核</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
