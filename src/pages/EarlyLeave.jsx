import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 提早下班登記（店方安排早退）— 店長幫員工登記，無簽核。
// 登記後該員工當天不計早退扣款，薪資照實際打卡時數算。
export default function EarlyLeave() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ employee_id: '', date: '', early_from: '', early_to: '', reason: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_early_leave', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_early_leave_employees', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setEmployees(data) })
  }, [lineProfile])

  const resetForm = () => { setForm({ employee_id: '', date: '', early_from: '', early_to: '', reason: '' }); setShowForm(false) }

  const handleSubmit = async () => {
    if (!form.employee_id || !form.date) { alert('請選擇員工與日期'); return }
    setSubmitting(true)
    const { data, error } = await supabase.rpc('liff_create_early_leave', {
      p_line_user_id: lineProfile.lineUserId,
      p_employee_id: Number(form.employee_id),
      p_date: form.date,
      p_early_from: form.early_from || null,
      p_early_to: form.early_to || null,
      p_reason: form.reason || null,
    })
    setSubmitting(false)
    if (error) { alert('送出失敗: ' + error.message); return }
    if (data && data.ok === false) { alert(data.error || '送出失敗'); return }
    reload(); resetForm()
  }

  const handleDelete = async (r) => {
    if (!confirm(`刪除 ${r.name} ${r.date} 的提早下班登記？`)) return
    const { data, error } = await supabase.rpc('liff_delete_early_leave', { p_line_user_id: lineProfile.lineUserId, p_id: r.id })
    if (error || data?.ok === false) { alert('刪除失敗'); return }
    reload()
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🕒 提早下班登記</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true) }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(251,146,60,0.2)' }}>
          <div className="form-group">
            <label className="form-label">員工 *</label>
            <select className="form-input" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
              <option value="">— 選擇員工 —</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">日期 *</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">提早離開時間</label>
              <Time24 value={form.early_from} onChange={v => set('early_from', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">原班表下班</label>
              <Time24 value={form.early_to} onChange={v => set('early_to', v)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">原因</label>
            <textarea className="form-input" placeholder="例：生意清淡、人力過剩，店方安排提早下班" value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <button className="btn btn-success" style={{ width: '100%' }} onClick={handleSubmit} disabled={submitting}>
            {submitting ? '送出中...' : '登記'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
            登記後該員工當天不計早退扣款，薪資照實際打卡時數算。
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無登記紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{r.name} · {r.date}</span>
            <button onClick={() => handleDelete(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
              <Trash2 size={11} /> 刪除
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            提早 {r.early_from?.slice(0, 5) || '—'} → 原下班 {r.early_to?.slice(0, 5) || '—'}
          </div>
          {r.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>原因：{r.reason}</div>}
        </div>
      ))}
    </div>
  )
}

// 24 小時制時間選擇（時 00–23 + 分 00–59），不用原生 time picker 避免 AM/PM
const HH = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MM = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
function Time24({ value, onChange }) {
  const [hh = '', mm = ''] = (value || '').split(':')
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select className="form-input" value={hh} onChange={e => onChange(`${e.target.value || '00'}:${mm || '00'}`)}>
        <option value="">時</option>
        {HH.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ color: 'var(--t3)' }}>:</span>
      <select className="form-input" value={mm} onChange={e => onChange(`${hh || '00'}:${e.target.value || '00'}`)}>
        <option value="">分</option>
        {MM.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}
