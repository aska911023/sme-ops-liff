import { useState, useEffect } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPES = ['特休', '事假', '病假', '公假', '婚假', '喪假', '產假', '陪產假']

export default function Leave() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: TYPES[0], start_date: '', end_date: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!employee) return
    supabase.from('leave_requests')
      .select('*')
      .eq('employee', employee.name)
      .order('start_date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date) return
    setSubmitting(true)
    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const days = Math.max(1, Math.ceil((end - start) / 86400000) + 1)
    const { data, error } = await supabase.from('leave_requests').insert({
      employee: employee.name,
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date,
      days,
      reason: form.reason,
      status: '待審核',
    }).select().single()
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      setRecords(prev => [data, ...prev])
      setShowForm(false)
      setForm({ type: TYPES[0], start_date: '', end_date: '', reason: '' })
    }
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : 'badge-red'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 請假申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">假別</label>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">開始日期</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">結束日期</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">請假事由</label>
            <textarea className="form-input" placeholder="請輸入請假原因..." value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中...' : '送出申請'}
          </button>
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
        <div className="empty">尚無請假紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="badge badge-cyan">{r.type}</span>
            <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{r.start_date} ~ {r.end_date}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>{r.days} 天{r.reason ? ` · ${r.reason}` : ''}</div>
        </div>
      ))}
    </div>
  )
}
