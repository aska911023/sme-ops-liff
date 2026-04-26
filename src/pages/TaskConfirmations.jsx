import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Check, X, ClipboardCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyTaskConfirmation } from '../lib/approvalNotify'

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料，請重新綁定 LINE',
  INVALID_ACTION: '動作無效',
  REASON_REQUIRED: '請填寫退回原因',
  NOT_FOUND_OR_ALREADY_PROCESSED: '此任務已被審過或不存在',
}

export default function TaskConfirmations() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [confs, setConfs] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  const reload = useCallback(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    supabase.rpc('liff_list_my_task_confirmations', {
      p_line_user_id: lineProfile.lineUserId,
    }).then(({ data }) => {
      setConfs(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  const handle = async (tc, action) => {
    let notes = null
    if (action === 'reject') {
      notes = prompt('退回原因（執行人會看到）：')
      if (notes === null) return
      if (!notes.trim()) { alert('請填寫退回原因'); return }
    }
    setProcessing(tc.id)
    const { data } = await supabase.rpc('liff_respond_task_confirmation', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: tc.id, p_action: action, p_notes: notes,
    })
    setProcessing(null)
    if (!data?.ok) { alert(ERR_MSG[data?.error] || `失敗：${data?.error || 'unknown'}`); return }
    if (tc.task_assignee) {
      const { data: exec } = await supabase.from('employees')
        .select('id').eq('name', tc.task_assignee).maybeSingle()
      if (exec?.id) {
        notifyTaskConfirmation({ action, taskTitle: tc.task_title, executorEmpId: exec.id, notes }).catch(() => {})
      }
    }
    reload()
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">✔️ 任務確認</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          審核「執行人按完成、等你確認」的任務
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : confs.length === 0 ? (
        <div className="empty">
          <ClipboardCheck size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>目前沒有等你確認的任務</div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            執行人按「回報完成」後，才會出現在這裡
          </div>
        </div>
      ) : confs.map(tc => (
        <div key={tc.id} className="list-item" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{tc.task_title}</span>
            <span className="badge badge-orange" style={{ flexShrink: 0 }}>待確認</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>
            {tc.workflow_name && <span>📋 {tc.workflow_name} · </span>}
            執行：{tc.task_assignee || '—'}
            {tc.task_store && <span> · 📍 {tc.task_store}</span>}
          </div>
          {tc.task_description && (
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
              {tc.task_description}
            </div>
          )}
          {tc.task_due_date && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>截止：{tc.task_due_date}</div>
          )}
          {tc.priority && tc.priority !== '中' && (
            <span style={{
              display: 'inline-block', marginTop: 6,
              fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 700,
              background: tc.priority === '高' ? 'rgba(248,113,113,0.15)' : 'var(--card)',
              color: tc.priority === '高' ? 'var(--red)' : 'var(--t3)',
            }}>{tc.priority}優先</span>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={processing === tc.id} onClick={() => handle(tc, 'approve')} style={{
              flex: 3, padding: '10px', borderRadius: 10, border: 'none',
              background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: processing === tc.id ? 0.5 : 1,
            }}><Check size={16} /> 通過</button>
            <button disabled={processing === tc.id} onClick={() => handle(tc, 'reject')} style={{
              flex: 1, padding: '10px', borderRadius: 10,
              border: '1.5px solid var(--red)', background: 'transparent',
              color: 'var(--red)', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}><X size={16} /> 退回</button>
          </div>
        </div>
      ))}
    </div>
  )
}
