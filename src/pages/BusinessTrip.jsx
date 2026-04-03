import { useState, useEffect } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function BusinessTrip() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ destination: '', start_date: '', end_date: '', purpose: '', budget: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!employee) return
    supabase.from('business_trips')
      .select('*')
      .eq('employee', employee.name)
      .order('start_date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.destination || !form.start_date || !form.end_date) return
    setSubmitting(true)
    const { data, error } = await supabase.from('business_trips').insert({
      employee: employee.name,
      destination: form.destination,
      start_date: form.start_date,
      end_date: form.end_date,
      purpose: form.purpose,
      budget: Number(form.budget) || 0,
      status: '待審核',
    }).select().single()
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      setRecords(prev => [data, ...prev])
      setShowForm(false)
      setForm({ destination: '', start_date: '', end_date: '', purpose: '', budget: '' })
    }
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : s === '出差中' ? 'badge-cyan' : s === '已結案' ? 'badge-blue' : 'badge-red'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">✈️ 出差申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> 新增
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
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.destination}</span>
            <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>{r.start_date} ~ {r.end_date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)' }}>
            <span>{r.purpose}</span>
            {r.budget > 0 && <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>NT$ {r.budget.toLocaleString()}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
