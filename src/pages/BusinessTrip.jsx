import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyNewSubmission } from '../lib/approvalNotify'

export default function BusinessTrip() {
  const { lineProfile, employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [form, setForm] = useState({ destination: '', start_date: '', end_date: '', purpose: '', budget: '' })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_business_trips', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { reload() }, [lineProfile])

  // 自動進入編輯模式（從 ApprovalStatus 的「編輯重送」按鈕跳過來）
  useEffect(() => {
    if (!resubmitId || editingId || records.length === 0) return
    const target = records.find(r => String(r.id) === String(resubmitId))
    if (target) handleEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmitId, records.length])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ destination: '', start_date: '', end_date: '', purpose: '', budget: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({ destination: r.destination, start_date: r.start_date, end_date: r.end_date, purpose: r.purpose || '', budget: r.budget || '' })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆出差申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_business_trip', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.destination || !form.start_date || !form.end_date) { alert('請填寫目的地和日期'); return }
    setSubmitting(true)

    const payload = {
      destination: form.destination,
      start_date: form.start_date,
      end_date: form.end_date,
      purpose: form.purpose,
    }

    const { error } = await supabase.rpc('liff_upsert_business_trip', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: editingId,
      p_payload: payload,
    })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // 編輯重送：UPDATE 完之後叫 RPC 重啟駁回那關 + 推 LINE
    if (editingId && resubmitId && String(editingId) === String(resubmitId)) {
      try {
        await supabase.rpc('liff_resubmit_request', {
          p_line_user_id: lineProfile.lineUserId,
          p_type: 'trip',
          p_id: editingId,
          p_changes: null,
        })
      } catch (e) { console.error('[liff_resubmit] failed:', e) }
      alert('已重新送審，主管會收到通知')
      navigate('/approval-status')
      return
    }

    if (!editingId && employee?.id) {
      notifyNewSubmission({
        type: 'trip',
        applicantEmpId: employee.id,
        briefText: `${form.destination} ${form.start_date}~${form.end_date}`,
      }).catch(err => console.warn('notify failed', err))
    }

    reload()
    resetForm()
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : s === '出差中' ? 'badge-cyan' : s === '已結案' ? 'badge-blue' : 'badge-red'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">✈️ 出差申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">目的地</label>
            <input className="form-input" type="text" placeholder="例：台中分公司" value={form.destination} onChange={e => set('destination', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">出發日期</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">返回日期</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">出差事由</label>
            <textarea className="form-input" placeholder="請輸入出差原因與目的..." value={form.purpose} onChange={e => set('purpose', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">預估費用 (NT$)</label>
            <input className="form-input" type="number" placeholder="0" value={form.budget} onChange={e => set('budget', e.target.value)} />
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
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '待審核').length}</div>
          <div className="stat-label">待審核</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准' || r.status === '已結案').length}</div>
          <div className="stat-label">已核准</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無出差紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--cyan)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.destination}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              {r.status === '待審核' && (
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
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>{r.start_date} ~ {r.end_date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)' }}>
            <span>{r.purpose}</span>
            {r.budget > 0 && <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>NT$ {r.budget.toLocaleString()}</span>}
          </div>
          {r.reject_reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 6,
              padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}>駁回原因：{r.reject_reason}</div>
          )}
        </div>
      ))}
    </div>
  )
}
