import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Plus, Building2, Send, Inbox, List, X, CheckCircle2, Flag } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 跨部門工單 — LIFF 端
//   待我部門處理（受理/完成/退回）· 我發出的（確認結案/撤單）· 開單
const PRIORITY = {
  high:   { label: '高', color: 'var(--red)' },
  medium: { label: '中', color: 'var(--orange)' },
  low:    { label: '低', color: 'var(--blue)' },
}
const STATUS = {
  待受理: 'var(--orange)', 處理中: 'var(--blue)', 已完成: 'var(--cyan)', 已結案: 'var(--green)', 已退回: 'var(--red)',
}
const emptyForm = () => ({ target_department_id: '', assignee_id: '', title: '', description: '', priority: 'medium', expected_due_date: '', store_id: '' })

export default function WorkOrders() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [data, setData] = useState({ me: null, orders: [], departments: [], stores: [], employees: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('inbox')       // inbox | sent | all
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const { data: res, error } = await supabase.rpc('liff_list_work_orders', { p_line_user_id: lineProfile.lineUserId })
    if (error || !res?.ok) { console.error('load work orders', error, res); setLoading(false); return }
    setData({ me: res.me, orders: res.orders || [], departments: res.departments || [], stores: res.stores || [], employees: res.employees || [] })
    setLoading(false)
  }, [lineProfile?.lineUserId])
  useEffect(() => { load() }, [load])

  // 從 LINE 卡片深連結 ?focus=ID 自動開明細
  useEffect(() => {
    const f = searchParams.get('focus')
    if (!f || !data.orders.length) return
    const row = data.orders.find(o => o.id === Number(f))
    if (row) { setDetail(row); setSearchParams(sp => { const x = new URLSearchParams(sp); x.delete('focus'); return x }, { replace: true }) }
  }, [data.orders, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const myId = data.me?.id, myDept = data.me?.department_id
  const tabbed = useMemo(() => {
    if (tab === 'inbox') return data.orders.filter(o => o.target_department_id === myDept)
    if (tab === 'sent') return data.orders.filter(o => o.requester_id === myId)
    return data.orders
  }, [data.orders, tab, myId, myDept])
  const inboxOpen = data.orders.filter(o => o.target_department_id === myDept && ['待受理', '處理中'].includes(o.status)).length

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const storeName = (id) => data.stores.find(s => s.id === id)?.name || `#${id}`

  const submitCreate = async () => {
    if (!form.target_department_id) return alert('請選目標部門')
    if (!form.title.trim()) return alert('請填主旨')
    if (!form.expected_due_date) return alert('請選期望完成日')
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_create_work_order', {
      p_line_user_id: lineProfile.lineUserId,
      p_target_department_id: Number(form.target_department_id),
      p_title: form.title.trim(),
      p_description: form.description.trim(),
      p_priority: form.priority,
      p_expected_due_date: form.expected_due_date,
      p_store_id: form.store_id ? Number(form.store_id) : null,
      p_assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
    })
    setBusy(false)
    if (error || !res?.ok) return alert('開單失敗：' + (error?.message || res?.error || ''))
    setShowCreate(false); setForm(emptyForm()); load()
  }

  const act = async (rpc, args, okMsg) => {
    setBusy(true)
    const { data: res, error } = await supabase.rpc(rpc, { p_line_user_id: lineProfile.lineUserId, ...args })
    setBusy(false)
    if (error || !res?.ok) {
      const map = { NOT_AUTHORIZED: '你沒有權限', NOT_PENDING: '已被受理', NOT_IN_PROGRESS: '狀態不是處理中', NOT_COMPLETED: '尚未回報完成', BAD_STATUS: '目前狀態不可執行' }
      return alert(map[res?.error] || res?.error || error?.message || '操作失敗')
    }
    setDetail(null); load(); if (okMsg) alert(okMsg)
  }

  if (loading) return <div className="page" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--t3)' }}>載入中…</div>

  const TABS = [
    { key: 'inbox', label: `待處理${inboxOpen ? ` ${inboxOpen}` : ''}`, icon: Inbox },
    { key: 'sent', label: '我發出的', icon: Send },
    { key: 'all', label: '全部', icon: List },
  ]

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t2)', display: 'flex' }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>跨部門工單</div>
        <button onClick={() => { setForm(emptyForm()); setShowCreate(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> 開單
        </button>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map(t => {
          const Icon = t.icon; const on = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', borderRadius: 8,
              border: `1px solid ${on ? 'var(--blue)' : 'var(--border)'}`, background: on ? 'var(--blue-dim)' : 'transparent',
              color: on ? 'var(--blue)' : 'var(--t2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}><Icon size={13} /> {t.label}</button>
          )
        })}
      </div>

      {tabbed.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--t3)', padding: '48px 0', fontSize: 14 }}>
          {tab === 'inbox' ? '沒有待你部門處理的工單 🎉' : tab === 'sent' ? '你還沒開過工單' : '尚無工單'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tabbed.map(o => {
            const pr = PRIORITY[o.priority] || PRIORITY.medium
            return (
              <div key={o.id} onClick={() => setDetail(o)} style={{ padding: 14, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color: '#fff', background: STATUS[o.status] || 'var(--t3)' }}>{o.status}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pr.color }}>優先 {pr.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>#{o.id}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{o.title}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                  {tab === 'inbox'
                    ? <>來自 {o.requester_department_name} · {o.requester_name}</>
                    : <><Building2 size={11} style={{ verticalAlign: -1 }} /> {o.target_department_name}{o.assignee_name ? ` · ${o.assignee_name}` : ''}</>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  期望 {o.expected_due_date}{o.scheduled_due_date ? ` · 排定 ${o.scheduled_due_date}` : ''}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showCreate && <CreateOverlay {...{ form, set, data, busy, submitCreate, onClose: () => setShowCreate(false) }} />}
      {detail && <DetailOverlay {...{ o: detail, me: data.me, employees: data.employees, storeName, busy, act, onClose: () => setDetail(null) }} />}
    </div>
  )
}

// 整頁式覆蓋（蓋過底部 tab bar，避免內容被卡在下方）
function Overlay({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex' }}><X size={20} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, paddingBottom: 40 }}>
        {children}
      </div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 14, boxSizing: 'border-box' }
const labelStyle = { fontSize: 12, color: 'var(--t3)', marginBottom: 5, display: 'block' }

function CreateOverlay({ form, set, data, busy, submitCreate, onClose }) {
  const deptEmployees = data.employees.filter(e => !form.target_department_id || e.department_id === Number(form.target_department_id))
  return (
    <Overlay title="開跨部門工單" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelStyle}>目標部門 *</label>
          <select style={inputStyle} value={form.target_department_id} onChange={e => set('target_department_id', e.target.value)}>
            <option value="">請選擇…</option>
            {data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>指定承辦人（選填）</label>
          <select style={inputStyle} value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">不填 = 目標部門分派</option>
            {deptEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>主旨 *</label>
          <input style={inputStyle} placeholder="例：中秋檔期門市海報設計" value={form.title} onChange={e => set('title', e.target.value)} /></div>
        <div><label style={labelStyle}>詳細說明</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="具體需求、規格、數量、用途…" value={form.description} onChange={e => set('description', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={labelStyle}>優先級 *</label>
            <select style={inputStyle} value={form.priority} onChange={e => set('priority', e.target.value)}>
              <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
            </select></div>
          <div style={{ flex: 1 }}><label style={labelStyle}>期望完成日 *</label>
            <input type="date" style={inputStyle} value={form.expected_due_date} onChange={e => set('expected_due_date', e.target.value)} /></div>
        </div>
        <div><label style={labelStyle}>關聯門市（選填）</label>
          <select style={inputStyle} value={form.store_id} onChange={e => set('store_id', e.target.value)}>
            <option value="">無</option>
            {data.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <button disabled={busy} onClick={submitCreate}
          style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>
          {busy ? '送出中…' : '送出工單'}
        </button>
      </div>
    </Overlay>
  )
}

function DetailOverlay({ o, me, employees, storeName, busy, act, onClose }) {
  const [accepting, setAccepting] = useState(false)
  const [aForm, setAForm] = useState({ assignee_id: o.assignee_id ? String(o.assignee_id) : '', scheduled_due_date: o.scheduled_due_date || o.expected_due_date || '' })
  const myId = me?.id, myDept = me?.department_id
  const isRequester = o.requester_id === myId, isTargetDept = o.target_department_id === myDept, isAssignee = o.assignee_id === myId
  const pr = PRIORITY[o.priority] || PRIORITY.medium

  const doReject = () => { const r = window.prompt('退回原因：'); if (r === null) return; act('liff_reject_work_order', { p_id: o.id, p_reason: r }, '已退回') }
  const doAccept = () => { if (!aForm.scheduled_due_date) return alert('請填排定完成日'); act('liff_accept_work_order', { p_id: o.id, p_assignee_id: aForm.assignee_id ? Number(aForm.assignee_id) : null, p_scheduled_due_date: aForm.scheduled_due_date }, '已受理') }

  const Row = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 76, flexShrink: 0, fontSize: 12, color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 13.5, flex: 1 }}>{children}</div>
    </div>
  )
  const btn = (bg) => ({ flex: 1, padding: '11px', borderRadius: 9, border: 'none', color: '#fff', background: bg, fontSize: 14, fontWeight: 700, cursor: 'pointer' })

  return (
    <Overlay title={`工單 #${o.id}`} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, color: '#fff', background: STATUS[o.status] || 'var(--t3)' }}>{o.status}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: pr.color }}>優先 {pr.label}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{o.title}</div>
      <Row label="申請">{o.requester_department_name} · {o.requester_name}</Row>
      <Row label="目標部門">{o.target_department_name}</Row>
      <Row label="承辦人">{o.assignee_name || <span style={{ color: 'var(--t3)' }}>未指派</span>}</Row>
      <Row label="期望完成">{o.expected_due_date}</Row>
      <Row label="排定完成">{o.scheduled_due_date || <span style={{ color: 'var(--t3)' }}>—（受理時填）</span>}</Row>
      {o.store_id && <Row label="關聯門市">{storeName(o.store_id)}</Row>}
      <Row label="說明"><span style={{ whiteSpace: 'pre-wrap' }}>{o.description || '—'}</span></Row>
      {o.reject_reason && <Row label="退回原因"><span style={{ color: 'var(--red)' }}>{o.reject_reason}</span></Row>}

      <div style={{ marginTop: 16 }}>
        {/* 待受理：目標部門 受理/退回 */}
        {o.status === '待受理' && isTargetDept && (
          accepting ? (
            <div style={{ padding: 12, borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>受理並排程</div>
              <div><label style={labelStyle}>指派承辦人</label>
                <select style={inputStyle} value={aForm.assignee_id} onChange={e => setAForm(f => ({ ...f, assignee_id: e.target.value }))}>
                  <option value="">我自己接</option>
                  {employees.filter(e => e.department_id === o.target_department_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select></div>
              <div><label style={labelStyle}>排定完成日</label>
                <input type="date" style={inputStyle} value={aForm.scheduled_due_date} onChange={e => setAForm(f => ({ ...f, scheduled_due_date: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={doAccept} style={btn('var(--blue)')}>確認受理</button>
                <button onClick={() => setAccepting(false)} style={{ ...btn('var(--card)'), color: 'var(--t2)', border: '1px solid var(--border)' }}>取消</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAccepting(true)} style={btn('var(--blue)')}><Flag size={14} style={{ verticalAlign: -2 }} /> 受理並排程</button>
              <button disabled={busy} onClick={doReject} style={btn('var(--red)')}>退回</button>
            </div>
          )
        )}
        {/* 處理中：承辦/目標部門 完成/退回 */}
        {o.status === '處理中' && (isAssignee || isTargetDept) && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={() => act('liff_complete_work_order', { p_id: o.id }, '已回報完成')} style={btn('var(--green)')}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> 回報完成</button>
            <button disabled={busy} onClick={doReject} style={btn('var(--red)')}>退回</button>
          </div>
        )}
        {/* 已完成：申請人確認結案 */}
        {o.status === '已完成' && isRequester && (
          <button disabled={busy} onClick={() => act('liff_confirm_work_order', { p_id: o.id }, '已結案')} style={{ ...btn('var(--green)'), width: '100%' }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> 確認結案</button>
        )}
      </div>
    </Overlay>
  )
}
