import { useState, useEffect } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['交通', '住宿', '餐飲', '設備', '其他']

export default function Expenses() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: CATEGORIES[0], amount: '', date: '', description: '', receipt: true })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!employee) return
    supabase.from('expenses')
      .select('*')
      .eq('employee', employee.name)
      .order('date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.amount || !form.date) return
    setSubmitting(true)
    const { data, error } = await supabase.from('expenses').insert({
      employee: employee.name,
      category: form.category,
      amount: Number(form.amount),
      date: form.date,
      description: form.description,
      receipt: form.receipt,
      status: '待審核',
    }).select().single()
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      setRecords(prev => [data, ...prev])
      setShowForm(false)
      setForm({ category: CATEGORIES[0], amount: '', date: '', description: '', receipt: true })
    }
    setSubmitting(false)
  }

  const totalPending = records.filter(r => r.status === '待審核').reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🧾 報帳申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">類別</label>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">金額 (NT$)</label>
              <input className="form-input" type="number" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">日期</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">說明</label>
            <input className="form-input" type="text" placeholder="費用說明..." value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">收據</label>
            <select className="form-input" value={form.receipt} onChange={e => set('receipt', e.target.value === 'true')}>
              <option value="true">有收據</option>
              <option value="false">無收據</option>
            </select>
          </div>
          <button className="btn btn-success" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中...' : '送出報銷'}
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
          <div className="stat-num" style={{ color: 'var(--orange)', fontSize: 18 }}>NT$ {totalPending.toLocaleString()}</div>
          <div className="stat-label">待核銷金額</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無報銷紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-cyan">{r.category}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>NT$ {Number(r.amount).toLocaleString()}</span>
            </div>
            <span className={`badge ${r.status === '已核銷' ? 'badge-green' : 'badge-orange'}`}>{r.status}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {r.date}{r.description ? ` · ${r.description}` : ''}
            {r.receipt ? '' : ' · 無收據'}
          </div>
        </div>
      ))}
    </div>
  )
}
