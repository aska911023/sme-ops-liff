import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUSES = ['未出貨', '已出貨']
const emptyItem = () => ({ name: '', qty: 1 })
const emptyForm = () => ({
  order_date: new Date().toISOString().slice(0, 10),
  customer_name: '', phone: '', address: '',
  items: [emptyItem()],
  need_bag: false, need_invoice: false, invoice_tax_id: '',
  specific_delivery: false, delivery_time: '',
  notes: '', status: '未出貨',
})

export default function Preorders() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (i, k, v) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, idx) => idx !== i) : f.items }))

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_preorders', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRows(Array.isArray(data) ? data : []); setLoading(false) })
  }
  useEffect(() => { reload() }, [lineProfile])

  const resetForm = () => { setForm(emptyForm()); setEditingId(null); setShowForm(false) }

  const handleEdit = (r) => {
    setForm({
      order_date: r.order_date || '',
      customer_name: r.customer_name || '', phone: r.phone || '', address: r.address || '',
      items: Array.isArray(r.items) && r.items.length ? r.items.map(it => ({ name: it.name || '', qty: it.qty ?? 1 })) : [emptyItem()],
      need_bag: !!r.need_bag, need_invoice: !!r.need_invoice, invoice_tax_id: r.invoice_tax_id || '',
      specific_delivery: !!r.specific_delivery, delivery_time: r.delivery_time || '',
      notes: r.notes || '', status: r.status || '未出貨',
    })
    setEditingId(r.id); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { alert('請填姓名'); return }
    setSubmitting(true)
    const payload = {
      order_date: form.order_date || null,
      customer_name: form.customer_name.trim(),
      phone: form.phone || null, address: form.address || null,
      items: form.items.filter(it => (it.name || '').trim()).map(it => ({ name: it.name.trim(), qty: Number(it.qty) || 1 })),
      need_bag: form.need_bag, need_invoice: form.need_invoice,
      invoice_tax_id: form.need_invoice ? (form.invoice_tax_id || null) : null,
      specific_delivery: form.specific_delivery,
      delivery_time: form.specific_delivery ? (form.delivery_time || null) : null,
      notes: form.notes || null, status: form.status,
    }
    const { data, error } = editingId
      ? await supabase.rpc('liff_update_preorder', { p_line_user_id: lineProfile.lineUserId, p_id: editingId, p_payload: payload })
      : await supabase.rpc('liff_create_preorder', { p_line_user_id: lineProfile.lineUserId, p_payload: payload })
    setSubmitting(false)
    if (error || data?.ok === false) { alert('送出失敗：' + (error?.message || data?.error || '')); return }
    reload(); resetForm()
  }

  const toggleStatus = async (r) => {
    const next = r.status === '已出貨' ? '未出貨' : '已出貨'
    const { data, error } = await supabase.rpc('liff_set_preorder_status', { p_line_user_id: lineProfile.lineUserId, p_id: r.id, p_status: next })
    if (error || data?.ok === false) { alert('更新失敗'); return }
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x))
  }

  const handleDelete = async (r) => {
    if (!confirm(`刪除 ${r.customer_name} 的預購單？`)) return
    const { data, error } = await supabase.rpc('liff_delete_preorder', { p_line_user_id: lineProfile.lineUserId, p_id: r.id })
    if (error || data?.ok === false) { alert('刪除失敗'); return }
    setRows(prev => prev.filter(x => x.id !== r.id))
  }

  const itemsSummary = (items) => (items || []).map(it => `${it.name}×${it.qty}`).join('、') || '—'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📦 線上預購</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setForm(emptyForm()); setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group"><label className="form-label">日期</label><input className="form-input" type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">狀態</label><select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-group"><label className="form-label">姓名 *</label><input className="form-input" value={form.customer_name} onChange={e => set('customer_name', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">電話</label><input className="form-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">地址</label><input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} /></div>

          <div className="form-group">
            <label className="form-label">訂購品項</label>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="form-input" style={{ flex: 3 }} placeholder="品名(例:紅酒A)" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} />
                <input className="form-input" style={{ flex: 1, minWidth: 60 }} type="number" min={1} placeholder="數量" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} />
                <button type="button" onClick={() => removeItem(i)} disabled={form.items.length <= 1} style={{ background: 'none', border: 'none', color: form.items.length <= 1 ? 'var(--t3)' : 'var(--red, #ef4444)', padding: 4, cursor: form.items.length <= 1 ? 'default' : 'pointer' }}><Trash2 size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={addItem} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--border2)', background: 'none', color: 'var(--cyan)', fontSize: 13, cursor: 'pointer' }}><Plus size={14} /> 新增品項</button>
          </div>

          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.need_bag} onChange={e => set('need_bag', e.target.checked)} /> 是否提袋</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.need_invoice} onChange={e => set('need_invoice', e.target.checked)} /> 是否發票統編</label>
            {form.need_invoice && <input className="form-input" placeholder="統編號碼" value={form.invoice_tax_id} onChange={e => set('invoice_tax_id', e.target.value)} />}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.specific_delivery} onChange={e => set('specific_delivery', e.target.checked)} /> 是否特定送貨時間</label>
            {form.specific_delivery && <input className="form-input" placeholder="指定送貨時間(例:週六下午)" value={form.delivery_time} onChange={e => set('delivery_time', e.target.value)} />}
          </div>

          <div className="form-group"><label className="form-label">其他交待事項</label><textarea className="form-input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>

          <button className="btn btn-success" style={{ width: '100%' }} onClick={handleSubmit} disabled={submitting}>{submitting ? '送出中…' : editingId ? '更新' : '送出'}</button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>載入中…</div>
        : rows.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 20 }}>沒有預購單</div>
          : rows.map(r => (
            <div key={r.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{r.customer_name} <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 12 }}>{r.order_date || ''}</span></div>
                  {r.phone && <div style={{ fontSize: 12, color: 'var(--t3)' }}>📞 {r.phone}</div>}
                </div>
                <button onClick={() => toggleStatus(r)} className={`badge ${r.status === '已出貨' ? 'badge-green' : 'badge-orange'}`} style={{ border: 'none', cursor: 'pointer' }}>
                  {r.status === '已出貨' ? '🚚 已出貨' : '📦 未出貨'}
                </button>
              </div>
              {r.address && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>🏠 {r.address}</div>}
              <div style={{ fontSize: 13, color: 'var(--t1)', marginTop: 6 }}>🍷 {itemsSummary(r.items)}</div>
              {(r.need_bag || r.need_invoice || r.specific_delivery) && (
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                  {[r.need_bag && '提袋', r.need_invoice && `統編${r.invoice_tax_id ? ' ' + r.invoice_tax_id : ''}`, r.specific_delivery && `指定時間${r.delivery_time ? ' ' + r.delivery_time : ''}`].filter(Boolean).join('、')}
                </div>
              )}
              {r.notes && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>📝 {r.notes}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-sm" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t2)' }} onClick={() => handleEdit(r)}><Pencil size={13} /> 編輯</button>
                <button className="btn btn-sm" style={{ background: 'none', border: '1px solid var(--red, #ef4444)', color: 'var(--red, #ef4444)' }} onClick={() => handleDelete(r)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
    </div>
  )
}
