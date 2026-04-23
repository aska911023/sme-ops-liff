import { useState, useEffect } from 'react'
import { ChevronLeft, ClipboardList, CheckSquare, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Todo() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [taskCount, setTaskCount] = useState(null)
  const [approvalCount, setApprovalCount] = useState(null)
  const [canApprove, setCanApprove] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_my_tasks', {
        p_line_user_id: lineProfile.lineUserId,
        p_scope: 'active',
      }),
      supabase.rpc('liff_list_pending_approvals', {
        p_line_user_id: lineProfile.lineUserId,
      }),
    ]).then(([tasksRes, approvalsRes]) => {
      setTaskCount(Array.isArray(tasksRes.data) ? tasksRes.data.length : 0)
      const d = approvalsRes.data
      const pending =
        (d?.leaves      || []).filter(x => x.status === '待審核').length +
        (d?.overtimes   || []).filter(x => x.status === '待審核').length +
        (d?.trips       || []).filter(x => x.status === '待審核').length +
        (d?.expenses    || []).filter(x => x.status === '待審核').length +
        (d?.corrections || []).filter(x => x.status === '待審核').length
      setApprovalCount(pending)
      setCanApprove(Boolean(d?.can?.hr || d?.can?.finance))
      setLoading(false)
    })
  }, [lineProfile?.lineUserId])

  const tileStyle = (enabled = true) => ({
    width: '100%', padding: '20px 18px', borderRadius: 14,
    border: `1.5px solid ${enabled ? 'var(--border2)' : 'var(--border)'}`,
    background: 'var(--card)', cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
    color: 'var(--t1)', fontSize: 15, fontWeight: 700,
    opacity: enabled ? 1 : 0.55,
  })

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 代辦項目</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 任務 tile */}
        <button onClick={() => navigate('/tasks')} style={tileStyle(true)}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: 'var(--cyan-dim)', color: 'var(--cyan)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CheckSquare size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div>待辦任務</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, fontWeight: 500 }}>
              {loading
                ? '載入中...'
                : taskCount === 0
                  ? '目前沒有待辦任務 🎉'
                  : `${taskCount} 件待處理`}
            </div>
          </div>
          <div style={{
            minWidth: 36, textAlign: 'right',
            fontSize: 22, fontWeight: 900,
            color: taskCount > 0 ? 'var(--cyan)' : 'var(--t3)',
          }}>
            {loading ? '' : taskCount ?? 0}
          </div>
        </button>

        {/* 簽核 tile */}
        <button
          onClick={() => canApprove && navigate('/approve')}
          disabled={!canApprove}
          style={tileStyle(canApprove)}
        >
          <div style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0,
            background: canApprove ? 'var(--green-dim)' : 'var(--glass)',
            color: canApprove ? 'var(--green)' : 'var(--t3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {canApprove ? <ClipboardList size={22} /> : <Lock size={20} />}
          </div>
          <div style={{ flex: 1 }}>
            <div>待我簽核</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, fontWeight: 500 }}>
              {loading
                ? '載入中...'
                : !canApprove
                  ? '目前角色無簽核權限'
                  : approvalCount === 0
                    ? '沒有待簽的單據'
                    : `${approvalCount} 件待審`}
            </div>
          </div>
          <div style={{
            minWidth: 36, textAlign: 'right',
            fontSize: 22, fontWeight: 900,
            color: canApprove && approvalCount > 0 ? 'var(--green)' : 'var(--t3)',
          }}>
            {loading || !canApprove ? '' : approvalCount ?? 0}
          </div>
        </button>
      </div>
    </div>
  )
}
