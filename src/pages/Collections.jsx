import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, X, Trash2, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const n = (x) => Number(x) || 0
const fmt = (v) => `NT$ ${n(v).toLocaleString()}`
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DEPOSIT_TARGET = 300000

// 三期目標（45 / 45 / 10，第三期用餘數免進位差）
function stageTargets(amount) {
  const a = n(amount)
  const t1 = Math.round(a * 0.45)
  const t2 = Math.round(a * 0.45)
  return [t1, t2, a - t1 - t2]
}

const inp = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 14, boxSizing: 'border-box' }
const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4, display: 'block' }

// 匯款證明:上傳到 attachments bucket(anon 政策允許),回傳 path/name
async function uploadProof(file) {
  const safe = (file.name || 'proof').replace(/[\/\\?#%]+/g, '_').replace(/\s+/g, '_')
  const path = 'collection/' + Date.now() + '-' + safe
  const { error } = await supabase.storage.from('attachments').upload(path, file, { cacheControl: '3600', upsert: true })
  if (error) { alert('上傳失敗:' + error.message); return null }
  return { attachment_path: path, attachment_name: safe }
}
const proofUrl = (p) => p?.attachment_path ? supabase.storage.from('attachments').getPublicUrl(p.attachment_path).data?.publicUrl : null

const TABS = [
  { key: 'deposit', label: '訂金', icon: '💰' },
  { key: 'franchise', label: '加盟金', icon: '🤝' },
  { key: 'investor', label: '投資人', icon: '👤' },
]

function Progress({ paid, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((paid / target) * 100)) : 0
  const done = paid >= target && target > 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>
        <span>{fmt(paid)} / {fmt(target)}</span><span>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--card)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: done ? 'var(--green)' : 'var(--cyan)' }} />
      </div>
      {!done && target > 0 && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>還差 {fmt(target - paid)}</div>}
    </div>
  )
}

function StatusPill({ done, doneText = '收款完成', text = '收款中' }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap',
      color: done ? 'var(--green)' : 'var(--orange)', background: done ? 'var(--green-dim)' : 'var(--orange-dim)',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>{done ? <><Check size={11} /> {doneText}</> : text}</span>
  )
}

// 投資人選擇器（下拉既有 + 當場新增），noAdd 時只下拉
function InvestorPicker({ value, onChange, investors, addInvestor, exclude = [], placeholder = '選擇投資人…', noAdd = false }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ company: '', name: '', phone: '' })
  const list = investors.filter(i => !exclude.includes(i.id) || i.id === value)
  const save = async () => {
    const row = await addInvestor(f)
    if (row) { onChange(row.id); setF({ company: '', name: '', phone: '' }); setAdding(false) }
  }
  if (adding) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--card)', padding: 8, borderRadius: 8 }}>
        <input style={inp} placeholder="公司（選填）" value={f.company} onChange={e => setF(s => ({ ...s, company: e.target.value }))} />
        <input style={inp} placeholder="名字 *" value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} />
        <input style={inp} placeholder="電話 *" value={f.phone} onChange={e => setF(s => ({ ...s, phone: e.target.value }))} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setAdding(false)} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>取消</button>
          <button onClick={save} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700 }}>存</button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select style={{ ...inp, flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {list.map(i => <option key={i.id} value={i.id}>{i.name}{i.company ? `（${i.company}）` : ''}</option>)}
      </select>
      {!noAdd && <button onClick={() => setAdding(true)} style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', whiteSpace: 'nowrap' }}><Plus size={14} /></button>}
    </div>
  )
}

// 一組收款明細 + 新增列（max=剩餘上限）
function PaymentEditor({ rows, onAdd, onDelete, max }) {
  const [date, setDate] = useState(todayStr())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const remaining = Math.max(0, n(max))
  const full = remaining <= 0.5
  const submit = async () => {
    if (n(amount) <= 0) { alert('金額要 > 0'); return }
    if (n(amount) > remaining + 0.5) { alert(`超過剩餘上限，最多再記 ${fmt(remaining)}`); return }
    setBusy(true)
    let att = {}
    if (file) { const up = await uploadProof(file); if (!up) { setBusy(false); return } att = up }
    const ok = await onAdd({ paid_date: date, amount: n(amount), note, ...att })
    setBusy(false)
    if (ok) { setAmount(''); setNote(''); setFile(null) }
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>尚無收款</div>}
        {rows.map(p => {
          const url = proofUrl(p)
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 9px', borderRadius: 6, background: 'var(--bg)', fontSize: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--t2)' }}>{p.paid_date}</span>
                {p.note && <span style={{ color: 'var(--t3)' }}>{p.note}</span>}
                {url && <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>📎 匯款證明</a>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmt(p.amount)}</span>
                <button onClick={() => onDelete(p)} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: 0 }}><Trash2 size={13} /></button>
              </div>
            </div>
          )
        })}
      </div>
      {full ? (
        <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={13} /> 已收滿</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" style={{ ...inp, flex: 1 }} value={date} onChange={e => setDate(e.target.value)} />
            <input type="number" style={{ ...inp, width: 120 }} placeholder={`金額 ≤${fmt(remaining)}`} value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="備註（選填）" value={note} onChange={e => setNote(e.target.value)} />
            <button onClick={submit} disabled={busy} style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{busy ? '…' : '記一筆'}</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: file ? 'var(--green)' : 'var(--t3)', cursor: 'pointer' }}>
            📎 {file ? file.name : '匯款證明（選填）'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null) }} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: 0 }}><X size={13} /></button>}
          </label>
        </div>
      )}
    </div>
  )
}

export default function Collections() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const luid = lineProfile?.lineUserId
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [tab, setTab] = useState('deposit')
  const [d, setD] = useState({ deposits: [], depPays: [], franchises: [], ffInvestors: [], ffPays: [], investors: [] })

  const load = useCallback(async () => {
    if (!luid) return
    const { data } = await supabase.rpc('liff_list_collections', { p_line_user_id: luid })
    if (!data?.ok) { setForbidden(data?.error === 'FORBIDDEN'); setLoading(false); return }
    setForbidden(false)
    setD({
      deposits: data.deposits || [], depPays: data.depPays || [], franchises: data.franchises || [],
      ffInvestors: data.ffInvestors || [], ffPays: data.ffPays || [], investors: data.investors || [],
    })
    setLoading(false)
  }, [luid])
  useEffect(() => { load() }, [load])

  // 當場新增投資人（共用）
  const addInvestor = async ({ company, name, phone }) => {
    if (!name?.trim()) { alert('名字必填'); return null }
    if (!phone?.trim()) { alert('電話必填'); return null }
    const { data } = await supabase.rpc('liff_add_investor', { p_line_user_id: luid, p_company: company?.trim() || '', p_name: name.trim(), p_phone: phone.trim() })
    if (!data?.ok) { alert('新增投資人失敗：' + (data?.error || '')); return null }
    setD(s => ({ ...s, investors: [data.row, ...s.investors] }))
    return data.row
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', padding: 0 }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>💵 收款</div>
      </div>

      {forbidden ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>沒有「收款」權限，請洽管理員開啟。</div>
      ) : loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
            {TABS.map(t => {
              const active = tab === t.key
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  flex: 1, padding: '10px 4px', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none',
                  color: active ? 'var(--cyan)' : 'var(--t3)', borderBottom: `2px solid ${active ? 'var(--cyan)' : 'transparent'}`, marginBottom: -1,
                }}>{t.icon} {t.label}</button>
              )
            })}
          </div>

          {tab === 'deposit' && <DepositTab d={d} luid={luid} addInvestor={addInvestor} reload={load} />}
          {tab === 'franchise' && <FranchiseTab d={d} luid={luid} addInvestor={addInvestor} reload={load} />}
          {tab === 'investor' && <InvestorTab d={d} luid={luid} addInvestor={addInvestor} reload={load} />}
        </>
      )}
    </div>
  )
}

// ══════════════ 訂金 ══════════════
function DepositTab({ d, luid, addInvestor, reload }) {
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [invId, setInvId] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const invById = useMemo(() => Object.fromEntries(d.investors.map(i => [i.id, i])), [d.investors])
  const paysByDep = useMemo(() => { const m = {}; d.depPays.forEach(p => { (m[p.deposit_id] ||= []).push(p) }); return m }, [d.depPays])

  const add = async () => {
    if (!title.trim()) { alert('請填標的名稱'); return }
    if (!invId) { alert('請選投資人'); return }
    setSaving(true)
    const { data } = await supabase.rpc('liff_add_deposit', { p_line_user_id: luid, p_title: title.trim(), p_investor_id: invId })
    setSaving(false)
    if (!data?.ok) { alert('新增失敗：' + (data?.error || '')); return }
    setTitle(''); setInvId(''); setShowAdd(false); reload()
  }
  const del = async (dep) => {
    if (!window.confirm(`刪除訂金「${dep.title}」及其收款明細？（已開加盟金會被擋）`)) return
    const { data } = await supabase.rpc('liff_delete_deposit', { p_line_user_id: luid, p_id: dep.id })
    if (!data?.ok) { alert(data?.error || '刪除失敗'); return }
    reload()
  }

  return (
    <div>
      <button onClick={() => setShowAdd(v => !v)} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
        <Plus size={17} /> 新增訂金案
      </button>
      {showAdd && (
        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={lbl}>標的 / 案子名稱</label><input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="例：台中大墩加盟案" /></div>
          <div><label style={lbl}>投資人</label><InvestorPicker value={invId} onChange={setInvId} investors={d.investors} addInvestor={addInvestor} /></div>
          <div><label style={lbl}>目標（固定）</label><input style={{ ...inp, opacity: .6 }} value={fmt(DEPOSIT_TARGET)} disabled /></div>
          <button onClick={add} disabled={saving} style={{ padding: 11, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700 }}>{saving ? '儲存中…' : '建立'}</button>
        </div>
      )}
      {d.deposits.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>尚無訂金案</div>
      ) : d.deposits.map(dep => {
        const isExp = expanded === dep.id
        const inv = invById[dep.investor_id]
        return (
          <div key={dep.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }} onClick={() => setExpanded(isExp ? null : dep.id)}>
                <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{dep.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', margin: '2px 0 6px 19px' }}>{inv ? `${inv.name}${inv.company ? `（${inv.company}）` : ''}` : '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <StatusPill done={dep.status === 'completed'} />
                <button onClick={() => del(dep)} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: 0 }}><Trash2 size={15} /></button>
              </div>
            </div>
            <div style={{ paddingLeft: 19 }}><Progress paid={n(dep.paid_total)} target={n(dep.target_amount)} /></div>
            {isExp && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <PaymentEditor rows={paysByDep[dep.id] || []} max={n(dep.target_amount) - n(dep.paid_total)}
                  onAdd={async ({ paid_date, amount, note, attachment_path, attachment_name }) => {
                    const { data } = await supabase.rpc('liff_add_deposit_payment', { p_line_user_id: luid, p_deposit_id: dep.id, p_paid_date: paid_date, p_amount: amount, p_note: note || '', p_attachment_path: attachment_path || null, p_attachment_name: attachment_name || null })
                    if (!data?.ok) { alert('新增失敗：' + (data?.error || '')); return false }
                    reload(); return true
                  }}
                  onDelete={async (row) => { const { data } = await supabase.rpc('liff_delete_deposit_payment', { p_line_user_id: luid, p_id: row.id }); if (!data?.ok) { alert('刪除失敗'); return } reload() }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════ 加盟金 ══════════════
function FranchiseTab({ d, luid, addInvestor, reload }) {
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [total, setTotal] = useState('')
  const [allocs, setAllocs] = useState([{ investor_id: '', amount: '' }])
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const eligibleInvestors = useMemo(() => {
    const ok = new Set(d.deposits.filter(x => x.status === 'completed' && x.investor_id).map(x => x.investor_id))
    return d.investors.filter(i => ok.has(i.id))
  }, [d.deposits, d.investors])
  const invById = useMemo(() => Object.fromEntries(d.investors.map(i => [i.id, i])), [d.investors])
  const ffiByFf = useMemo(() => {
    const m = {}
    d.ffInvestors.forEach(x => { (m[x.franchise_fee_id] ||= []).push(x) })
    Object.values(m).forEach(arr => arr.sort((a, b) => n(b.amount) - n(a.amount) || String(a.investor_id).localeCompare(String(b.investor_id))))
    return m
  }, [d.ffInvestors])
  const paysByFf = useMemo(() => { const m = {}; d.ffPays.forEach(p => { (m[p.franchise_fee_id] ||= []).push(p) }); return m }, [d.ffPays])

  const allocSum = allocs.reduce((s, a) => s + n(a.amount), 0)
  const pickedIds = allocs.map(a => a.investor_id).filter(Boolean)
  const setAlloc = (i, k, v) => setAllocs(prev => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a))
  const reset = () => { setTitle(''); setTotal(''); setAllocs([{ investor_id: '', amount: '' }]) }

  const add = async () => {
    if (!title.trim()) { alert('請填標的名稱'); return }
    if (n(total) <= 0) { alert('請填總額'); return }
    const rows = allocs.filter(a => a.investor_id && n(a.amount) > 0)
    if (rows.length === 0) { alert('至少一位投資人 + 分攤金額'); return }
    if (new Set(rows.map(r => r.investor_id)).size !== rows.length) { alert('同一投資人重複了'); return }
    if (Math.abs(allocSum - n(total)) > 0.5) { alert(`分攤加總 ${fmt(allocSum)} ≠ 總額 ${fmt(n(total))}`); return }
    setSaving(true)
    const { data } = await supabase.rpc('liff_add_franchise', { p_line_user_id: luid, p_title: title.trim(), p_total: n(total), p_allocs: rows.map(r => ({ investor_id: r.investor_id, amount: n(r.amount) })) })
    setSaving(false)
    if (!data?.ok) { alert('建立失敗：' + (data?.error || '')); return }
    reset(); setShowAdd(false); reload()
  }
  const del = async (f) => {
    if (!window.confirm('刪除此加盟金收款及其所有分攤/明細？')) return
    const { data } = await supabase.rpc('liff_delete_franchise', { p_line_user_id: luid, p_id: f.id })
    if (!data?.ok) { alert(data?.error || '刪除失敗'); return }
    reload()
  }

  return (
    <div>
      <button onClick={() => setShowAdd(v => !v)} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
        <Plus size={17} /> 新增加盟金收款
      </button>
      {showAdd && (
        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={lbl}>標的 / 案名</label><input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="例：台中大墩加盟案" /></div>
          <div><label style={lbl}>加盟金總額</label><input type="number" style={inp} value={total} onChange={e => setTotal(e.target.value)} placeholder="0" /></div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>投資人分攤（每位各自拆 45 / 45 / 10 三期，加總須等於總額）— 只能選「已付訂金」的投資人</div>
            {eligibleInvestors.length === 0 && <div style={{ fontSize: 12, color: 'var(--orange)', marginBottom: 6 }}>⚠ 目前沒有「訂金收款完成」的投資人，先到「訂金」讓投資人付滿 30 萬。</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allocs.map((a, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg)', padding: 8, borderRadius: 8 }}>
                  <InvestorPicker value={a.investor_id} onChange={v => setAlloc(i, 'investor_id', v)} investors={eligibleInvestors} addInvestor={addInvestor} noAdd exclude={pickedIds.filter(id => id !== a.investor_id)} />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="number" style={{ ...inp, flex: 1 }} value={a.amount} onChange={e => setAlloc(i, 'amount', e.target.value)} placeholder="分攤金額" />
                    {allocs.length > 1 && <button onClick={() => setAllocs(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: '0 4px' }}><X size={16} /></button>}
                  </div>
                  {n(a.amount) > 0 && <span style={{ fontSize: 11, color: 'var(--t3)' }}>三期 {stageTargets(a.amount).map(fmt).join(' / ')}</span>}
                </div>
              ))}
            </div>
            <button onClick={() => setAllocs(prev => [...prev, { investor_id: '', amount: '' }])} style={{ marginTop: 8, fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}><Plus size={13} /> 加一位</button>
            <div style={{ fontSize: 12, marginTop: 8, color: Math.abs(allocSum - n(total)) > 0.5 ? 'var(--red)' : 'var(--green)' }}>
              分攤加總 {fmt(allocSum)}{n(total) > 0 ? ` / 總額 ${fmt(n(total))} ${Math.abs(allocSum - n(total)) > 0.5 ? '✗ 不符' : '✓'}` : ''}
            </div>
          </div>
          <button onClick={add} disabled={saving} style={{ padding: 11, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700 }}>{saving ? '建立中…' : '建立'}</button>
        </div>
      )}
      {d.franchises.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>尚無加盟金收款</div>
      ) : d.franchises.map(f => {
        const isExp = expanded === f.id
        const ffis = ffiByFf[f.id] || []
        const pays = paysByFf[f.id] || []
        return (
          <div key={f.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }} onClick={() => setExpanded(isExp ? null : f.id)}>
                <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{f.title || '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', margin: '2px 0 6px 19px' }}>{ffis.map(x => invById[x.investor_id]?.name || '?').join('、') || '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <StatusPill done={f.status === 'completed'} doneText="收款成功" />
                <button onClick={() => del(f)} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: 0 }}><Trash2 size={15} /></button>
              </div>
            </div>
            <div style={{ paddingLeft: 19 }}><Progress paid={n(f.paid_total)} target={n(f.total_amount)} /></div>
            {isExp && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {ffis.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>此加盟金尚無投資人分攤</div>}
                {ffis.map(ffi => {
                  const inv = invById[ffi.investor_id]
                  const targets = stageTargets(ffi.amount)
                  const paidStages = [n(ffi.paid_stage1), n(ffi.paid_stage2), n(ffi.paid_stage3)]
                  const invDone = paidStages.every((p, i) => p >= targets[i])
                  return (
                    <div key={ffi.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {inv?.name || '?'}{inv?.company ? <span style={{ color: 'var(--t3)', fontSize: 11, fontWeight: 500 }}>（{inv.company}）</span> : null}
                          <span style={{ color: 'var(--t3)', fontSize: 12, fontWeight: 500, marginLeft: 6 }}>分攤 {fmt(ffi.amount)}</span>
                        </div>
                        <StatusPill done={invDone} doneText="已收滿" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[0, 1, 2].map(si => {
                          const stage = si + 1
                          const pct = [45, 45, 10][si]
                          const stagePays = pays.filter(p => p.investor_id === ffi.investor_id && p.stage === stage)
                          return (
                            <div key={stage}>
                              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>第 {stage} 期 <span style={{ color: 'var(--t3)', fontWeight: 400 }}>（{pct}%）</span></div>
                              <div style={{ marginBottom: 6 }}><Progress paid={paidStages[si]} target={targets[si]} /></div>
                              <PaymentEditor rows={stagePays} max={targets[si] - paidStages[si]}
                                onAdd={async ({ paid_date, amount, note, attachment_path, attachment_name }) => {
                                  const { data } = await supabase.rpc('liff_add_franchise_payment', { p_line_user_id: luid, p_ff_id: f.id, p_investor_id: ffi.investor_id, p_stage: stage, p_paid_date: paid_date, p_amount: amount, p_note: note || '', p_attachment_path: attachment_path || null, p_attachment_name: attachment_name || null })
                                  if (!data?.ok) { alert('新增失敗：' + (data?.error || '')); return false }
                                  reload(); return true
                                }}
                                onDelete={async (row) => { const { data } = await supabase.rpc('liff_delete_franchise_payment', { p_line_user_id: luid, p_id: row.id }); if (!data?.ok) { alert('刪除失敗'); return } reload() }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════ 投資人名冊 ══════════════
function InvestorTab({ d, luid, addInvestor, reload }) {
  const [form, setForm] = useState({ company: '', name: '', phone: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  const usedIds = useMemo(() => {
    const s = new Set()
    d.deposits.forEach(x => x.investor_id && s.add(x.investor_id))
    d.ffInvestors.forEach(x => s.add(x.investor_id))
    return s
  }, [d.deposits, d.ffInvestors])

  const add = async () => {
    setSaving(true)
    const row = await addInvestor(form)
    setSaving(false)
    if (row) { setForm({ company: '', name: '', phone: '' }); setShowAdd(false) }
  }
  const del = async (i) => {
    if (usedIds.has(i.id)) { alert('此投資人已用於訂金/加盟金，不能刪'); return }
    if (!window.confirm(`刪除投資人「${i.name}」？`)) return
    const { data } = await supabase.rpc('liff_delete_investor', { p_line_user_id: luid, p_id: i.id })
    if (!data?.ok) { alert(data?.error || '刪除失敗'); return }
    reload()
  }

  return (
    <div>
      <button onClick={() => setShowAdd(v => !v)} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
        <Plus size={17} /> 新增投資人
      </button>
      {showAdd && (
        <div style={{ background: 'var(--card)', borderRadius: 12, padding: 14, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><label style={lbl}>公司（選填）</label><input style={inp} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
          <div><label style={lbl}>名字 *</label><input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label style={lbl}>電話 *</label><input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <button onClick={add} disabled={saving} style={{ padding: 11, borderRadius: 10, border: 'none', background: 'var(--green)', color: '#fff', fontWeight: 700 }}>{saving ? '儲存中…' : '新增'}</button>
        </div>
      )}
      {d.investors.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>尚無投資人</div>
      ) : d.investors.map(i => (
        <div key={i.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{i.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{[i.company, i.phone].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: usedIds.has(i.id) ? 'var(--t3)' : 'var(--red)', padding: 0 }} title={usedIds.has(i.id) ? '已被引用，不能刪' : '刪除'}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  )
}
