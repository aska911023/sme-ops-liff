import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, X, Trash2, Pencil } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const fmt = (n) => `NT$ ${Number(n || 0).toLocaleString()}`
const round0 = (n) => Math.round(Number(n) || 0)
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const emptyForm = () => ({
  id: null, store_name: '', address: '', vendor: '', contact_name: '', contact_phone: '',
  items: [{ name: '', amount: '', invoice_separate: false }],
  mgmt_fee_pct: 8, tax_pct: 5, quote_date: todayStr(), note: '',
  payments: [
    { label: '簽約金', pct: 40, due_date: '', amount: '' },
    { label: '第二期', pct: 20, due_date: '', amount: '' },
    { label: '第三期', pct: 20, due_date: '', amount: '' },
    { label: '完工',   pct: 20, due_date: '', amount: '' },
  ],
})

export default function RenovationQuotes() {
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const luid = lineProfile?.lineUserId
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    if (!luid) return
    setLoading(true)
    const { data } = await supabase.rpc('liff_list_renovation_quotes', { p_line_user_id: luid })
    if (!data?.ok) { setForbidden(data?.error === 'FORBIDDEN'); setRows([]); setLoading(false); return }
    setForbidden(false)
    setRows(data.quotes || [])
    setLoading(false)
  }, [luid])
  useEffect(() => { load() }, [load])

  // 工程費小計 = 非發票另開項;監工/稅金算在小計上;發票另開含稅單獨加。總價 = 小計+監工+稅金+發票另開。
  const calc = useMemo(() => {
    const items = form.items || []
    const cf  = items.filter(it => !it.invoice_separate).reduce((s, it) => s + (Number(it.amount) || 0), 0)
    const sep = items.filter(it =>  it.invoice_separate).reduce((s, it) => s + (Number(it.amount) || 0), 0)
    const mgmt = round0(cf * (Number(form.mgmt_fee_pct) || 0) / 100)
    const tax  = round0((cf + mgmt) * (Number(form.tax_pct) || 0) / 100)
    return { cf, sep, mgmt, tax, total: cf + mgmt + tax + sep }
  }, [form.items, form.mgmt_fee_pct, form.tax_pct])

  // 總價變動 → 依各期%自動帶金額(手動改過的不覆蓋)
  useEffect(() => {
    setForm(f => {
      let changed = false
      const payments = f.payments.map(p => {
        if (p._manual || p.pct === '' || p.pct == null) return p
        const amt = round0(calc.total * (Number(p.pct) || 0) / 100)
        if (Number(p.amount) === amt) return p
        changed = true
        return { ...p, amount: amt }
      })
      return changed ? { ...f, payments } : f
    })
  }, [calc.total])

  const openNew = () => { setForm(emptyForm()); setShowForm(true) }
  const openEdit = (r) => {
    setForm({
      id: r.id, store_name: r.store_name || '', address: r.address || '', vendor: r.vendor || '',
      contact_name: r.contact_name || '', contact_phone: r.contact_phone || '',
      items: (r.items || []).length ? r.items.map(it => ({ name: it.name || '', amount: it.amount ?? '', invoice_separate: !!it.invoice_separate, note: it.note || '' })) : [{ name: '', amount: '', invoice_separate: false }],
      mgmt_fee_pct: r.mgmt_fee_pct ?? 8, tax_pct: r.tax_pct ?? 5, quote_date: r.quote_date || todayStr(), note: r.note || '',
      payments: (r.payments || []).length ? r.payments.map(p => ({ label: p.label || '', pct: p.pct ?? '', due_date: p.due_date || '', amount: p.amount ?? '' })) : [],
    })
    setShowForm(true)
  }

  const setItem = (i, k, v) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', amount: '', invoice_separate: false }] }))
  const delItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const setPay = (i, k, v) => setForm(f => ({ ...f, payments: f.payments.map((p, idx) => {
    if (idx !== i) return p
    const np = { ...p, [k]: v }
    if (k === 'amount') np._manual = true
    else if (k === 'pct' && !p._manual) np.amount = v === '' ? '' : round0(calc.total * (Number(v) || 0) / 100)
    return np
  }) }))
  const addPay = () => setForm(f => ({ ...f, payments: [...f.payments, { label: '', pct: '', due_date: '', amount: '' }] }))
  const delPay = (i) => setForm(f => ({ ...f, payments: f.payments.filter((_, idx) => idx !== i) }))

  const save = async () => {
    if (!form.store_name.trim()) { alert('請填門市'); return }
    setSaving(true)
    const payload = {
      id: form.id || null, store_name: form.store_name.trim(), address: form.address.trim(), vendor: form.vendor.trim(),
      contact_name: form.contact_name.trim(), contact_phone: form.contact_phone.trim(),
      construction_fee: calc.cf, mgmt_fee_pct: Number(form.mgmt_fee_pct) || 0, mgmt_fee: calc.mgmt,
      tax_pct: Number(form.tax_pct) || 0, tax: calc.tax, invoice_separate_total: calc.sep, total_amount: calc.total,
      quote_date: form.quote_date || '', note: form.note.trim(),
      items: (form.items || []).filter(it => (it.name && it.name.trim()) || Number(it.amount) > 0)
        .map(it => ({ name: (it.name || '').trim(), amount: Number(it.amount) || 0, invoice_separate: !!it.invoice_separate, note: (it.note || '').trim() })),
      payments: (form.payments || []).filter(p => p.label || p.pct || p.amount || p.due_date)
        .map(p => ({ label: (p.label || '').trim(), pct: p.pct === '' ? '' : String(p.pct), due_date: p.due_date || '', amount: p.amount === '' ? '' : String(p.amount) })),
    }
    const { data, error } = await supabase.rpc('liff_upsert_renovation_quote', { p_line_user_id: luid, p_payload: payload })
    setSaving(false)
    if (error || !data?.ok) { alert('儲存失敗：' + (data?.error || error?.message || '')); return }
    alert(form.id ? '已更新' : '已新增'); setShowForm(false); load()
  }

  const remove = async (r) => {
    if (!window.confirm(`刪除「${r.store_name}」這筆裝潢報價?`)) return
    const { data } = await supabase.rpc('liff_delete_renovation_quote', { p_line_user_id: luid, p_id: r.id })
    if (!data?.ok) { alert('刪除失敗'); return }
    alert('已刪除'); load()
  }

  const inp = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 14, boxSizing: 'border-box' }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 4, display: 'block' }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', padding: 0 }}><ChevronLeft size={22} /></button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>🔨 裝潢報價</div>
      </div>

      {forbidden ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>沒有「裝潢報價」權限,請洽管理員開啟。</div>
      ) : loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <>
          <button onClick={openNew} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: 'var(--orange)', color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
            <Plus size={17} /> 新增報價
          </button>
          {rows.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>還沒有報價,點上面新增</div>
          ) : rows.map(r => (
            <div key={r.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{r.store_name} {r.quote_date && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--t3)' }}>{r.quote_date}</span>}</div>
                  {r.address && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{r.address}</div>}
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3 }}>
                    {[r.vendor, r.contact_name, r.contact_phone].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--red)' }}>{fmt(r.total_amount)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>總價</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: 13 }}>{expanded === r.id ? '收合' : '明細'}</button>
                <button onClick={() => openEdit(r)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}><Pencil size={14} /></button>
                <button onClick={() => remove(r)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--red)' }}><Trash2 size={14} /></button>
              </div>
              {expanded === r.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  {(r.items || []).map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span>{it.seq}. {it.name}{it.invoice_separate ? ' (發票另開)' : ''}</span><b>{fmt(it.amount)}</b>
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, color: 'var(--t2)' }}>
                    <span>工程費 {fmt(r.construction_fee)}</span><span>監工 {r.mgmt_fee_pct}% {fmt(r.mgmt_fee)}</span><span>稅金 {r.tax_pct}% {fmt(r.tax)}</span>
                    {Number(r.invoice_separate_total) > 0 && <span>發票另開 {fmt(r.invoice_separate_total)}</span>}
                  </div>
                  {(r.payments || []).length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {r.payments.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--t2)' }}>
                          <span>第{p.phase_no}期 {p.label} {p.pct != null ? p.pct + '%' : ''} {p.due_date || ''}</span><b>{p.amount != null ? fmt(p.amount) : '-'}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.note && <div style={{ marginTop: 6, color: 'var(--t2)' }}>備註：{r.note}</div>}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 12px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg)', borderRadius: 14, padding: 16, margin: '12px auto 120px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{form.id ? '編輯' : '新增'}裝潢報價</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--t3)' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={lbl}>門市 *</label><input style={inp} value={form.store_name} onChange={e => setForm(f => ({ ...f, store_name: e.target.value }))} placeholder="門市名稱(新店可直接填)" /></div>
              <div><label style={lbl}>地址</label><input style={inp} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>廠商</label><input style={inp} value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>報價日期</label><input type="date" style={inp} value={form.quote_date} onChange={e => setForm(f => ({ ...f, quote_date: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label style={lbl}>負責人</label><input style={inp} value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>電話</label><input style={inp} value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} /></div>
              </div>
            </div>

            {/* 工程項目明細 */}
            <div style={{ background: 'var(--card)', borderRadius: 10, padding: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>工程項目明細</span>
                <button onClick={addItem} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>+ 加一項</button>
              </div>
              {form.items.map((it, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...inp, padding: '7px 8px', flex: 1 }} placeholder={`項目 ${i + 1}`} value={it.name} onChange={e => setItem(i, 'name', e.target.value)} />
                    <input type="number" style={{ ...inp, padding: '7px 8px', width: 110 }} placeholder="報價" value={it.amount} onChange={e => setItem(i, 'amount', e.target.value)} />
                    <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: '0 2px' }}><Trash2 size={15} /></button>
                  </div>
                  <label style={{ fontSize: 12, color: 'var(--t2)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <input type="checkbox" checked={!!it.invoice_separate} onChange={e => setItem(i, 'invoice_separate', e.target.checked)} /> 發票另開(含稅、不吃監工/稅金)
                  </label>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <div style={{ flex: 1 }}><label style={lbl}>監工管理費 %</label><input type="number" style={inp} value={form.mgmt_fee_pct} onChange={e => setForm(f => ({ ...f, mgmt_fee_pct: e.target.value }))} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>稅金 %</label><input type="number" style={inp} value={form.tax_pct} onChange={e => setForm(f => ({ ...f, tax_pct: e.target.value }))} /></div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 13 }}>
                <span>小計 <b>{fmt(calc.cf)}</b></span><span>監工 <b>{fmt(calc.mgmt)}</b></span><span>稅金 <b>{fmt(calc.tax)}</b></span>
                {calc.sep > 0 && <span>發票另開 <b>{fmt(calc.sep)}</b></span>}
                <span style={{ marginLeft: 'auto' }}>總價 <b style={{ color: 'var(--red)' }}>{fmt(calc.total)}</b></span>
              </div>
            </div>

            {/* 付款分期 */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>付款分期</span>
                <button onClick={addPay} style={{ fontSize: 12, padding: '3px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>+ 加一期</button>
              </div>
              {form.payments.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input style={{ ...inp, padding: '7px 8px', flex: 1 }} placeholder={`第${i + 1}期`} value={p.label} onChange={e => setPay(i, 'label', e.target.value)} />
                  <input type="number" style={{ ...inp, padding: '7px 8px', width: 52 }} placeholder="%" value={p.pct} onChange={e => setPay(i, 'pct', e.target.value)} />
                  <input type="date" style={{ ...inp, padding: '7px 6px', width: 130 }} value={p.due_date} onChange={e => setPay(i, 'due_date', e.target.value)} />
                  <button onClick={() => delPay(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', padding: '0 2px' }}><Trash2 size={15} /></button>
                </div>
              ))}
              {form.payments.map((p, i) => p.amount !== '' && p.amount != null && (
                <div key={'a' + i} style={{ fontSize: 12, color: 'var(--t3)', paddingLeft: 2 }}>{p.label || `第${i + 1}期`}：{fmt(p.amount)}</div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}><label style={lbl}>備註</label><textarea style={{ ...inp, minHeight: 54 }} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontWeight: 600 }}>取消</button>
              <button onClick={save} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: 'var(--orange)', color: '#fff', fontWeight: 700 }}>{saving ? '儲存中…' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
