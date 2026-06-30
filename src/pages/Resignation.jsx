import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const REASONS = ['個人因素', '生涯規劃', '薪資待遇', '工作環境', '家庭因素', '健康因素', '其他']

export default function Resignation() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ planned_resign_date: '', reason: '個人因素', reason_detail: '', handover_notes: '' })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_my_resignation_requests', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])

  useEffect(() => {
    if (!resubmitId || records.length === 0) return
    const target = records.find(r => String(r.id) === resubmitId)
    if (target) handleEdit(target)
  }, [resubmitId, records.length])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ planned_resign_date: '', reason: '個人因素', reason_detail: '', handover_notes: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      planned_resign_date: r.planned_resign_date || '',
      reason: r.reason || '個人因素',
      reason_detail: r.reason_detail || '',
      handover_notes: r.handover_notes || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆離職申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_resignation_request', {
      p_line_user_id: lineProfile.lineUserId, p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.planned_resign_date) { alert('請填寫預計離職日'); return }
    if (!form.reason) { alert('請選擇離職原因'); return }
    setSubmitting(true)
    const { error } = editingId
      ? await supabase.rpc('liff_update_resignation_request', {
          p_line_user_id: lineProfile.lineUserId, p_id: editingId,
          p_payload: { planned_resign_date: form.planned_resign_date, reason: form.reason, reason_detail: form.reason_detail, handover_notes: form.handover_notes },
        })
      : await supabase.rpc('liff_insert_resignation_request', {
          p_line_user_id: lineProfile.lineUserId,
          p_payload: { planned_resign_date: form.planned_resign_date, reason: form.reason, reason_detail: form.reason_detail, handover_notes: form.handover_notes },
        })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    reload(); resetForm(); setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '申請中' ? 'badge-orange' : s === '已駁回' ? 'badge-red' : 'badge-gray'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🚪 離職申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(248,113,113,0.2)' }}>
          <div className="form-group">
            <label className="form-label">預計離職日 *</label>
            <input className="form-input" type="date" value={form.planned_resign_date} onChange={e => set('planned_resign_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">離職原因 *</label>
            <select className="form-input" value={form.reason} onChange={e => set('reason', e.target.value)}>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">詳細說明（選填）</label>
            <textarea className="form-input" rows={3} placeholder="可補充說明" value={form.reason_detail} onChange={e => set('reason_detail', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">交接事項（選填）</label>
            <textarea className="form-input" rows={3} placeholder="工作交接說明" value={form.handover_notes} onChange={e => set('handover_notes', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>取消</button>
            )}
          </div>
        </div>
      )}

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
        <div className="empty">尚無離職申請紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--red)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.reason}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              {r.status === '申請中' && (
                <>
                  <button onClick={() => handleEdit(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Pencil size={11} /> 編輯</button>
                  <button onClick={() => handleDelete(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Trash2 size={11} /> 撤回</button>
                </>
              )}
              {r.status === '已駁回' && (
                <button onClick={() => navigate(`/resignation?resubmit=${r.id}`)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--orange)', background: 'var(--card)', color: 'var(--orange)', cursor: 'pointer', fontSize: 11 }}>編輯重送</button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>預計離職：{r.planned_resign_date}</div>
          {r.reason_detail && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{r.reason_detail}</div>}
          {r.reject_reason && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.15)' }}>
              退回原因：{r.reject_reason}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
