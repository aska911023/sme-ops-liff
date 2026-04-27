import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const APPROVAL_TYPE_LABEL = {
  leaves:           { label: '請假',     emoji: '🏖' },
  overtimes:        { label: '加班',     emoji: '⏰' },
  trips:            { label: '出差',     emoji: '✈️' },
  expenses:         { label: '報帳',     emoji: '💰' },
  corrections:      { label: '補打卡',   emoji: '🔧' },
  expense_requests: { label: '申請', emoji: '🧾' },
}

export default function Todo() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('tasks') // tasks | approvals
  const [tasks, setTasks] = useState([])
  const [approvals, setApprovals] = useState([])
  const [canApprove, setCanApprove] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    Promise.all([
      supabase.rpc('liff_list_my_tasks', {
        p_line_user_id: lineProfile.lineUserId,
        p_scope: 'active',
      }),
      supabase.rpc('liff_list_pending_approvals', {
        p_line_user_id: lineProfile.lineUserId,
      }),
    ]).then(([tasksRes, approvalsRes]) => {
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : [])
      const d = approvalsRes.data
      // 攤平 5 桶單據成一個清單，只留待審核
      const flat = []
      // 不同單據的「待審」狀態用字不同：
      //   leave/overtime/trip/correction: '待審核'
      //   expense_requests: '申請中'
      //   expenses: '待核銷'
      const PENDING_STATUSES = new Set(['待審核', '申請中', '待核銷', '待審'])
      for (const key of Object.keys(APPROVAL_TYPE_LABEL)) {
        for (const item of (d?.[key] || [])) {
          if (!PENDING_STATUSES.has(item.status)) continue
          flat.push({ ...item, _kind: key })
        }
      }
      // 按建立時間新的在前
      flat.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setApprovals(flat)
      setCanApprove(Boolean(d?.can?.hr || d?.can?.finance))
      setLoading(false)
    })
  }, [lineProfile?.lineUserId])

  useEffect(() => { load() }, [load])

  const priColor = (p) => p === '高' ? 'badge-red' : p === '中' ? 'badge-orange' : 'badge-cyan'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 待辦項目</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <TabBtn
          active={tab === 'tasks'}
          count={tasks.length}
          onClick={() => setTab('tasks')}
          label="任務"
          emoji="⚙️"
          color="var(--cyan)"
          dim="var(--cyan-dim)"
        />
        <TabBtn
          active={tab === 'approvals'}
          count={canApprove ? approvals.length : null}
          onClick={() => setTab('approvals')}
          label="簽核"
          emoji={canApprove ? '✅' : '🔒'}
          color="var(--green)"
          dim="var(--green-dim)"
          disabled={!canApprove}
        />
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tab === 'tasks' ? (
        tasks.length === 0 ? (
          <div className="empty">🎉 目前沒有待辦任務</div>
        ) : tasks.map(t => (
          <button
            key={t.id}
            onClick={() => navigate(`/tasks?task=${t.id}`)}
            className="list-item"
            style={{
              width: '100%', border: 'none', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              background: 'var(--card)', textAlign: 'left',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t.title}</span>
                {t.priority && <span className={`badge ${priColor(t.priority)}`}>{t.priority}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {t.workflow && <span>{t.workflow} · </span>}
                {t.store && <span>{t.store} · </span>}
                {t.due_date ? `截止 ${t.due_date}` : '無截止日'}
              </div>
            </div>
            <ChevronRight size={16} color="var(--t3)" />
          </button>
        ))
      ) : !canApprove ? (
        <div className="empty">
          <Lock size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>你的角色沒有簽核權限</div>
        </div>
      ) : approvals.length === 0 ? (
        <div className="empty">✅ 目前沒有待簽的單據</div>
      ) : approvals.map(a => {
        const meta = APPROVAL_TYPE_LABEL[a._kind]
        return (
          <button
            key={`${a._kind}-${a.id}`}
            onClick={() => navigate('/approve')}
            className="list-item"
            style={{
              width: '100%', border: 'none', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              background: 'var(--card)', textAlign: 'left',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                  {meta?.emoji} {a.employee}
                </span>
                <span className="badge badge-cyan">{meta?.label || a._kind}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {summarizeApproval(a)}
              </div>
            </div>
            <ChevronRight size={16} color="var(--t3)" />
          </button>
        )
      })}
    </div>
  )
}

function TabBtn({ active, count, onClick, label, emoji, color, dim, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '12px 10px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${active ? color : 'var(--border2)'}`,
        background: active ? dim : 'var(--card)',
        color: active ? color : disabled ? 'var(--t3)' : 'var(--t2)',
        fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        position: 'relative',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {count !== null && count !== undefined && (
        <span style={{
          minWidth: 22, padding: '0 6px', height: 20, borderRadius: 10,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800,
          background: active ? color : 'var(--glass)',
          color: active ? '#fff' : 'var(--t3)',
        }}>{count}</span>
      )}
    </button>
  )
}

function summarizeApproval(a) {
  switch (a._kind) {
    case 'leaves':
      return `${a.type || '請假'} · ${a.start_date}${a.end_date !== a.start_date ? ` ~ ${a.end_date}` : ''} · ${a.hours && a.hours < 8 ? `${a.hours}h` : `${a.days}天`}`
    case 'overtimes':
      return `${a.date} · ${a.hours}h · ${a.reason || ''}`
    case 'trips':
      return `${a.destination || ''} · ${a.start_date} ~ ${a.end_date}`
    case 'expenses':
      return `${a.category || '報帳'} · NT$ ${Number(a.amount || 0).toLocaleString()} · ${a.date || ''}`
    case 'corrections':
      return `${a.date} · ${a.type || '上班打卡'}：${a.correction_time || '未填'}`
    case 'expense_requests':
      return `${a.title || ''} · NT$ ${Number(a.estimated_amount || 0).toLocaleString()}${a.chain_name ? ` · ${a.chain_name}` : ''}`
    default:
      return ''
  }
}
