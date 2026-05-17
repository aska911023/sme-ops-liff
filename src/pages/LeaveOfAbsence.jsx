import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, PauseCircle } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const REASON_TYPES = ['產假', '育嬰留停', '兵役', '進修', '家庭因素', '其他']

export default function LeaveOfAbsence() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [form, setForm] = useState({
    start_date: '', planned_end_date: '',
    reason_type: '產假', reason_detail: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_loa', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])

  // 從 ApprovalStatus 「編輯重送」跳過來時自動進入編輯模式
  useEffect(() => {
    if (!resubmitId || editingId || records.length === 0) return
    const target = records.find(r => String(r.id) === String(resubmitId))
    if (target) handleEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmitId, records.length])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ start_date: '', planned_end_date: '', reason_type: '產假', reason_detail: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      start_date: r.start_date || '',
      planned_end_date: r.planned_end_date || '',
      reason_type: r.reason_type || '產假',
      reason_detail: r.reason_detail || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆留停申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_loa', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.start_date || !form.planned_end_date) { alert('請填寫起始日 / 預計返回日'); return }
    if (new Date(form.planned_end_date) < new Date(form.start_date)) {
      alert('預計返回日不能早於起始日'); return
    }
    setSubmitting(true)
    const payload = {
      start_date: form.start_date,
      planned_end_date: form.planned_end_date,
      reason_type: form.reason_type,
      reason_detail: form.reason_detail,
    }
    const { error } = await supabase.rpc('liff_upsert_loa', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: editingId,
      p_payload: payload,
    })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // 編輯重送：呼叫 resubmit RPC（如果有的話）— 留停沒有專屬 resubmit，直接讓上面 UPSERT
    // 把 status 重置為「申請中」+ current_step=0 即可
    if (editingId && resubmitId && String(editingId) === String(resubmitId)) {
      alert('已重新送審，主管會收到通知')
      navigate('/approval-status')
      return
    }

    reload()
    resetForm()
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green'
    : s === '申請中' ? 'badge-orange'
    : s === '已駁回' || s === '已退回' ? 'badge-red'
    : s === '已取消' ? 'badge-gray' : 'badge-blue'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title"><PauseCircle size={18} style={{ display: 'inline', marginRight: 4 }} /> 留職停薪</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(168,85,247,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">起始日 *</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">預計返回日 *</label>
              <input className="form-input" type="date" value={form.planned_end_date} onChange={e => set('planned_end_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">原因類型 *</label>
            <select className="form-input" value={form.reason_type} onChange={e => set('reason_type', e.target.value)}>
              {REASON_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">原因說明（選填）</label>
            <textarea className="form-input" rows={3}
              placeholder="可補充說明背景或特殊安排"
              value={form.reason_detail} onChange={e => set('reason_detail', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>取消</button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '申請中').length}</div>
          <div className="stat-label">申請中</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准').length}</div>
          <div className="stat-label">已核准</div>
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無留停紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--purple, #a855f7)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.reason_type}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              {r.status === '申請中' && (
                <>
                  <button onClick={() => handleEdit(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Pencil size={11} /> 編輯</button>
                  <button onClick={() => handleDelete(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Trash2 size={11} /> 撤回</button>
                </>
              )}
              {(r.status === '已駁回' || r.status === '已退回') && (
                <button onClick={() => navigate(`/leave-of-absence?resubmit=${r.id}`)} style={{
                  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--orange, #fb923c)',
                  background: 'var(--card)', color: 'var(--orange, #fb923c)', cursor: 'pointer', fontSize: 11,
                }}>編輯重送</button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
            {r.start_date} ~ {r.planned_end_date}
            {r.actual_return_date && <span style={{ marginLeft: 8, color: 'var(--green)', fontSize: 11 }}>實際 {r.actual_return_date}</span>}
          </div>
          {r.reason_detail && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{r.reason_detail}</div>}
          {r.reject_reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 6,
              padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}>退回原因：{r.reject_reason}</div>
          )}
        </div>
      ))}
    </div>
  )
}
