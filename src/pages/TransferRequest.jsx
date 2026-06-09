import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Package, X, CheckCircle2, XCircle, FileCheck, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 商品調撥申請 — LIFF 端
//   - 列我發的單
//   - 列待我簽核的單
//   - 新增調撥申請
//   - 填驗收（待驗收狀態 + 自己是申請人）
//   - 簽核（核准/駁回）

const TRANSFER_TYPE_OPTS = [
  { value: 'warehouse_to_store', label: '總倉 → 門市' },
  { value: 'store_to_store',     label: '門市 → 門市' },
  { value: 'store_to_warehouse', label: '門市 → 總倉' },
]

const REASON_OPTS = [
  '銷售需求', '活動檔期', '新品上市', '客戶預訂',
  '庫存不足', '即將缺貨', '門市調整', '商品損耗補充',
]

const STATUS_STYLE = {
  '申請審核中': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)' },
  '待驗收':     { bg: 'rgba(34,211,238,0.15)', color: 'var(--cyan)' },
  '驗收審核中': { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  '已完成':     { bg: 'var(--green-dim)',       color: 'var(--green)' },
  '已駁回':     { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
  '已撤回':     { bg: 'var(--card)',            color: 'var(--t3)' },
}

const emptyForm = () => ({
  transfer_type: 'warehouse_to_store',
  from_store_id: '',
  to_store_id: '',
  needed_date: '',
  reasons: [],
  reason_other: '',
  items: [{ product_code: '', product_name: '', spec: '', unit: '', requested_qty: '' }],
  attachFiles: [],  // [{ file, preview }]
})

// 直接上傳到 supabase storage（LIFF 簡化版）
async function uploadAttachments({ stage, formId, empId, files }) {
  if (!files?.length) return []
  const dir = stage === 'apply' ? 'goods-transfer-apply' : 'goods-transfer-receipt'
  const urls = []
  for (const { file } of files) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${dir}/emp-${empId || 'unknown'}/${formId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { cacheControl: '3600', upsert: false })
    if (error) { alert(`附件上傳失敗：${file.name} - ${error.message}`); continue }
    const { data } = supabase.storage.from('attachments').getPublicUrl(path)
    urls.push({ url: data.publicUrl, name: file.name, path })
    // 寫 form_attachments metadata（給主系統可看到）
    await supabase.from('form_attachments').insert({
      form_type: stage === 'apply' ? 'goods_transfer_apply' : 'goods_transfer_receipt',
      form_id: formId, storage_bucket: 'attachments', storage_path: path,
      file_name: file.name, file_size: file.size, mime_type: file.type, uploaded_by_id: empId,
    })
  }
  return urls
}

export default function TransferRequest() {
  const { lineProfile, employee } = useAuth()
  const navigate = useNavigate()
  // 簽核已搬到 /approve 簽核中心（form group 下的「調撥-申請 / 調撥-驗收」tab）
  // 這頁只負責「我的調撥」(申請/重送/填驗收)
  const [myRecords, setMyRecords] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [detailRow, setDetailRow] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_my_transfer_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_stores_for_transfer',  { p_line_user_id: lineProfile.lineUserId }),
    ]).then(([m, s]) => {
      setMyRecords(Array.isArray(m.data) ? m.data : [])
      setStores(Array.isArray(s.data) ? s.data : [])
      setLoading(false)
    })
  }
  useEffect(() => { reload() }, [lineProfile])

  // URL 帶 ?id=X 時自動開該單詳情（給 LINE 卡片「填驗收」按鈕用）
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id || !myRecords.length || detailRow) return
    const target = myRecords.find(r => String(r.id) === String(id))
    if (target) setDetailRow(target)
  }, [myRecords, detailRow])

  const isStoreToStore = form.transfer_type === 'store_to_store'
  const targetStore = isStoreToStore && form.to_store_id ? stores.find(s => s.id === Number(form.to_store_id)) : null
  const autoApplicantId = targetStore?.manager_id
  const blockedAsNonManager = isStoreToStore && form.to_store_id && autoApplicantId !== employee?.id

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const updateItem = (i, k, v) => setForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }))
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { product_code: '', product_name: '', spec: '', unit: '', requested_qty: '' }] }))
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const toggleReason = (r) => setForm(f => ({ ...f, reasons: f.reasons.includes(r) ? f.reasons.filter(x => x !== r) : [...f.reasons, r] }))

  const handleSubmit = async () => {
    if (form.items.some(it => !it.product_code || !it.product_name || !it.requested_qty)) { alert('明細必填欄位未填'); return }
    if (!form.reasons.length && !form.reason_other) { alert('請至少選一個申請原因'); return }
    if (form.transfer_type !== 'warehouse_to_store' && !form.from_store_id) { alert('請選調出門市'); return }
    if (form.transfer_type !== 'store_to_warehouse' && !form.to_store_id) { alert('請選調入門市'); return }
    if (blockedAsNonManager) { alert('門市↔門市調撥必須由調入門市店長發起'); return }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('liff_insert_transfer_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_payload: {
        transfer_type: form.transfer_type,
        from_store_id: form.from_store_id || null,
        to_store_id:   form.to_store_id || null,
        needed_date:   form.needed_date || null,
        reasons:       form.reasons,
        reason_other:  form.reason_other,
        items:         form.items.map(it => ({ ...it, requested_qty: Number(it.requested_qty) })),
      },
    })
    if (error) { setSubmitting(false); alert('送出失敗：' + error.message); return }
    // 上傳附件
    if (form.attachFiles.length > 0 && data?.id) {
      await uploadAttachments({ stage: 'apply', formId: data.id, empId: employee?.id, files: form.attachFiles })
    }
    setSubmitting(false)
    alert(`已送出 ${data?.document_no || ''}`)
    setForm(emptyForm())
    setShowForm(false)
    reload()
  }

  const handleSubmitReceipt = async (row, items, receiptFiles) => {
    setSubmitting(true)
    if (receiptFiles?.length > 0) {
      await uploadAttachments({ stage: 'receipt', formId: row.id, empId: employee?.id, files: receiptFiles })
    }
    const { data, error } = await supabase.rpc('liff_submit_transfer_receipt', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: row.id,
      p_items: items.map(it => ({ id: it.id, received_qty: it.received_qty })),
      p_attachments: [],
    })
    setSubmitting(false)
    if (error || !data?.ok) { alert('送驗收失敗：' + (error?.message || data?.error)); return }
    alert('已送驗收審核')
    setDetailRow(null); reload()
  }

  const handleApprove = async (row, action) => {
    let reason = null
    if (action === 'reject') {
      reason = window.prompt('駁回原因：')
      if (!reason) return
    }
    setSubmitting(true)
    const { data, error } = await supabase.rpc('liff_approve_transfer', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: row.id, p_action: action, p_reason: reason,
    })
    setSubmitting(false)
    if (error || !data?.ok) { alert('失敗：' + (error?.message || data?.error)); return }
    alert(action === 'approve' ? '已核准' : '已駁回')
    setDetailRow(null); reload()
  }

  // 一鍵重送：已駁回 → 申請審核中（內容不變）
  const handleResubmit = async (row) => {
    if (!window.confirm(`確定一鍵重送單號 ${row.document_no}？（內容不變，重跑申請鏈）`)) return
    setSubmitting(true)
    const { data, error } = await supabase.rpc('liff_resubmit_transfer_request', {
      p_line_user_id: lineProfile.lineUserId, p_id: row.id,
    })
    setSubmitting(false)
    if (error || !data?.ok) { alert('重送失敗：' + (error?.message || data?.error)); return }
    alert('已重送，狀態回到申請審核中')
    setDetailRow(null); reload()
  }

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>

  const records = myRecords

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📦 商品調撥</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(emptyForm()); setShowForm(true) }}>
          <Plus size={14} /> 新增
        </button>
      </div>

      {/* 提示：簽核去簽核中心 */}
      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--cyan-dim)', color: 'var(--cyan)', fontSize: 12, marginBottom: 12, cursor: 'pointer' }}
        onClick={() => navigate('/approve/transfer-apply')}>
        💡 要簽核別人的調撥單？去 <b>簽核中心 → 自訂表單 → 調撥-申請/驗收</b>
      </div>

      {/* 表單 */}
      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">調撥類型</label>
            <select className="form-input" value={form.transfer_type} onChange={e => set('transfer_type', e.target.value)}>
              {TRANSFER_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {form.transfer_type !== 'store_to_warehouse' && (
            <div className="form-group">
              <label className="form-label">調入門市</label>
              <select className="form-input" value={form.to_store_id} onChange={e => set('to_store_id', e.target.value)}>
                <option value="">— 選擇 —</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {form.transfer_type !== 'warehouse_to_store' && (
            <div className="form-group">
              <label className="form-label">調出門市</label>
              <select className="form-input" value={form.from_store_id} onChange={e => set('from_store_id', e.target.value)}>
                <option value="">— 選擇 —</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {isStoreToStore && form.to_store_id && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12,
              background: blockedAsNonManager ? 'rgba(248,113,113,0.10)' : 'rgba(34,211,238,0.10)',
              border: `1px solid ${blockedAsNonManager ? 'rgba(248,113,113,0.30)' : 'rgba(34,211,238,0.30)'}`,
              color: blockedAsNonManager ? 'var(--red)' : 'var(--cyan)',
            }}>
              {blockedAsNonManager
                ? '⚠️ 你不是該門市店長，無法發起'
                : '🔒 申請人為調入門市店長（你）'}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">需求日期</label>
            <input type="date" className="form-input" value={form.needed_date} onChange={e => set('needed_date', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">商品明細</label>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 24px', gap: 6, marginBottom: 6 }}>
                <input className="form-input" placeholder="編號" style={{ fontSize: 12, padding: '6px' }} value={it.product_code} onChange={e => updateItem(i, 'product_code', e.target.value)} />
                <input className="form-input" placeholder="名稱" style={{ fontSize: 12, padding: '6px' }} value={it.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} />
                <input className="form-input" placeholder="數量" type="number" style={{ fontSize: 12, padding: '6px' }} value={it.requested_qty} onChange={e => updateItem(i, 'requested_qty', e.target.value)} />
                <button onClick={() => removeItem(i)} style={{ border: 'none', background: 'transparent', color: 'var(--red)' }}><X size={14} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={addItem} style={{ marginTop: 4 }}>
              <Plus size={12} /> 加一行
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">申請原因（可複選）</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {REASON_OPTS.map(r => {
                const sel = form.reasons.includes(r)
                return (
                  <button key={r} type="button" onClick={() => toggleReason(r)} style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 12, border: '1px solid var(--border2)',
                    background: sel ? 'var(--cyan-dim)' : 'var(--card)',
                    color: sel ? 'var(--cyan)' : 'var(--t2)',
                  }}>{sel ? '✓ ' : ''}{r}</button>
                )
              })}
            </div>
            <input className="form-input" placeholder="其他原因" style={{ marginTop: 6, fontSize: 12 }}
              value={form.reason_other} onChange={e => set('reason_other', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">附件（截圖 / PDF，最多 5 個）</label>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px', borderRadius: 10, border: '2px dashed var(--border2)',
              color: 'var(--cyan)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              📎 選擇檔案
              <input type="file" multiple accept="image/*,.pdf" hidden
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  const newOnes = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
                  setForm(f => ({ ...f, attachFiles: [...(f.attachFiles || []), ...newOnes].slice(0, 5) }))
                  e.target.value = ''
                }} />
            </label>
            {form.attachFiles?.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {form.attachFiles.map((a, i) => (
                  <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                    {a.file.type.startsWith('image/')
                      ? <img src={a.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', fontSize: 9, color: 'var(--t3)' }}>
                          {(a.file.name.split('.').pop() || '?').toUpperCase()}
                        </div>}
                    <button onClick={() => setForm(f => ({ ...f, attachFiles: f.attachFiles.filter((_, j) => j !== i) }))}
                      style={{ position: 'absolute', top: 1, right: 1, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={9} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting || blockedAsNonManager}>
              {submitting ? '送出中…' : '送出申請'}
            </button>
            <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)' }} onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {records.length === 0 ? (
        <div className="empty">沒有資料</div>
      ) : records.map(r => {
        const st = STATUS_STYLE[r.status] || {}
        return (
          <div key={r.id} className="list-item" onClick={() => setDetailRow(r)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t1)' }}>{r.document_no}</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{r.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)' }}>
              {TRANSFER_TYPE_OPTS.find(o => o.value === r.transfer_type)?.label}
              <span style={{ color: 'var(--t3)', margin: '0 6px' }}>·</span>
              {r.from_label} → {r.to_label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              申請人 {r.applicant_name} · {(r.items || []).length} 項商品
            </div>
          </div>
        )
      })}

      {/* Detail */}
      {detailRow && (
        <DetailModal row={detailRow} employee={employee} onClose={() => setDetailRow(null)}
          onSubmitReceipt={handleSubmitReceipt} onApprove={handleApprove}
          submitting={submitting} />
      )}
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────
function DetailModal({ row, employee, onClose, onSubmitReceipt, onApprove, submitting }) {
  const [items, setItems] = useState(
    (row.items || []).sort((a, b) => a.line_no - b.line_no).map(it => ({ ...it, received_qty: it.received_qty ?? it.requested_qty }))
  )
  const [applyAtts, setApplyAtts] = useState([])
  const [receiptAtts, setReceiptAtts] = useState([])
  const [receiptFiles, setReceiptFiles] = useState([])

  const canSubmitReceipt = row.status === '待驗收' && row.applicant_id === employee?.id
  const canApprove = ['申請審核中', '驗收審核中'].includes(row.status)

  const st = STATUS_STYLE[row.status] || {}

  useEffect(() => {
    Promise.all([
      supabase.from('form_attachments').select('*').eq('form_type', 'goods_transfer_apply').eq('form_id', row.id),
      supabase.from('form_attachments').select('*').eq('form_type', 'goods_transfer_receipt').eq('form_id', row.id),
    ]).then(([a, b]) => {
      setApplyAtts(a.data || [])
      setReceiptAtts(b.data || [])
    })
  }, [row.id])

  const openAtt = (a) => {
    const { data } = supabase.storage.from(a.storage_bucket || 'attachments').getPublicUrl(a.storage_path)
    if (data?.publicUrl) window.open(data.publicUrl, '_blank')
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto',
        background: 'var(--bg)', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>{row.document_no}</div>
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>{row.status}</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--card)', borderRadius: '50%', width: 32, height: 32, color: 'var(--t2)' }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div><b>申請人：</b>{row.applicant_name}</div>
          <div><b>類型：</b>{TRANSFER_TYPE_OPTS.find(o => o.value === row.transfer_type)?.label}</div>
          <div><b>調出 → 調入：</b>{row.from_label} → {row.to_label}</div>
          <div><b>申請日：</b>{row.request_date}</div>
          {row.needed_date && <div><b>需求日：</b>{row.needed_date}</div>}
          {(row.reasons || []).length > 0 && <div><b>原因：</b>{row.reasons.join(', ')}{row.reason_other ? ` · ${row.reason_other}` : ''}</div>}
        </div>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <b style={{ fontSize: 13 }}>商品明細{canSubmitReceipt ? '（請填實收）' : ''}：</b>
          {items.map((it, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.product_name}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                <span style={{ fontFamily: 'monospace' }}>{it.product_code}</span>
                {it.spec && <span> · {it.spec}</span>}
                {it.unit && <span> · {it.unit}</span>}
                <span> · 申請 <b>{Number(it.requested_qty)}</b></span>
              </div>
              {canSubmitReceipt ? (
                <input type="number" className="form-input" style={{ marginTop: 4, padding: '4px 8px', fontSize: 12, width: 100 }}
                  value={it.received_qty}
                  onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, received_qty: e.target.value } : x))}
                  placeholder="實收數量" />
              ) : (
                it.received_qty != null && (
                  <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>實收 <b>{Number(it.received_qty)}</b></div>
                )
              )}
            </div>
          ))}
        </div>

        {row.reject_reason && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>
            <b>駁回原因：</b>{row.reject_reason}
          </div>
        )}

        {/* 一鍵重送 — 已駁回單，僅申請人可重送 */}
        {row.status === '已駁回' && row.applicant_id === employee?.id && (
          <button onClick={() => handleResubmit(row)} disabled={submitting} style={{
            width: '100%', padding: '12px', borderRadius: 8, marginBottom: 12,
            background: 'var(--cyan)', color: '#fff', border: 'none',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
          }}>
            🔁 一鍵重送
          </button>
        )}

        {/* 申請附件 */}
        {applyAtts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>📎 申請附件</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {applyAtts.map((a, i) => (
                <button key={i} onClick={() => openAtt(a)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'var(--cyan-dim)', color: 'var(--cyan)', border: 'none',
                }}>{a.file_name || `附件 ${i+1}`}</button>
              ))}
            </div>
          </div>
        )}

        {/* 驗收附件 */}
        {receiptAtts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>📎 驗收附件</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {receiptAtts.map((a, i) => (
                <button key={i} onClick={() => openAtt(a)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: 'none',
                }}>{a.file_name || `附件 ${i+1}`}</button>
              ))}
            </div>
          </div>
        )}

        {/* 驗收時可上傳新附件 */}
        {canSubmitReceipt && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>📎 上傳驗收附件（截圖 / PDF，最多 5 個）</div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px', borderRadius: 8, border: '2px dashed var(--border2)',
              color: 'var(--cyan)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              📎 選擇檔案
              <input type="file" multiple accept="image/*,.pdf" hidden
                onChange={e => {
                  const files = Array.from(e.target.files || [])
                  const newOnes = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
                  setReceiptFiles(prev => [...prev, ...newOnes].slice(0, 5))
                  e.target.value = ''
                }} />
            </label>
            {receiptFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {receiptFiles.map((a, i) => (
                  <div key={i} style={{ position: 'relative', width: 50, height: 50, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                    {a.file.type.startsWith('image/')
                      ? <img src={a.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', fontSize: 9, color: 'var(--t3)' }}>
                          {(a.file.name.split('.').pop() || '?').toUpperCase()}
                        </div>}
                    <button onClick={() => setReceiptFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ position: 'absolute', top: 1, right: 1, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: 0 }}>
                      <X size={8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {canSubmitReceipt && (
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}
            onClick={() => onSubmitReceipt(row, items, receiptFiles)} disabled={submitting}>
            <FileCheck size={14} /> 送驗收審核
          </button>
        )}
        {canApprove && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => onApprove(row, 'approve')} disabled={submitting}>
              <CheckCircle2 size={14} /> 核准
            </button>
            <button className="btn" style={{ flex: 1, background: 'var(--card)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => onApprove(row, 'reject')} disabled={submitting}>
              <XCircle size={14} /> 駁回
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
