import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPES = ['特休', '事假', '病假', '公假', '婚假', '喪假', '產假', '陪產假', '育嬰假', '生理假', '心理假', '產檢假', '家庭照顧假', '公傷病假']

// 特休天數依年資計算（勞基法 §38）
function calcAnnualLeave(joinDate) {
  if (!joinDate) return 0
  const years = (new Date() - new Date(joinDate)) / (365.25 * 86400000)
  if (years < 0.5) return 0
  if (years < 1) return 3
  if (years < 2) return 7
  if (years < 3) return 10
  if (years < 5) return 14
  if (years < 10) return 15
  return Math.min(30, 15 + (Math.floor(years) - 10))
}

// 各假別年度上限（曆年制：1/1 ~ 12/31）
const LEAVE_LIMITS = {
  '事假': 14,
  '病假': 30,
  '心理假': 3,
  '家庭照顧假': 7,
  '生理假': 12,
  '婚假': 8,
  '陪產假': 7,
  '產檢假': 7,
}

// 取得特休年度區間（到職週年制）
function getAnnualLeaveRange(joinDate) {
  const join = new Date(joinDate)
  const now = new Date()
  const thisAnniv = new Date(now.getFullYear(), join.getMonth(), join.getDate())
  if (thisAnniv > now) {
    // 今年週年還沒到，用去年週年 ~ 今年週年
    const lastAnniv = new Date(now.getFullYear() - 1, join.getMonth(), join.getDate())
    return { start: lastAnniv, end: thisAnniv }
  }
  // 今年週年已過，用今年週年 ~ 明年週年
  const nextAnniv = new Date(now.getFullYear() + 1, join.getMonth(), join.getDate())
  return { start: thisAnniv, end: nextAnniv }
}

// 取得曆年區間
function getCalendarYearRange() {
  const year = new Date().getFullYear()
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) }
}

export default function Leave() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // null = new, id = editing
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

  const resetForm = () => {
    setForm({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      type: r.type,
      start_date: r.start_date,
      end_date: r.end_date || r.start_date,
      start_time: r.start_time || '09:00',
      end_time: r.end_time || '18:00',
      unit: r.start_time ? 'hour' : 'day',
      reason: r.reason || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm(`確定要撤回這筆${r.type}申請嗎？`)) return
    const { error } = await supabase.from('leave_requests').delete().eq('id', r.id)
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.start_date) return
    setSubmitting(true)

    let days, hours
    if (form.unit === 'hour') {
      const [sh, sm] = form.start_time.split(':').map(Number)
      const [eh, em] = form.end_time.split(':').map(Number)
      hours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
      days = Math.round(hours / 8 * 10) / 10
    } else {
      const start = new Date(form.start_date)
      const end = new Date(form.end_date || form.start_date)
      days = Math.max(1, Math.ceil((end - start) / 86400000) + 1)
      hours = days * 8
    }

    const payload = {
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
    }

    let data, error
    if (editingId) {
      // Update existing
      ;({ data, error } = await supabase.from('leave_requests').update(payload).eq('id', editingId).select().single())
    } else {
      // Insert new
      ;({ data, error } = await supabase.from('leave_requests').insert(payload).select().single())
    }

    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (data) {
      if (editingId) {
        setRecords(prev => prev.map(r => r.id === data.id ? data : r))
      } else {
        setRecords(prev => [data, ...prev])
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
        <div className="header-title">📋 請假申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) { resetForm() } else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ padding: '10px 16px', background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>
                取消
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leave Balance */}
      {employee?.join_date && (() => {
        const annualTotal = calcAnnualLeave(employee.join_date)
        const approved = records.filter(r => r.status !== '已拒絕')

        // 特休：到職週年制
        const annualRange = getAnnualLeaveRange(employee.join_date)
        const annualUsed = approved
          .filter(r => r.type === '特休' && new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)

        // 其他假別：曆年制
        const calRange = getCalendarYearRange()
        const usedByType = (type) => approved
          .filter(r => r.type === type && new Date(r.start_date) >= calRange.start && new Date(r.start_date) < calRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)
        const balances = [
          { label: '特休', total: annualTotal, used: annualUsed, color: 'var(--cyan)' },
          ...Object.entries(LEAVE_LIMITS).map(([type, total]) => ({
            label: type, total, used: usedByType(type), color: 'var(--t3)',
          })).filter(b => b.used > 0 || b.label === '事假' || b.label === '病假'),
        ]
        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>假期餘額</div>
            {balances.map(b => (
              <div key={b.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{b.label}</span>
                  <span style={{ color: b.total - b.used <= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                    剩 {b.total - b.used} / {b.total} 天
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min(100, (b.used / b.total) * 100)}%`,
                    background: b.total - b.used <= 0 ? 'var(--red)' : b.label === '特休' ? 'var(--cyan)' : 'var(--green)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>
              年資 {Math.round((new Date() - new Date(employee.join_date)) / (365.25 * 86400000) * 10) / 10} 年
              {annualTotal === 0 && '（未滿 6 個月，尚無特休）'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
              特休週期：{annualRange.start.toLocaleDateString('zh-TW')} ~ {new Date(annualRange.end.getTime() - 86400000).toLocaleDateString('zh-TW')}
              ｜其他假別：{calRange.start.getFullYear()} 年度
            </div>
          </div>
        )
      })()}

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
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--cyan)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="badge badge-cyan">{r.type}</span>
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
