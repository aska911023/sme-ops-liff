import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Upload, Image, FileText, X, Eye, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — expense_request 簽核 LINE 統一走主系統 DB trigger
// (sme-ops-system: 20260508110000_expense_request_chain_db_trigger.sql)
// 其他 type (leave/overtime/...) trigger 還沒補，先保留 import 給其他頁面用

const STATUS_COLORS = {
  '申請中': 'var(--blue)',
  '已核准': 'var(--green)',
  '待核銷': 'var(--orange)',
  '已核銷': 'var(--cyan)',
  '已駁回': 'var(--red)',
}

const fmt = (n) => n != null ? `NT$ ${Number(n).toLocaleString()}` : '-'

export default function ExpenseRequest() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('list') // list / new / settle / detail
  const [form, setForm] = useState({ account_code: '', title: '', description: '', estimated_amount: '', store: '', supplier: '', is_expense: true })
  const [lineItems, setLineItems] = useState([{ name: '', qty: '', unit_price: '', subtotal: 0 }])
  const [settleForm, setSettleForm] = useState({ actual_amount: '', notes: '' })
  const [files, setFiles] = useState([])
  const [settleFiles, setSettleFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailAtts, setDetailAtts] = useState([])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const updateItem = (i, k, v) => setLineItems(items => {
    const n = [...items]
    n[i] = { ...n[i], [k]: v }
    if (k === 'qty' || k === 'unit_price') n[i].subtotal = (Number(n[i].qty) || 0) * (Number(n[i].unit_price) || 0)
    return n
  })
  const lineTotal = lineItems.reduce((s, li) => s + (li.subtotal || 0), 0)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_expense_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_accounts'),
    ]).then(([r, a]) => {
      setRequests(Array.isArray(r.data) ? r.data : [])
      setAccounts(Array.isArray(a.data) ? a.data : [])
      setLoading(false)
    })
  }

  useEffect(() => {
    if (employee) setForm(f => ({ ...f, store: employee.store || '' }))
    reload()
  }, [employee, lineProfile])

  // Filter accounts by expense toggle
  const filteredAccounts = accounts.filter(a =>
    form.is_expense ? a.type === '費用' : a.type !== '費用'
  )

  // Upload files to Supabase Storage + 透過 RPC 寫 attachment row
  const uploadFiles = async (requestId, fileList, stage) => {
    for (const { file } of fileList) {
      const ext = file.name.split('.').pop()
      const path = `expense-requests/${requestId}/${stage}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
      if (!error) {
        await supabase.rpc('liff_insert_expense_request_attachment', {
          p_line_user_id: lineProfile.lineUserId,
          p_payload: {
            request_id: requestId,
            file_name: file.name,
            storage_path: path,
            file_size: file.size,
            file_type: file.type,
            stage,
          },
        })
      }
    }
  }

  // Submit new request
  const handleSubmit = async () => {
    const validItems = lineItems.filter(li => li.name && li.qty > 0)
    const total = validItems.length > 0 ? validItems.reduce((s, li) => s + (li.subtotal || 0), 0) : Number(form.estimated_amount)
    if (!form.account_code || !form.title || !total) return
    setSubmitting(true)
    const acc = accounts.find(a => a.code === form.account_code)
    const { data, error } = await supabase.rpc('liff_insert_expense_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_payload: {
        account_code: form.account_code,
        account_name: acc?.name || '',
        title: form.title,
        description: form.description || null,
        estimated_amount: total,
        store: form.store || null,
      },
    })

    setSubmitting(false)

    // RPC 出錯（例：沒設定符合金額的簽核鏈）→ 跳 alert，不要沉默
    if (error) {
      alert(`提交失敗：${error.message || '未知錯誤'}`)
      return
    }

    if (data?.id && files.length > 0) {
      await uploadFiles(data.id, files, 'request')
    }

    // ★ 2026-05-08：client-side notifyNewSubmission 已拔除
    // expense_request 簽核 LINE 通知由主系統 DB trigger 統一處理：
    //   - AFTER INSERT expense_requests → 推第 0 關 approvers
    //   - AFTER UPDATE current_step ↑   → 推下一關 approvers
    //   - AFTER UPDATE status 終態      → 推申請人結果
    // (見 sme-ops-system migration 20260508110000)

    // 申請人是組織頂端 → RPC 已自動核准，跟使用者講
    if (data?.auto_approved) {
      alert('✅ 已自動核准（無更上層簽核者）')
    }

    reload()
    setForm({ account_code: '', title: '', description: '', estimated_amount: '', store: '', supplier: '', is_expense: true })
    setLineItems([{ name: '', qty: '', unit_price: '', subtotal: 0 }])
    setFiles([])
    setTab('list')
  }

  // Submit settlement
  const handleSettle = async () => {
    if (!settleForm.actual_amount || !detail) return
    setSubmitting(true)
    const { error } = await supabase.rpc('liff_settle_expense_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: detail.id,
      p_payload: {
        actual_amount: Number(settleForm.actual_amount),
        notes: settleForm.notes || null,
      },
    })

    if (settleFiles.length > 0) {
      await uploadFiles(detail.id, settleFiles, 'settlement')
    }

    setSubmitting(false)
    if (!error) {
      reload()
      setTab('list')
      setDetail(null)
    }
  }

  // Load detail + attachments
  const openDetail = async (req) => {
    setDetail(req)
    const { data } = await supabase.rpc('liff_list_expense_request_attachments', {
      p_line_user_id: lineProfile.lineUserId,
      p_request_id: req.id,
    })
    setDetailAtts(Array.isArray(data) ? data : [])
    setTab('detail')
  }

  // View file
  const viewFile = (att) => {
    const { data } = supabase.storage.from('attachments').getPublicUrl(att.storage_path)
    if (data?.publicUrl) window.open(data.publicUrl, '_blank')
  }

  // Open settle form
  const openSettle = (req) => {
    setDetail(req)
    setSettleForm({ actual_amount: req.estimated_amount, notes: '' })
    setSettleFiles([])
    setTab('settle')
  }

  // File select handler
  const handleFileSelect = (e, setter) => {
    const newFiles = Array.from(e.target.files).map(f => ({
      file: f,
      preview: f.type.startsWith('image') ? URL.createObjectURL(f) : null,
    }))
    setter(prev => [...prev, ...newFiles].slice(0, 5))
    e.target.value = ''
  }

  if (loading) return <div className="page"><div className="spinner" style={{ margin: '80px auto' }} /></div>

  return (
    <div className="page">
      <button className="back-btn" onClick={() => tab === 'list' ? navigate('/') : setTab('list')}>
        <ChevronLeft size={18} /> {tab === 'list' ? '首頁' : '返回'}
      </button>
      <div className="header">
        <div className="header-title">📝 申請（事項 / 採購 / 預算）</div>
      </div>

      {/* ─── LIST VIEW ─── */}
      {tab === 'list' && (
        <>
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16, padding: '12px 0', fontWeight: 700, borderRadius: 12 }}
            onClick={() => setTab('new')}>
            <Plus size={16} /> 新增申請
          </button>

          {requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>尚無申請紀錄</div>
          ) : requests.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 10, padding: 14, cursor: 'pointer' }}
              onClick={() => openDetail(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</div>
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  color: STATUS_COLORS[r.status] || 'var(--t3)',
                  background: `color-mix(in srgb, ${STATUS_COLORS[r.status] || 'var(--t3)'} 15%, transparent)`,
                }}>{r.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)' }}>
                <span>{r.account_code} {r.account_name}</span>
                <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{fmt(r.estimated_amount)}</span>
              </div>
              {r.actual_amount != null && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  實際：{fmt(r.actual_amount)}
                  {r.difference != null && r.difference !== 0 && (
                    <span style={{ color: r.difference > 0 ? 'var(--red)' : 'var(--green)', marginLeft: 6 }}>
                      ({r.difference > 0 ? '+' : ''}{fmt(r.difference)})
                    </span>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{r.created_at?.slice(0, 10)}</div>
            </div>
          ))}
        </>
      )}

      {/* ─── NEW REQUEST FORM ─── */}
      {tab === 'new' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>新增申請（事項 / 採購 / 預算）</div>

          {/* Expense / Non-expense toggle */}
          <div className="form-group">
            <label className="form-label">申請類型</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ val: true, label: '費用' }, { val: false, label: '非費用' }].map(opt => (
                <button key={String(opt.val)} type="button"
                  onClick={() => { set('is_expense', opt.val); set('account_code', '') }}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    background: form.is_expense === opt.val ? 'var(--cyan)' : 'var(--glass)',
                    color: form.is_expense === opt.val ? '#fff' : 'var(--t3)',
                    border: form.is_expense === opt.val ? 'none' : '1px solid var(--border)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">會計科目 *</label>
            <select className="form-input" value={form.account_code} onChange={e => set('account_code', e.target.value)}>
              <option value="">請選擇</option>
              {Object.entries(
                filteredAccounts.reduce((groups, a) => {
                  // Group by: parent accounts vs sub-accounts, and by type
                  const group = a.parent_code ? `${a.type} ─ 子科目` : a.type || '其他'
                  if (!groups[group]) groups[group] = []
                  groups[group].push(a)
                  return groups
                }, {})
              ).map(([group, items]) => (
                <optgroup key={group} label={`── ${group} ──`}>
                  {items.map(a => (
                    <option key={a.code} value={a.code}>
                      {a.parent_code ? '  └ ' : ''}{a.code}  {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">項目名稱 *</label>
            <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="例：採購辦公椅 x5" />
          </div>

          {/* Auto-detected info */}
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--t3)', background: 'var(--glass)', padding: '8px 12px', borderRadius: 8 }}>
            <span>👤 {employee.name}</span>
            {employee.dept && <span>· 📁 {employee.dept}</span>}
            {employee.store && <span>· 🏪 {employee.store}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">供應商/廠商</label>
              <input className="form-input" value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="選填" />
            </div>
            <div className="form-group">
              <label className="form-label">門市</label>
              <input className="form-input" value={form.store} onChange={e => set('store', e.target.value)}
                placeholder={employee.store || '選填'} />
            </div>
          </div>

          {/* Line items */}
          <div className="form-group">
            <label className="form-label">品項明細 *</label>
            {lineItems.map((li, i) => (
              <div key={i} style={{ background: 'var(--glass)', borderRadius: 10, padding: 10, marginBottom: 8, border: '1px solid var(--border)' }}>
                <input className="form-input" value={li.name} onChange={e => updateItem(i, 'name', e.target.value)}
                  placeholder="品名" style={{ marginBottom: 6 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
                  <input className="form-input" type="number" value={li.qty} onChange={e => updateItem(i, 'qty', e.target.value)}
                    placeholder="數量" style={{ textAlign: 'right' }} />
                  <input className="form-input" type="number" value={li.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)}
                    placeholder="單價" style={{ textAlign: 'right' }} />
                  <div style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', fontSize: 13, color: 'var(--cyan)' }}>
                    {li.subtotal ? fmt(li.subtotal) : '$0'}
                  </div>
                </div>
                {lineItems.length > 1 && (
                  <button style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer', marginTop: 4, padding: 0 }}
                    onClick={() => setLineItems(items => items.filter((_, j) => j !== i))}>
                    <X size={12} /> 刪除此品項
                  </button>
                )}
              </div>
            ))}
            <button className="btn" style={{ width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, background: 'var(--glass)', border: '1px dashed var(--border)', cursor: 'pointer', color: 'var(--t2)' }}
              onClick={() => setLineItems(items => [...items, { name: '', qty: '', unit_price: '', subtotal: 0 }])}>
              <Plus size={14} /> 新增品項
            </button>
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 16, fontWeight: 800, color: 'var(--cyan)' }}>
              合計：{fmt(lineTotal)}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">說明</label>
            <textarea className="form-input" value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="用途、規格..." style={{ minHeight: 50, resize: 'vertical' }} />
          </div>

          {/* File Upload */}
          <div className="form-group">
            <label className="form-label">附件（訂購單、報價單）</label>
            <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'var(--glass)', border: '1px solid var(--border)' }}>
              <Upload size={14} /> 選擇檔案
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                onChange={e => handleFileSelect(e, setFiles)} />
            </label>
            {files.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    {f.preview ? (
                      <img src={f.preview} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                    ) : <FileText size={14} color="var(--orange)" />}
                    <span style={{ flex: 1, color: 'var(--t2)' }}>{f.file.name}</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 0 }}
                      onClick={() => { if (f.preview) URL.revokeObjectURL(f.preview); setFiles(prev => prev.filter((_, j) => j !== i)) }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontWeight: 700, borderRadius: 12, marginTop: 8 }}
            onClick={handleSubmit} disabled={submitting}>
            {submitting ? '提交中...' : '提交申請'}
          </button>
        </div>
      )}

      {/* ─── SETTLE FORM ─── */}
      {tab === 'settle' && detail && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>核銷：{detail.title}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>預估金額：{fmt(detail.estimated_amount)}</div>

          <div className="form-group">
            <label className="form-label">實際金額 *</label>
            <input className="form-input" type="number" value={settleForm.actual_amount}
              onChange={e => setSettleForm(f => ({ ...f, actual_amount: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">備註</label>
            <textarea className="form-input" value={settleForm.notes}
              onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} placeholder="選填"
              style={{ minHeight: 50, resize: 'vertical' }} />
          </div>

          {/* Receipt Upload */}
          <div className="form-group">
            <label className="form-label">收據/發票</label>
            <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'var(--glass)', border: '1px solid var(--border)' }}>
              <Upload size={14} /> 上傳收據
              <input type="file" multiple accept="image/*,.pdf" style={{ display: 'none' }}
                onChange={e => handleFileSelect(e, setSettleFiles)} />
            </label>
            {settleFiles.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settleFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    {f.preview ? (
                      <img src={f.preview} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                    ) : <FileText size={14} color="var(--orange)" />}
                    <span style={{ flex: 1, color: 'var(--t2)' }}>{f.file.name}</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 0 }}
                      onClick={() => { if (f.preview) URL.revokeObjectURL(f.preview); setSettleFiles(prev => prev.filter((_, j) => j !== i)) }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontWeight: 700, borderRadius: 12, marginTop: 8 }}
            onClick={handleSettle} disabled={submitting}>
            {submitting ? '提交中...' : '提交核銷'}
          </button>
        </div>
      )}

      {/* ─── DETAIL VIEW ─── */}
      {tab === 'detail' && detail && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{detail.title}</div>
            <span style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              color: STATUS_COLORS[detail.status],
              background: `color-mix(in srgb, ${STATUS_COLORS[detail.status]} 15%, transparent)`,
            }}>{detail.status}</span>
          </div>

          <div className="info-row"><span>科目</span><span>{detail.account_code} {detail.account_name}</span></div>
          <div className="info-row"><span>部門</span><span>{detail.department || '-'}</span></div>
          {detail.supplier && <div className="info-row"><span>供應商</span><span>{detail.supplier}</span></div>}
          {detail.store && <div className="info-row"><span>門市</span><span>{detail.store}</span></div>}
          {detail.description && <div className="info-row"><span>說明</span><span style={{ textAlign: 'right', maxWidth: '60%' }}>{detail.description}</span></div>}

          {/* Line items */}
          {detail.items?.length > 0 && (
            <div style={{ margin: '8px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>品項明細</div>
              {detail.items.map((li, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{li.name}</div>
                    <div style={{ color: 'var(--t3)', fontSize: 11 }}>{li.qty} x {fmt(li.unit_price)}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(li.subtotal)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, margin: '12px 0', background: 'var(--glass)', padding: 12, borderRadius: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>預估</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(detail.estimated_amount)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>實際</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{detail.actual_amount != null ? fmt(detail.actual_amount) : '-'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>差異</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: detail.difference > 0 ? 'var(--red)' : detail.difference < 0 ? 'var(--green)' : 'var(--t1)' }}>
                {detail.difference != null ? fmt(detail.difference) : '-'}
              </div>
            </div>
          </div>

          {detail.reject_reason && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>
              駁回原因：{detail.reject_reason}
            </div>
          )}

          {/* Attachments */}
          {detailAtts.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>附件</div>
              {detailAtts.map(att => (
                <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                  {att.file_type?.startsWith('image') ? <Image size={14} color="var(--blue)" /> : <FileText size={14} color="var(--orange)" />}
                  <span style={{ flex: 1, color: 'var(--t2)' }}>{att.file_name}</span>
                  <span style={{ fontSize: 10, color: 'var(--t3)', padding: '1px 6px', borderRadius: 4, background: 'var(--glass)' }}>
                    {att.stage === 'settlement' ? '核銷' : '申請'}
                  </span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cyan)' }} onClick={() => viewFile(att)}>
                    <Eye size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action button for settlement */}
          {detail.status === '已核准' && (
            <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontWeight: 700, borderRadius: 12, marginTop: 14 }}
              onClick={() => openSettle(detail)}>
              <Send size={14} /> 提交核銷
            </button>
          )}

          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 12, textAlign: 'center' }}>
            申請時間：{detail.created_at?.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      )}
    </div>
  )
}
