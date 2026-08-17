import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Plus, X, Wrench, User, Building2, CheckCircle2, Paperclip, CreditCard, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 維修單 — LIFF 端(工務現場開單 + 完工拍照)
const STATUS = { 進行中: 'var(--blue)', 待費用核准: 'var(--orange)', 已完工: 'var(--green)', 已取消: 'var(--t3)' }
const EXP_COLOR = { 申請中: 'var(--orange)', 已核准: 'var(--green)', 待核銷: 'var(--cyan)', 已核銷: 'var(--green)', 已駁回: 'var(--red)', 核銷已退回: 'var(--red)' }
const ATTACH_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt'
const emptyForm = () => ({ handler_type: 'self', occur_time: new Date().toISOString().slice(0, 16), location: '', store_id: '', title: '', description: '', need_purchase: false, supplier: '', quote_amount: '', linked_work_order_id: '' })

export default function RepairOrders() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [data, setData] = useState({ me: null, orders: [], stores: [], work_orders: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [detail, setDetail] = useState(null)  // { order, expenses, attachments }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const { data: res, error } = await supabase.rpc('liff_list_repair_orders', { p_line_user_id: lineProfile.lineUserId })
    if (error || !res?.ok) { console.error('load repair orders', error, res); setLoading(false); return }
    setData({ me: res.me, orders: res.orders || [], stores: res.stores || [], work_orders: res.work_orders || [] })
    setLoading(false)
  }, [lineProfile?.lineUserId])
  useEffect(() => { load() }, [load])

  const openDetail = async (id) => {
    const { data: res } = await supabase.rpc('liff_get_repair_order', { p_line_user_id: lineProfile.lineUserId, p_id: id })
    if (res?.ok) setDetail(res)
  }

  const tabbed = useMemo(() => data.orders.filter(o => {
    if (tab === 'open') return ['進行中', '待費用核准'].includes(o.status)
    if (tab === 'done') return o.status === '已完工'
    return true
  }), [data.orders, tab])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submitCreate = async () => {
    if (!form.description.trim()) return alert('請填「怎麼處理 / 問題描述」')
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_create_repair_order', {
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
    })
    setBusy(false)
    if (error || !res?.ok) return alert('開單失敗：' + (error?.message || res?.error || ''))
    setShowCreate(false); setForm(emptyForm()); load()
  }

  if (loading) return <div className="page" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--t3)' }}>載入中…</div>

  const TABS = [{ key: 'open', label: '進行中' }, { key: 'done', label: '已完工' }, { key: 'all', label: '全部' }]

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', display: 'flex' }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 18, fontWeight: 700, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}><Wrench size={18} /> 維修單</div>
        <button onClick={() => { setForm(emptyForm()); setShowCreate(true) }}
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
        <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '48px 0', fontSize: 14 }}>沒有維修單</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tabbed.map(o => (
            <div key={o.id} onClick={() => openDetail(o.id)} style={{ padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' }}>
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

      {showCreate && <CreateOverlay {...{ form, set, data, busy, submitCreate, onClose: () => setShowCreate(false) }} />}
      {detail && <DetailOverlay {...{ detail, me: data.me, stores: data.stores, lineProfile, busy, setBusy, navigate, onClose: () => setDetail(null), reload: () => { load(); openDetail(detail.order.id) } }} />}
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

function CreateOverlay({ form, set, data, busy, submitCreate, onClose }) {
  return (
    <Overlay title="開維修單" onClose={onClose}>
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
        <div><label style={labelStyle}>怎麼處理 / 問題描述 *</label><textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} /></div>
        {form.handler_type === 'self' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
            <input type="checkbox" checked={form.need_purchase} onChange={e => set('need_purchase', e.target.checked)} /> 需要買東西（建單後可「去申請費用」）
          </label>
        )}
        {form.handler_type === 'vendor' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><label style={labelStyle}>廠商</label><input style={inputStyle} value={form.supplier} onChange={e => set('supplier', e.target.value)} /></div>
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
          {busy ? '送出中…' : '建立維修單'}
        </button>
      </div>
    </Overlay>
  )
}

function DetailOverlay({ detail, me, stores, lineProfile, busy, setBusy, navigate, onClose, reload }) {
  const o = detail.order
  const expenses = detail.expenses || []
  const attachments = detail.attachments || []
  const storeName = (stores || []).find(s => s.id === o.store_id)?.name || null
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
      <Row label="地點">{o.location || '—'}</Row>
      <Row label="怎麼處理">{o.description}</Row>
      {o.handler_type === 'vendor' && <Row label="廠商/報價">{o.supplier || '—'}{o.quote_amount != null ? ` / $${o.quote_amount}` : ''}</Row>}
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
