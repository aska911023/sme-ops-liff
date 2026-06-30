import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const URGENCY_META = {
  '緊急': { color: 'var(--red)', dim: 'var(--red-dim)' },
  '一般': { color: 'var(--orange)', dim: 'var(--orange-dim)' },
  '低':   { color: 'var(--blue)', dim: 'var(--blue-dim)' },
}
const CATEGORIES = ['電器設備', '水電管路', '冷暖空調', '門窗地板', '消防安全', '資訊設備', '傢俱陳設', '其他']

export default function StoreRepair() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ category: '其他', title: '', description: '', location: '', urgency: '一般', store_id: '', attachment_url: '' })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_store_repair_requests', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_stores', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setStores(data) })
  }, [lineProfile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ category: '其他', title: '', description: '', location: '', urgency: '一般', store_id: '', attachment_url: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      category: r.category || '其他',
      title: r.title || '',
      description: r.description || '',
      location: r.location || '',
      urgency: r.urgency || '一般',
      store_id: r.store_id ? String(r.store_id) : '',
      attachment_url: r.attachment_url || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleClose = async (r) => {
    if (!confirm('確定要關閉這筆報修申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_store_repair_request', {
      p_line_user_id: lineProfile.lineUserId, p_id: r.id,
    })
    if (error) { alert('關閉失敗: ' + error.message); return }
    setRecords(prev => prev.map(x => x.id === r.id ? { ...x, status: '已關閉' } : x))
  }

  const handleSubmit = async () => {
    if (!form.title) { alert('請填寫報修標題'); return }
    if (!form.store_id) { alert('請選擇門市'); return }
    setSubmitting(true)
    const payload = {
      category: form.category,
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      urgency: form.urgency,
      store_id: Number(form.store_id),
      attachment_url: form.attachment_url || null,
    }
    const { error } = editingId
      ? await supabase.rpc('liff_update_store_repair_request', {
          p_line_user_id: lineProfile.lineUserId, p_id: editingId, p_payload: payload,
        })
      : await supabase.rpc('liff_insert_store_repair_request', {
          p_line_user_id: lineProfile.lineUserId, p_payload: payload,
        })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    reload(); resetForm(); setSubmitting(false)
  }

  const statusBadge = (s) => s === '已完成' ? 'badge-green' : s === '待處理' ? 'badge-orange' : s === '處理中' ? 'badge-blue' : 'badge-gray'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🔧 門市報修</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
          <div className="form-group">
            <label className="form-label">報修門市 *</label>
            <select className="form-input" value={form.store_id} onChange={e => set('store_id', e.target.value)}>
              <option value="">— 請選擇 —</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">類別</label>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">緊急程度</label>
              <select className="form-input" value={form.urgency} onChange={e => set('urgency', e.target.value)}>
                {Object.keys(URGENCY_META).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">標題 *</label>
            <input className="form-input" type="text" placeholder="例：2F 冷氣故障" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">位置</label>
            <input className="form-input" type="text" placeholder="例：2F 員工休息室" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">詳細描述</label>
            <textarea className="form-input" rows={3} placeholder="說明故障狀況、需求..." value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 3, background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 700, cursor: 'pointer', fontSize: 14 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新報修' : '送出報修'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>取消</button>
            )}
          </div>
        </div>
      )}

      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '待處理').length}</div>
          <div className="stat-label">待處理</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--blue)' }}>{records.filter(r => r.status === '處理中').length}</div>
          <div className="stat-label">處理中</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已完成').length}</div>
          <div className="stat-label">已完成</div>
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無報修紀錄</div>
      ) : records.map(r => {
        const urg = URGENCY_META[r.urgency] || URGENCY_META['一般']
        return (
          <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--orange)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {r.urgency === '緊急' && <AlertTriangle size={13} style={{ color: 'var(--red)' }} />}
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r.title}</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: urg.dim, color: urg.color, fontWeight: 700 }}>{r.urgency}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                {r.status === '待處理' && (
                  <>
                    <button onClick={() => handleEdit(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Pencil size={11} /> 編輯</button>
                    <button onClick={() => handleClose(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Trash2 size={11} /> 關閉</button>
                  </>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{r.category}{r.location ? ` · ${r.location}` : ''}</div>
            {r.description && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>{r.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{r.created_at?.slice(0, 10)}</div>
          </div>
        )
      })}
    </div>
  )
}
