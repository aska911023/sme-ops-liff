import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ClockCorrection() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ date: '', corrected_clock_in: '', corrected_clock_out: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!employee) return
    supabase.from('clock_corrections')
      .select('*')
      .eq('employee', employee.name)
      .order('date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ date: '', corrected_clock_in: '', corrected_clock_out: '', reason: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      date: r.date,
      corrected_clock_in: r.corrected_clock_in || '',
      corrected_clock_out: r.corrected_clock_out || '',
      reason: r.reason || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆補打卡申請嗎？')) return
    const { error } = await supabase.from('clock_corrections').delete().eq('id', r.id)
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.date || !form.reason) { alert('請填寫日期和原因'); return }
    if (!form.corrected_clock_in && !form.corrected_clock_out) { alert('請填寫補正的上班或下班時間'); return }
    setSubmitting(true)

    const payload = {
      employee: employee.name,
      date: form.date,
      corrected_clock_in: form.corrected_clock_in || null,
      corrected_clock_out: form.corrected_clock_out || null,
      reason: form.reason,
      status: '待審核',
    }

    let result, error
    if (editingId) {
      ;({ data: result, error } = await supabase.from('clock_corrections').update(payload).eq('id', editingId).select().single())
    } else {
      ;({ data: result, error } = await supabase.from('clock_corrections').insert(payload).select().single())
    }
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (result) {
      if (editingId) {
        setRecords(prev => prev.map(r => r.id === result.id ? result : r))
      } else {
        setRecords(prev => [result, ...prev])
      }
      resetForm()
    }
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
              <label className="form-label">補正上班時間</label>
              <input className="form-input" type="time" value={form.corrected_clock_in} onChange={e => set('corrected_clock_in', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">補正下班時間</label>
              <input className="form-input" type="time" value={form.corrected_clock_out} onChange={e => set('corrected_clock_out', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
            只填需要補正的時間，不需要補正的留空
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
            {r.corrected_clock_in && <span>上班：{r.corrected_clock_in} </span>}
            {r.corrected_clock_out && <span>下班：{r.corrected_clock_out}</span>}
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
