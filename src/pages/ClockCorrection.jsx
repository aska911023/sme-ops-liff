import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — 簽核 LINE 統一走主系統 DB trigger

export default function ClockCorrection() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  // clock_corrections 實際欄位：type (上班打卡/下班打卡) + correction_time
  const [form, setForm] = useState({ date: '', type: '上班打卡', correction_time: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_clock_corrections', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { reload() }, [lineProfile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ date: '', type: '上班打卡', correction_time: '', reason: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      date: r.date,
      type: r.type || '上班打卡',
      correction_time: r.correction_time || '',
      reason: r.reason || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (_r) => {
    // 刪除補打卡尚未做 RPC；暫時只支援新建
    alert('目前不支援撤回，請聯繫管理員')
  }

  const handleSubmit = async () => {
    if (!form.date || !form.reason) { alert('請填寫日期和原因'); return }
    if (!form.correction_time) { alert('請填寫補正的時間'); return }
    if (editingId) { alert('目前不支援編輯；請刪除後重新申請'); return }
    setSubmitting(true)

    const { error } = await supabase.rpc('liff_insert_clock_correction', {
      p_line_user_id: lineProfile.lineUserId,
      p_payload: {
        date: form.date,
        type: form.type,
        correction_time: form.correction_time,
        reason: form.reason,
      },
    })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // ★ 2026-05-08：client-side notifyNewSubmission 已拔除，由主系統 DB trigger 推送

    reload()
    resetForm()
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : 'badge-red'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🔧 補打卡申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">補打卡日期</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">類型</label>
              <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                <option>上班打卡</option>
                <option>下班打卡</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">補正時間</label>
              <input className="form-input" type="time" value={form.correction_time} onChange={e => set('correction_time', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
            一次補正一個時段；如要補上班+下班兩個，請分兩筆送出
          </div>
          <div className="form-group">
            <label className="form-label">補打卡原因 *</label>
            <textarea className="form-input" placeholder="例：忘記打卡、手機沒電..." value={form.reason} onChange={e => set('reason', e.target.value)} />
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
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准').length}</div>
          <div className="stat-label">已核准</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無補打卡紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{r.date}</span>
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
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            {r.type}：{r.correction_time}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>原因：{r.reason}</div>
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
