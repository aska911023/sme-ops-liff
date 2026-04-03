import { useState, useEffect } from 'react'
import { ChevronLeft, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPES = ['特休', '事假', '病假', '公假', '婚假', '喪假', '產假', '陪產假', '育嬰假', '生理假', '心理假', '產檢假', '家庭照顧假', '公傷病假']

export default function Leave() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
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
    if (!form.start_date) return
    setSubmitting(true)

    let days, hours
    if (form.unit === 'hour') {
      // 時數制
      const [sh, sm] = form.start_time.split(':').map(Number)
      const [eh, em] = form.end_time.split(':').map(Number)
      hours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
      days = Math.round(hours / 8 * 10) / 10 // 換算天數
    } else {
      const start = new Date(form.start_date)
      const end = new Date(form.end_date || form.start_date)
      days = Math.max(1, Math.ceil((end - start) / 86400000) + 1)
      hours = days * 8
    }

    const { data, error } = await supabase.from('leave_requests').insert({
      employee: employee.name,
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      days,
      hours,
      start_time: form.unit === 'hour' ? form.start_time : null,
      end_time: form.unit === 'hour' ? form.end_time : null,
      reason: form.reason,
      status: '待審核',
    }).select().single()
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      setRecords(prev => [data, ...prev])
      setShowForm(false)
      setForm({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
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
          {/* Day / Hour toggle */}
          <div className="form-group">
            <label className="form-label">請假單位</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ value: 'day', label: '整天' }, { value: 'hour', label: '時數' }].map(u => (
                <button key={u.value} onClick={() => set('unit', u.value)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${form.unit === u.value ? 'var(--cyan)' : 'var(--border2)'}`,
                  background: form.unit === u.value ? 'var(--cyan-dim)' : 'var(--card)',
                  color: form.unit === u.value ? 'var(--cyan)' : 'var(--t2)',
                  cursor: 'pointer',
                }}>{u.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: form.unit === 'hour' ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">{form.unit === 'hour' ? '日期' : '開始日期'}</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            {form.unit === 'day' && (
              <div className="form-group">
                <label className="form-label">結束日期</label>
                <input className="form-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            )}
          </div>
          {form.unit === 'hour' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">開始時間</label>
                <input className="form-input" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">結束時間</label>
                <input className="form-input" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
              </div>
            </div>
          )}
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
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {r.start_date}{r.start_time ? ` ${r.start_time}` : ''}{r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ''}{r.end_time ? ` ${r.end_time}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {r.hours && r.hours < 8 ? `${r.hours} 小時` : `${r.days} 天`}{r.reason ? ` · ${r.reason}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}
