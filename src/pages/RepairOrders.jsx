import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Plus, X, Wrench, User, Building2, CheckCircle2, Paperclip, CreditCard, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 維修單 — LIFF 端(工務現場開單 + 完工拍照)
const STATUS = { 草稿: 'var(--t3)', 進行中: 'var(--blue)', 待費用核准: 'var(--orange)', 已完工: 'var(--green)', 已取消: 'var(--t3)' }
const EXP_COLOR = { 申請中: 'var(--orange)', 已核准: 'var(--green)', 待核銷: 'var(--cyan)', 已核銷: 'var(--green)', 已駁回: 'var(--red)', 核銷已退回: 'var(--red)' }
const ATTACH_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt'
const emptyForm = () => ({ handler_type: 'self', occur_time: new Date().toISOString().slice(0, 16), location: '', store_id: '', title: '', description: '', need_purchase: false, supplier: '', quote_amount: '', linked_work_order_id: '', category_id: '', repair_vendor_id: '' })

export default function RepairOrders() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState({ me: null, orders: [], stores: [], work_orders: [], categories: [], vendors: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editDraftId, setEditDraftId] = useState(null)   // 編輯中的草稿 id
  const [detail, setDetail] = useState(null)  // { order, expenses, attachments }
  const [busy, setBusy] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [addingVendor, setAddingVendor] = useState(false)
  const [newVendor, setNewVendor] = useState({ name: '', category_id: '', phone: '' })

  const saveNewVendor = async () => {
    if (!newVendor.name.trim()) return alert('請填廠商名稱')
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_add_repair_vendor', {
      p_line_user_id: lineProfile.lineUserId,
      p_name: newVendor.name.trim(),
      p_category_id: newVendor.category_id ? Number(newVendor.category_id) : null,
      p_phone: newVendor.phone || null,
    })
    setBusy(false)
    if (error || !res?.ok) return alert('新增廠商失敗：' + (error?.message || res?.error || ''))
    setForm(f => ({ ...f, repair_vendor_id: String(res.id) }))
    setAddingVendor(false); setNewVendor({ name: '', category_id: '', phone: '' })
    load()
  }

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const { data: res, error } = await supabase.rpc('liff_list_repair_orders', { p_line_user_id: lineProfile.lineUserId })
    if (error || !res?.ok) { console.error('load repair orders', error, res); setLoading(false); return }
    setData({ me: res.me, orders: res.orders || [], stores: res.stores || [], work_orders: res.work_orders || [], categories: res.categories || [], vendors: res.vendors || [] })
    setLoading(false)
  }, [lineProfile?.lineUserId])
  useEffect(() => { load() }, [load])

  const openDetail = async (id) => {
    const { data: res } = await supabase.rpc('liff_get_repair_order', { p_line_user_id: lineProfile.lineUserId, p_id: id })
    if (res?.ok) setDetail(res)
  }

  const draftCount = useMemo(() => data.orders.filter(o => o.status === '草稿').length, [data.orders])
  const tabbed = useMemo(() => data.orders.filter(o => {
    if (o.status === '草稿' && tab !== 'draft') return false   // 草稿只在「草稿」分頁
    if (tab === 'draft') return o.status === '草稿'
    if (tab === 'open') return ['進行中', '待費用核准'].includes(o.status)
    if (tab === 'done') return o.status === '已完工'
    return true
  }), [data.orders, tab])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const roPayload = () => ({
    p_line_user_id: lineProfile.lineUserId,
    p_handler_type: form.handler_type,
    p_occur_time: form.occur_time ? new Date(form.occur_time).toISOString() : null,
    p_location: form.location || null,
    p_store_id: form.store_id ? Number(form.store_id) : null,
    p_title: form.title || null,
    p_description: form.description.trim(),
    p_need_purchase: form.handler_type === 'self' ? !!form.need_purchase : true,
    p_supplier: form.handler_type === 'vendor' ? (form.supplier || null) : null,
    p_quote_amount: form.handler_type === 'vendor' && form.quote_amount ? Number(form.quote_amount) : null,
    p_linked_work_order_id: form.linked_work_order_id ? Number(form.linked_work_order_id) : null,
    p_category_id: form.category_id ? Number(form.category_id) : null,
    p_repair_vendor_id: form.handler_type === 'vendor' && form.repair_vendor_id ? Number(form.repair_vendor_id) : null,
  })

  const closeCreate = () => { setShowCreate(false); setEditDraftId(null); setForm(emptyForm()) }

  // 開啟草稿編輯
  const openDraftEdit = (o) => {
    setForm({
      handler_type: o.handler_type || 'self',
      occur_time: o.occur_time ? new Date(o.occur_time).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      location: o.location || '', store_id: o.store_id ? String(o.store_id) : '', title: o.title || '',
      description: o.description || '', need_purchase: !!o.need_purchase, supplier: o.supplier || '',
      quote_amount: o.quote_amount != null ? String(o.quote_amount) : '',
      linked_work_order_id: o.linked_work_order_id ? String(o.linked_work_order_id) : '',
      category_id: o.category_id ? String(o.category_id) : '', repair_vendor_id: o.repair_vendor_id ? String(o.repair_vendor_id) : '',
    })
    setEditDraftId(o.id); setShowCreate(true)
  }

  // 正式送出 / 建立(描述必填)
  const submitCreate = async () => {
    if (!form.description.trim()) return alert('請填「怎麼處理 / 問題描述」')
    setBusy(true)
    const { data: res, error } = editDraftId
      ? await supabase.rpc('liff_update_repair_order_draft', { ...roPayload(), p_id: editDraftId, p_submit: true })
      : await supabase.rpc('liff_create_repair_order', { ...roPayload(), p_is_draft: false })
    setBusy(false)
    if (error || !res?.ok) return alert((editDraftId ? '送出' : '開單') + '失敗：' + (error?.message || res?.error || ''))
    closeCreate(); load()
  }

  // 存草稿(描述可留白,純暫存,只有自己看得到)
  const saveDraft = async () => {
    setBusy(true)
    const { data: res, error } = editDraftId
      ? await supabase.rpc('liff_update_repair_order_draft', { ...roPayload(), p_id: editDraftId, p_submit: false })
      : await supabase.rpc('liff_create_repair_order', { ...roPayload(), p_is_draft: true })
    setBusy(false)
    if (error || !res?.ok) return alert('存草稿失敗：' + (error?.message || res?.error || ''))
    closeCreate(); load()
  }

  // 刪除草稿
  const deleteDraft = async () => {
    if (!editDraftId || !window.confirm('確定刪除這張草稿？')) return
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_delete_repair_order', { p_line_user_id: lineProfile.lineUserId, p_id: editDraftId })
    setBusy(false)
    if (error || !res?.ok) return alert('刪除失敗：' + (error?.message || res?.error || ''))
    closeCreate(); load()
  }

  if (loading) return <div className="page" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--t3)' }}>載入中…</div>

  const TABS = [{ key: 'open', label: '進行中' }, { key: 'done', label: '已完工' }, { key: 'all', label: '全部' }, { key: 'draft', label: draftCount ? `草稿 ${draftCount}` : '草稿' }]

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', display: 'flex' }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 18, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={18} /> 維修單</div>
        {data.me?.can_manage && (
          <button onClick={() => setShowManage(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Building2 size={14} /> 管理
          </button>
        )}
        <button onClick={() => { setForm(emptyForm()); setEditDraftId(null); setShowCreate(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> 開單
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => {
          const on = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${on ? 'var(--cyan)' : 'var(--border)'}`,
              background: on ? 'var(--cyan-dim)' : 'transparent', color: on ? 'var(--cyan)' : 'var(--t2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}>{t.label}</button>
          )
        })}
      </div>

      {tabbed.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '48px 0', fontSize: 14 }}>目前沒有維修單</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tabbed.map(o => (
            <div key={o.id} onClick={() => o.status === '草稿' ? openDraftEdit(o) : openDetail(o.id)} style={{ padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#fff', background: STATUS[o.status] || 'var(--t3)' }}>{o.status}</span>
                <span style={{ fontSize: 11, color: 'var(--t3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {o.handler_type === 'vendor' ? <><Building2 size={11} /> 找廠商</> : <><User size={11} /> 自己處理</>}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>#{o.id}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{o.title || o.description?.slice(0, 30) || `維修單 #${o.id}`}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>{o.location ? `📍 ${o.location} · ` : ''}{o.requester_name}</div>
            </div>
          ))}
        </div>
      )}

      {showManage && <ManageOverlay {...{ data, lineProfile, reload: load, onClose: () => setShowManage(false) }} />}
      {showCreate && <CreateOverlay {...{ form, set, data, busy, submitCreate, saveDraft, deleteDraft, editDraftId, addingVendor, setAddingVendor, newVendor, setNewVendor, saveNewVendor, onClose: closeCreate }} />}
      {detail && <DetailOverlay {...{ detail, me: data.me, stores: data.stores, categories: data.categories, vendors: data.vendors, lineProfile, busy, setBusy, navigate, onClose: () => setDetail(null), reload: () => { load(); openDetail(detail.order.id) } }} />}
    </div>
  )
}

function Overlay({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 40 }}>{children}</div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 14, boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--t3)', marginBottom: 5, display: 'block' }

function CreateOverlay({ form, set, data, busy, submitCreate, saveDraft, deleteDraft, editDraftId, addingVendor, setAddingVendor, newVendor, setNewVendor, saveNewVendor, onClose }) {
  return (
    <Overlay title={editDraftId ? '編輯草稿' : '開維修單'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>處理方式 *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ v: 'self', l: '自己處理' }, { v: 'vendor', l: '找廠商' }].map(h => (
              <button key={h.v} onClick={() => set('handler_type', h.v)} style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${form.handler_type === h.v ? 'var(--cyan)' : 'var(--border)'}`,
                background: form.handler_type === h.v ? 'var(--cyan-dim)' : 'transparent', color: form.handler_type === h.v ? 'var(--cyan)' : 'var(--t2)',
              }}>{h.l}</button>
            ))}
          </div>
        </div>
        <div><label style={labelStyle}>時間</label><input type="datetime-local" style={inputStyle} value={form.occur_time} onChange={e => set('occur_time', e.target.value)} /></div>
        <div><label style={labelStyle}>地點</label><input style={inputStyle} placeholder="例:一樓廁所、後場冰箱" value={form.location} onChange={e => set('location', e.target.value)} /></div>
        <div><label style={labelStyle}>門市（選填）</label>
          <select style={inputStyle} value={form.store_id} onChange={e => set('store_id', e.target.value)}>
            <option value="">不綁門市</option>
            {data.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>標題（選填）</label><input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} /></div>
        <div><label style={labelStyle}>類別</label>
          <select style={inputStyle} value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">未分類</option>
            {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>怎麼處理 / 問題描述 *</label><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} /></div>
        {form.handler_type === 'self' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
            <input type="checkbox" checked={form.need_purchase} onChange={e => set('need_purchase', e.target.checked)} /> 需要買東西（建單後可「去申請費用」）
          </label>
        )}
        {form.handler_type === 'vendor' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>廠商</label>
              {!addingVendor ? (
                <select style={inputStyle} value={form.repair_vendor_id}
                  onChange={e => e.target.value === '__add__' ? setAddingVendor(true) : set('repair_vendor_id', e.target.value)}>
                  <option value="">選擇廠商</option>
                  {data.vendors.map(v => {
                    const vc = data.categories.find(c => c.id === v.category_id)?.name
                    return <option key={v.id} value={v.id}>{v.name}{vc ? `（${vc}）` : ''}</option>
                  })}
                  <option value="__add__">＋ 新增廠商…</option>
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input style={inputStyle} placeholder="廠商名稱 *" value={newVendor.name} onChange={e => setNewVendor(v => ({ ...v, name: e.target.value }))} />
                  <select style={inputStyle} value={newVendor.category_id} onChange={e => setNewVendor(v => ({ ...v, category_id: e.target.value }))}>
                    <option value="">類別</option>
                    {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input style={inputStyle} placeholder="電話" value={newVendor.phone} onChange={e => setNewVendor(v => ({ ...v, phone: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" disabled={busy} onClick={saveNewVendor} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 13, fontWeight: 700 }}>儲存廠商</button>
                    <button type="button" onClick={() => setAddingVendor(false)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 13 }}>取消</button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}><label style={labelStyle}>報價</label><input type="number" style={inputStyle} value={form.quote_amount} onChange={e => set('quote_amount', e.target.value)} /></div>
          </div>
        )}
        {data.work_orders.length > 0 && (
          <div><label style={labelStyle}>關聯跨部門工單（選填）</label>
            <select style={inputStyle} value={form.linked_work_order_id} onChange={e => set('linked_work_order_id', e.target.value)}>
              <option value="">不關聯</option>
              {data.work_orders.map(w => <option key={w.id} value={w.id}>#{w.id} {w.title}（{w.status}）</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>僅記錄關聯,不會改動那張工單。</div>
          </div>
        )}
        <button disabled={busy} onClick={submitCreate}
          style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
          {busy ? '送出中…' : (editDraftId ? '送出' : '建立維修單')}
        </button>
        {/* 存草稿:先存不送,描述可留白,只有你自己看得到 */}
        <button disabled={busy} onClick={saveDraft}
          style={{ padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          💾 存草稿（先存不送）
        </button>
        {editDraftId && (
          <button disabled={busy} onClick={deleteDraft}
            style={{ padding: '11px', borderRadius: 10, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            🗑 刪除草稿
          </button>
        )}
      </div>
    </Overlay>
  )
}

function ManageOverlay({ data, lineProfile, reload, onClose }) {
  const [seg, setSeg] = useState('vendor')
  const [vForm, setVForm] = useState({ name: '', category_id: '', contact_person: '', phone: '', note: '' })
  const [cName, setCName] = useState('')
  const [busy, setBusy] = useState(false)
  const catName = (id) => data.categories.find(c => c.id === id)?.name

  const rpc = async (fn, args) => {
    const { data: res, error } = await supabase.rpc(fn, { p_line_user_id: lineProfile.lineUserId, ...args })
    if (error || !res?.ok) { alert('操作失敗：' + (error?.message || res?.error || '')); return false }
    return true
  }
  const addVendor = async () => {
    if (!vForm.name.trim()) return alert('請填廠商名稱')
    setBusy(true)
    const ok = await rpc('liff_add_repair_vendor', { p_name: vForm.name.trim(), p_category_id: vForm.category_id ? Number(vForm.category_id) : null, p_contact_person: vForm.contact_person || null, p_phone: vForm.phone || null, p_note: vForm.note || null })
    setBusy(false)
    if (ok) { setVForm({ name: '', category_id: '', contact_person: '', phone: '', note: '' }); reload() }
  }
  const toggleVendor = async (v) => { if (await rpc('liff_set_repair_vendor_status', { p_id: v.id, p_status: v.status === '停用' ? '啟用' : '停用' })) reload() }
  const addCategory = async () => {
    if (!cName.trim()) return alert('請填類別名稱')
    setBusy(true)
    const ok = await rpc('liff_add_repair_category', { p_name: cName.trim() })
    setBusy(false)
    if (ok) { setCName(''); reload() }
  }
  const delCategory = async (c) => { if (window.confirm(`刪除類別「${c.name}」?（已用此類別的維修單會變未分類）`) && await rpc('liff_delete_repair_category', { p_id: c.id })) reload() }

  const segBtn = (k, l) => (
    <button onClick={() => setSeg(k)} style={{ flex: 1, padding: 9, borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${seg === k ? 'var(--cyan)' : 'var(--border)'}`, background: seg === k ? 'var(--cyan)' : 'transparent', color: seg === k ? '#fff' : 'var(--t2)' }}>{l}</button>
  )

  return (
    <Overlay title="管理廠商 / 類別" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {segBtn('vendor', `維修廠商（${data.vendors.length}）`)}
        {segBtn('category', `類別（${data.categories.length}）`)}
      </div>

      {seg === 'vendor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={inputStyle} placeholder="廠商名稱 *" value={vForm.name} onChange={e => setVForm(v => ({ ...v, name: e.target.value }))} />
          <select style={inputStyle} value={vForm.category_id} onChange={e => setVForm(v => ({ ...v, category_id: e.target.value }))}>
            <option value="">— 類別 —</option>
            {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} placeholder="聯絡人" value={vForm.contact_person} onChange={e => setVForm(v => ({ ...v, contact_person: e.target.value }))} />
            <input style={inputStyle} placeholder="電話" value={vForm.phone} onChange={e => setVForm(v => ({ ...v, phone: e.target.value }))} />
          </div>
          <input style={inputStyle} placeholder="備註" value={vForm.note} onChange={e => setVForm(v => ({ ...v, note: e.target.value }))} />
          <button disabled={busy} onClick={addVendor} style={{ padding: 11, borderRadius: 9, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 14, fontWeight: 700 }}>＋ 新增廠商</button>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.vendors.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 13, textAlign: 'center', padding: 12 }}>還沒有廠商</div>}
            {data.vendors.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', opacity: v.status === '停用' ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.name}{catName(v.category_id) ? <span style={{ color: 'var(--cyan)', fontWeight: 400 }}>　{catName(v.category_id)}</span> : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{[v.contact_person, v.phone].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <button onClick={() => toggleVendor(v)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}>{v.status === '停用' ? '啟用' : '停用'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {seg === 'category' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} placeholder="新類別名稱" value={cName} onChange={e => setCName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
            <button disabled={busy} onClick={addCategory} style={{ padding: '0 16px', borderRadius: 9, border: 'none', background: 'var(--cyan)', color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>＋ 新增</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.categories.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 13 }}>還沒有類別</div>}
            {data.categories.map(c => (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 13 }}>
                {c.name}
                <button onClick={() => delCategory(c)} style={{ display: 'inline-flex', border: 'none', background: 'transparent', color: 'var(--cyan)', cursor: 'pointer', padding: 0 }}><X size={13} /></button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Overlay>
  )
}

function DetailOverlay({ detail, me, stores, categories, vendors, lineProfile, busy, setBusy, navigate, onClose, reload }) {
  const o = detail.order
  const expenses = detail.expenses || []
  const attachments = detail.attachments || []
  const storeName = (stores || []).find(s => s.id === o.store_id)?.name || null
  const catName = (categories || []).find(c => c.id === o.category_id)?.name || null
  const vendor = (vendors || []).find(v => v.id === o.repair_vendor_id) || null
  const [completing, setCompleting] = useState(false)
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const hasPendingExpense = expenses.some(e => e.status === '申請中')
  const needsExpense = o.handler_type === 'vendor' || o.need_purchase
  const active = o.status !== '已完工' && o.status !== '已取消'

  const Row = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 84, flexShrink: 0, fontSize: 12, color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 13.5, flex: 1, whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
  const btn = (bg) => ({ flex: 1, padding: '11px', borderRadius: 9, border: 'none', color: '#fff', background: bg, fontSize: 14, fontWeight: 700, cursor: 'pointer' })

  const publicUrl = (a) => supabase.storage.from(a.storage_bucket || 'attachments').getPublicUrl(a.storage_path).data?.publicUrl

  const doComplete = async () => {
    setBusy(true)
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
      const path = `repair-orders/emp-${me?.id || 'x'}/${o.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
      if (upErr) { setBusy(false); return alert('附件上傳失敗：' + upErr.message) }
      await supabase.rpc('liff_add_repair_order_attachment', {
        p_line_user_id: lineProfile.lineUserId, p_id: o.id, p_storage_path: path,
        p_file_name: file.name, p_file_size: file.size, p_mime_type: file.type,
      })
    }
    const { data: res, error } = await supabase.rpc('liff_complete_repair_order', {
      p_line_user_id: lineProfile.lineUserId, p_id: o.id,
      p_completed_at: new Date(completedAt).toISOString(), p_completion_note: note || null,
    })
    setBusy(false)
    if (error || !res?.ok) return alert(res?.error === 'EXPENSE_PENDING' ? '費用單尚未核准,無法回報完工' : '回報失敗：' + (res?.error || error?.message || ''))
    onClose(); reload()
  }

  const act = async (rpc, okMsg) => {
    setBusy(true)
    const { data: res, error } = await supabase.rpc(rpc, { p_line_user_id: lineProfile.lineUserId, p_id: o.id })
    setBusy(false)
    if (error || !res?.ok) return alert(res?.error || error?.message || '操作失敗')
    onClose(); reload(); if (okMsg) alert(okMsg)
  }

  return (
    <Overlay title={`維修單 #${o.id}`} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, color: '#fff', background: STATUS[o.status] || 'var(--t3)' }}>{o.status}</span>
        <span style={{ fontSize: 12, color: 'var(--t2)' }}>{o.handler_type === 'vendor' ? '找廠商' : '自己處理'}</span>
      </div>
      {o.title && <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{o.title}</div>}
      <Row label="時間">{o.occur_time ? new Date(o.occur_time).toLocaleString('zh-TW') : '—'}</Row>
      <Row label="門市">{storeName || '—'}</Row>
      <Row label="類別">{catName || '—'}</Row>
      <Row label="地點">{o.location || '—'}</Row>
      <Row label="怎麼處理">{o.description}</Row>
      {o.handler_type === 'vendor' && <Row label="廠商/報價">{vendor?.name || o.supplier || '—'}{vendor?.phone ? `　☎ ${vendor.phone}` : ''}{o.quote_amount != null ? ` / $${o.quote_amount}` : ''}</Row>}
      {o.handler_type === 'self' && <Row label="需要採購">{o.need_purchase ? '是' : '否'}</Row>}
      {o.completed_at && <Row label="完工時間">{new Date(o.completed_at).toLocaleString('zh-TW')}</Row>}
      {o.completion_note && <Row label="完工備註">{o.completion_note}</Row>}

      {expenses.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>連結的費用申請</div>
          {expenses.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4 }}>
              <span>#{e.id} {e.title}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: EXP_COLOR[e.status] || 'var(--t3)' }}>{e.status}</span>
            </div>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>完工/相關附件</div>
          {attachments.map(a => (
            <a key={a.id} href={publicUrl(a)} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '6px 8px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 4, color: 'var(--cyan)', textDecoration: 'none' }}>
              <Paperclip size={13} /> {a.file_name}
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {active && needsExpense && (
          <button onClick={() => navigate(`/expense-request?repair_order_id=${o.id}`)} style={{ ...btn('var(--purple)'), width: '100%' }}>
            <CreditCard size={14} style={{ verticalAlign: -2 }} /> 去申請費用
          </button>
        )}
        {hasPendingExpense && <div style={{ fontSize: 12, color: 'var(--orange)' }}>⚠ 有費用單還在「申請中」,核准後才能回報完工。</div>}
        {active && !completing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy || hasPendingExpense} onClick={() => setCompleting(true)} style={{ ...btn('var(--green)'), opacity: hasPendingExpense ? 0.5 : 1 }}>
              <CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> 回報完工
            </button>
            <button disabled={busy} onClick={() => { if (window.confirm('確定作廢?（保留紀錄）')) act('liff_cancel_repair_order', '已作廢') }} style={{ ...btn('var(--card)'), color: 'var(--t2)', border: '1px solid var(--border)' }}>作廢</button>
          </div>
        )}
        {completing && (
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>回報完工</div>
            <div><label style={labelStyle}>完工時間</label><input type="datetime-local" style={inputStyle} value={completedAt} onChange={e => setCompletedAt(e.target.value)} /></div>
            <div><label style={labelStyle}>完工備註</label><textarea style={{ ...inputStyle, minHeight: 54 }} value={note} onChange={e => setNote(e.target.value)} /></div>
            <div>
              <label style={labelStyle}>完工照片 / 檔案</label>
              <input type="file" multiple accept={ATTACH_ACCEPT} onChange={e => setFiles(Array.from(e.target.files || []))} style={{ fontSize: 12 }} />
              {files.map((f, i) => <div key={i} style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3 }}>📎 {f.name}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={busy} onClick={doComplete} style={btn('var(--green)')}>{busy ? '送出中…' : '確認完工'}</button>
              <button onClick={() => setCompleting(false)} style={{ ...btn('var(--card)'), color: 'var(--t2)', border: '1px solid var(--border)' }}>取消</button>
            </div>
          </div>
        )}
        <button disabled={busy} onClick={() => { if (window.confirm(`確定刪除維修單 #${o.id}?會從清單移除(可由後台救回)。`)) act('liff_delete_repair_order', '已刪除') }}
          style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Trash2 size={13} /> 刪除
        </button>
      </div>
    </Overlay>
  )
}
