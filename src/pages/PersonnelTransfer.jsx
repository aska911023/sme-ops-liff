import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TRANSFER_TYPES = ['晉升', '降職', '平調', '部門調動', '門市調動', '職稱變更', '薪資調整', '其他']

// 職位依 category 分組(福董在後台「職位管理」維護,走 liff_list_positions RPC)
function groupPositions(list) {
  const order = [], map = {}
  for (const p of list) { const g = p.category || '其他'; if (!map[g]) { map[g] = []; order.push(g) } map[g].push(p) }
  return order.map(g => ({ group: g, opts: map[g] }))
}

export default function PersonnelTransfer() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [positions, setPositions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    transfer_type: '平調', effective_date: '', new_position: '', new_role: '',
    new_department_id: '', new_store_id: '', new_base_salary: '', reason: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_my_personnel_transfer_requests', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_stores', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setStores(data) })
    supabase.rpc('liff_list_positions', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setPositions(data) })
  }, [lineProfile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ transfer_type: '平調', effective_date: '', new_position: '', new_role: '', new_department_id: '', new_store_id: '', new_base_salary: '', reason: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      transfer_type: r.transfer_type || '平調',
      effective_date: r.effective_date || '',
      new_position: r.new_position || '',
      new_role: r.new_role || '',
      new_department_id: r.new_department_id ? String(r.new_department_id) : '',
      new_store_id: r.new_store_id ? String(r.new_store_id) : '',
      new_base_salary: r.new_base_salary ? String(r.new_base_salary) : '',
      reason: r.reason || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆人事異動申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_personnel_transfer_request', {
      p_line_user_id: lineProfile.lineUserId, p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const buildPayload = () => ({
    transfer_type: form.transfer_type,
    effective_date: form.effective_date || null,
    new_position: form.new_position || null,
    new_role: form.new_role || null,
    new_department_id: form.new_department_id ? Number(form.new_department_id) : null,
    new_store_id: form.new_store_id ? Number(form.new_store_id) : null,
    new_base_salary: form.new_base_salary ? Number(form.new_base_salary) : null,
    reason: form.reason || null,
  })

  const handleSubmit = async () => {
    if (!form.transfer_type) { alert('請選擇異動類型'); return }
    if (!form.reason) { alert('請填寫原因說明'); return }
    setSubmitting(true)
    const { error } = editingId
      ? await supabase.rpc('liff_update_personnel_transfer_request', {
          p_line_user_id: lineProfile.lineUserId, p_id: editingId, p_payload: buildPayload(),
        })
      : await supabase.rpc('liff_insert_personnel_transfer_request', {
          p_line_user_id: lineProfile.lineUserId, p_payload: buildPayload(),
        })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    reload(); resetForm(); setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '申請中' ? 'badge-orange' : s === '已駁回' ? 'badge-red' : 'badge-gray'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🔀 人事異動申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(168,85,247,0.2)' }}>
          <div className="form-group">
            <label className="form-label">異動類型 *</label>
            <select className="form-input" value={form.transfer_type} onChange={e => set('transfer_type', e.target.value)}>
              {TRANSFER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">生效日期</label>
            <input className="form-input" type="date" value={form.effective_date} onChange={e => set('effective_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">新職稱</label>
            <select className="form-input" value={form.new_position} onChange={e => set('new_position', e.target.value)}>
              <option value="">— 不異動 —</option>
              {form.new_position && !positions.some(p => p.label === form.new_position) && (
                <option value={form.new_position}>{form.new_position}(舊值)</option>
              )}
              {groupPositions(positions).map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.opts.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">調往門市</label>
            <select className="form-input" value={form.new_store_id} onChange={e => set('new_store_id', e.target.value)}>
              <option value="">— 不異動 —</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">新底薪（元）</label>
            <input className="form-input" type="number" placeholder="留空表示不異動" value={form.new_base_salary} onChange={e => set('new_base_salary', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">異動原因 *</label>
            <textarea className="form-input" rows={3} placeholder="說明異動緣由" value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>取消</button>
            )}
          </div>
        </div>
      )}

      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '申請中').length}</div>
          <div className="stat-label">申請中</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准').length}</div>
          <div className="stat-label">已核准</div>
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無人事異動申請紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--purple)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{r.transfer_type}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              {r.status === '申請中' && (
                <>
                  <button onClick={() => handleEdit(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Pencil size={11} /> 編輯</button>
                  <button onClick={() => handleDelete(r)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Trash2 size={11} /> 撤回</button>
                </>
              )}
            </div>
          </div>
          {r.effective_date && <div style={{ fontSize: 13, color: 'var(--t2)' }}>生效日：{r.effective_date}</div>}
          {r.new_position && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>新職稱：{r.new_position}</div>}
          {r.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>原因：{r.reason}</div>}
          {r.reject_reason && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)', border: '1px solid rgba(248,113,113,0.15)' }}>
              退回原因：{r.reject_reason}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
