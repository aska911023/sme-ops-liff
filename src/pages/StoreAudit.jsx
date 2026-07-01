import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, Check, X, ClipboardCheck, AlertCircle, Edit3, Send, Paperclip } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import SignaturePad from '../components/SignaturePad'
import EmployeePicker from '../components/EmployeePicker'

const STATUS_COLOR = {
  '草稿':   '#94a3b8',
  '待確認': '#6366f1',
  '申請中': '#f59e0b',
  '已核准': '#22c55e',
  '已退回': '#ef4444',
}

export default function StoreAudit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile, employee } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // 編輯狀態（草稿）
  const [employees, setEmployees] = useState([])
  const [draftOnDuty, setDraftOnDuty] = useState([])  // [{employee_id, employee_name, signature_data_url}]
  const [signingIdx, setSigningIdx] = useState(null)

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId || !id) return
    setLoading(true)
    const { data: res, error } = await supabase.rpc('liff_get_store_audit_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_audit_id: Number(id),
    })
    if (error || !res?.ok) {
      alert('載入失敗：' + (error?.message || res?.error || 'unknown'))
      setLoading(false); return
    }
    setData(res)
    setDraftOnDuty((res.on_duty || []).map(d => ({ ...d })))
    setLoading(false)
  }, [lineProfile?.lineUserId, id])

  useEffect(() => { load() }, [load])

  // 載員工清單（編輯時用）— 走 SECURITY DEFINER RPC 繞過 anon RLS
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_employees', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => setEmployees(data?.list || []))
  }, [lineProfile?.lineUserId])

  const CATEGORY_ORDER = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }
  const grouped = useMemo(() => {
    if (!data?.items) return {}
    const map = data.items.reduce((acc, item) => {
      const k = item.category_code
      if (!acc[k]) acc[k] = { name: item.category_name, items: [] }
      acc[k].items.push(item)
      return acc
    }, {})
    return Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => (CATEGORY_ORDER[a] || 99) - (CATEGORY_ORDER[b] || 99))
    )
  }, [data])

  const stats = useMemo(() => {
    if (!data?.items) return { passed: 0, failed: 0, pending: 0, deducted: 0, total: 0 }
    const passed = data.items.filter(i => i.passed === true).length
    const failed = data.items.filter(i => i.passed === false).length
    const pending = data.items.filter(i => i.passed === null).length
    const deducted = data.items.filter(i => i.passed === false).reduce((s, i) => s + (i.deduct_score || 0), 0)
    const total = data.items.reduce((s, i) => s + (i.deduct_score || 0), 0)
    return { passed, failed, pending, deducted, total }
  }, [data])

  const a = data?.audit
  const isDraft = a?.status === '草稿'
  const isAuditor = a?.auditor_id === employee?.id
  const canEdit = isDraft && isAuditor

  // ─── 編輯：更新項目（走 RPC 繞 anon RLS）───
  const updateItem = async (itemId, patch) => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === itemId ? { ...i, ...patch } : i),
    }))
    await supabase.rpc('liff_update_store_audit_item', {
      p_line_user_id: lineProfile.lineUserId,
      p_item_id: itemId,
      p_passed: patch.passed ?? null,
      p_responsible_employee_id: patch.responsible_employee_id ?? null,
      p_remark: patch.remark ?? null,
      p_attachments: patch.attachments !== undefined ? patch.attachments : null,
    })
  }

  // ─── 編輯：當班人員 ───
  const addDraftStaff = () => {
    if (draftOnDuty.length >= 3) { alert('最多 3 人'); return }
    setDraftOnDuty(prev => [...prev, { employee_id: null, employee_name: '' }])
  }
  const updateDraftStaff = (idx, empId) => {
    const emp = employees.find(e => e.id === Number(empId))
    setDraftOnDuty(prev => prev.map((d, i) => i === idx
      ? { ...d, employee_id: emp?.id || null, employee_name: emp?.name || '' }
      : d))
  }
  const removeDraftStaff = (idx) => setDraftOnDuty(prev => prev.filter((_, i) => i !== idx))

  // ─── 上傳簽名到 Storage ───
  const uploadSignature = async (dataUrl, audId, empId) => {
    if (dataUrl.startsWith('http')) return dataUrl
    const blob = await (await fetch(dataUrl)).blob()
    const path = `${audId}/${empId || 'anon'}_${Date.now()}.png`
    const { error } = await supabase.storage.from('audit-signatures')
      .upload(path, blob, { contentType: 'image/png', upsert: true })
    if (error) throw error
    return supabase.storage.from('audit-signatures').getPublicUrl(path).data.publicUrl
  }

  // ─── 送出 ───
  const doSubmit = async () => {
    if (stats.pending > 0) { alert(`還有 ${stats.pending} 項未評核`); return }
    if (draftOnDuty.length === 0) { alert('請至少選 1 名當班人員'); return }
    const unsigned = draftOnDuty.filter(d => !d.signature_data_url)
    if (unsigned.length > 0) { alert(`還有 ${unsigned.length} 位當班人員未簽名`); return }
    setBusy(true)
    try {
      const uploaded = await Promise.all(draftOnDuty.map(async d => ({
        employee_id: d.employee_id,
        employee_name: d.employee_name,
        signature: await uploadSignature(d.signature_data_url, Number(id), d.employee_id),
      })))
      const { data: res, error } = await supabase.rpc('submit_store_audit', {
        p_audit_id: Number(id), p_on_duty: uploaded,
      })
      if (error) throw error
      if (!res?.ok) throw new Error(res?.error || 'unknown')
      alert(res.event === 'auto_approved_no_chain' ? '已核准（無簽核鏈設定）' : '已送出，進入簽核流程')
      load()
    } catch (err) {
      alert('送出失敗：' + (err.message || err))
    } finally {
      setBusy(false)
    }
  }

  const doApprove = async () => {
    if (busy) return
    if (!confirm('確認核准此份稽核？')) return
    setBusy(true)
    // liff_approve_request 500 行大 function 在 20260604 restore 時把 store_audit 分支洗掉了
    // 改走獨立 RPC liff_store_audit_approve（20260701220000）
    const { data: res, error } = await supabase.rpc('liff_store_audit_approve', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: Number(id), p_action: 'approve', p_reason: null,
    })
    setBusy(false)
    if (error || !res?.ok) { alert('失敗：' + (error?.message || res?.error || 'unknown')); return }
    alert('完成'); load()
  }

  const doReject = async () => {
    if (busy) return
    if (!rejectReason.trim()) { alert('請填退回原因'); return }
    setBusy(true)
    const { data: res, error } = await supabase.rpc('liff_store_audit_approve', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: Number(id), p_action: 'reject', p_reason: rejectReason.trim(),
    })
    setBusy(false)
    if (error || !res?.ok) { alert('失敗：' + (error?.message || res?.error || 'unknown')); return }
    setShowReject(false); setRejectReason('')
    alert('已退回'); load()
  }

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }
  if (!a) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="empty"><AlertCircle size={32} style={{ opacity: 0.4 }} /><div>找不到稽核單</div></div>
      </div>
    )
  }

  const statusColor = STATUS_COLOR[a.status] || '#94a3b8'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate(-1)}><ChevronLeft size={16} /> 返回</button>

      {/* Header */}
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={18} /> 稽核單 #{a.id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {a.store_name} · {a.audit_date}{a.shift ? ` · ${a.shift}` : ''}
          </div>
        </div>
        <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: `${statusColor}22`, color: statusColor }}>{a.status}</span>
      </div>

      {/* 統計 */}
      <div style={{ margin: '12px 0', padding: 12, background: 'var(--glass)', borderRadius: 10, display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: 12 }}>
        <Stat label="合格" value={stats.passed} color="#22c55e" />
        <Stat label="不合格" value={stats.failed} color="#ef4444" />
        {stats.pending > 0 && <Stat label="未評核" value={stats.pending} color="#f59e0b" />}
        <Stat label="扣分" value={`${stats.deducted}/${stats.total}`} color={stats.deducted > 0 ? '#ef4444' : 'var(--t2)'} />
      </div>

      <Section title="基本資訊">
        <Row label="稽核員" value={a.auditor_name} />
        {a.arrive_time && <Row label="到店" value={a.arrive_time.slice(0, 5)} />}
        {a.depart_time && <Row label="離店" value={a.depart_time.slice(0, 5)} />}
        {a.approver && <Row label={a.status === '已退回' ? '退回人' : '核簽人'} value={a.approver} />}
        {a.reject_reason && <Row label="退回原因" value={a.reject_reason} color="#ef4444" />}
      </Section>

      {/* 當班人員（草稿可編輯，否則只讀） */}
      <Section title={canEdit ? '當班人員（1~3 人，請現場簽名）' : '當班人員'}>
        {canEdit ? (
          <>
            {draftOnDuty.map((d, idx) => (
              <div key={idx} style={{ marginBottom: 8, padding: 8, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <EmployeePicker value={d.employee_id || ''} employees={employees}
                      onChange={(v) => updateDraftStaff(idx, v)}
                      placeholder="選當班人員" />
                  </div>
                  <button onClick={() => removeDraftStaff(idx)}
                    style={{ padding: '0 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t3)', minHeight: 38 }}>×</button>
                </div>
                {d.employee_id && (
                  d.signature_data_url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <img src={d.signature_data_url} alt="簽名" style={{ height: 32, background: '#fff', borderRadius: 4 }} />
                      <span style={{ flex: 1, fontSize: 11, color: '#22c55e' }}>✓ 已簽</span>
                      <button onClick={() => setSigningIdx(idx)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)' }}>重簽</button>
                    </div>
                  ) : (
                    <button onClick={() => setSigningIdx(idx)}
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      <Edit3 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />請當班人員簽名
                    </button>
                  )
                )}
              </div>
            ))}
            {draftOnDuty.length < 3 && (
              <button onClick={addDraftStaff}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--t2)', fontSize: 12 }}>
                + 新增當班人員
              </button>
            )}
          </>
        ) : (
          (data.on_duty || []).map((d, i) => (
            <div key={i} style={{ padding: '6px 0', borderBottom: i < data.on_duty.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span>{d.employee_name}</span>
                {d.confirmed && <span style={{ color: '#22c55e', fontSize: 11 }}>✓ 已簽</span>}
              </div>
              {d.signature_data_url && (
                <img src={d.signature_data_url} alt="簽名" style={{ height: 36, background: '#fff', borderRadius: 4 }} />
              )}
            </div>
          ))
        )}
      </Section>

      {/* 評核項目 */}
      {Object.entries(grouped).map(([code, group]) => (
        <Section key={code} title={`${code}、${group.name}`}
          subtitle={`${group.items.length} 項 · 不合格 ${group.items.filter(i => i.passed === false).length}`}>
          {group.items.map(item => (
            <ItemRow key={item.id} item={item} canEdit={canEdit} employees={employees} auditId={Number(id)} onChange={p => updateItem(item.id, p)} />
          ))}
        </Section>
      ))}

      {/* 底部 action */}
      {canEdit && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 24px', background: 'var(--bg)' }}>
          <button onClick={doSubmit} disabled={busy}
            style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontSize: 15, fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
            <Send size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {busy ? '送出中…' : '送出稽核'}
          </button>
        </div>
      )}

      {data.can_approve && !showReject && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 24px', background: 'var(--bg)', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowReject(true)} disabled={busy}
            style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 14, fontWeight: 700 }}>
            <X size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />退回
          </button>
          <button onClick={doApprove} disabled={busy}
            style={{ flex: 2, padding: 12, borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
            <Check size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />核准
          </button>
        </div>
      )}

      {/* 退回 modal */}
      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowReject(false) }}>
          <div style={{ width: '100%', maxWidth: 480, padding: 20, background: 'var(--bg)', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>退回原因 *</div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="請說明退回理由…" rows={4}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--t1)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setShowReject(false); setRejectReason('') }}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--t2)' }}>取消</button>
              <button onClick={doReject} disabled={busy || !rejectReason.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 700, opacity: (busy || !rejectReason.trim()) ? 0.5 : 1 }}>確定退回</button>
            </div>
          </div>
        </div>
      )}

      {/* 簽名 pad */}
      {signingIdx !== null && (
        <SignaturePad open signerName={draftOnDuty[signingIdx]?.employee_name || ''}
          onClose={() => setSigningIdx(null)}
          onConfirm={(dataUrl) => {
            setDraftOnDuty(prev => prev.map((d, i) => i === signingIdx ? { ...d, signature_data_url: dataUrl } : d))
            setSigningIdx(null)
          }} />
      )}
    </div>
  )
}

// ─── 評核項目單列（草稿可編輯）───
function ItemRow({ item, canEdit, employees, auditId, onChange }) {
  const [uploading, setUploading] = useState(false)
  const failed = item.passed === false
  const showRemark = item.category_code === '五' && item.item_no === 6
  const attachments = Array.isArray(item.attachments) ? item.attachments : []

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const remaining = 15 - attachments.length
    if (remaining <= 0) { alert('最多 15 張附件'); e.target.value = ''; return }
    setUploading(true)
    try {
      const urls = await Promise.all(files.slice(0, remaining).map(async (file) => {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${auditId}/${item.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage.from('audit-photos').upload(path, file, { upsert: false })
        if (error) throw error
        return supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl
      }))
      onChange({ attachments: [...attachments, ...urls] })
    } catch (err) {
      alert('上傳失敗：' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const removeAttachment = (url) => onChange({ attachments: attachments.filter(u => u !== url) })

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', background: failed ? 'rgba(239,68,68,0.05)' : 'transparent', marginLeft: -6, marginRight: -6, paddingLeft: 6, paddingRight: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 18 }}>{item.item_no}</span>
        <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{item.item_text}</span>
        {canEdit ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onChange({ passed: true })}
              style={{
                padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: 'none',
                background: item.passed === true ? '#22c55e' : 'rgba(148,163,184,0.2)',
                color: item.passed === true ? '#fff' : 'var(--t3)',
              }}>✓</button>
            <button onClick={() => onChange({ passed: false })}
              style={{
                padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: 'none',
                background: item.passed === false ? '#ef4444' : 'rgba(148,163,184,0.2)',
                color: item.passed === false ? '#fff' : 'var(--t3)',
              }}>-{item.deduct_score}</button>
          </div>
        ) : (
          <span style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
            background: item.passed === true ? 'rgba(34,197,94,0.15)' : item.passed === false ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)',
            color: item.passed === true ? '#22c55e' : item.passed === false ? '#ef4444' : 'var(--t3)',
          }}>
            {item.passed === true ? '✓' : item.passed === false ? `-${item.deduct_score}` : '—'}
          </span>
        )}
      </div>
      {failed && canEdit && (
        <div style={{ marginTop: 6, marginLeft: 24 }}>
          <EmployeePicker value={item.responsible_employee_id || ''} employees={employees}
            onChange={(v) => {
              const emp = employees.find(x => x.id === Number(v))
              onChange({ responsible_employee_id: emp?.id || null, responsible_employee_name: emp?.name || null })
            }}
            placeholder="未指定責任人（算當班全體）" />
        </div>
      )}
      {failed && !canEdit && item.responsible_employee_name && (
        <div style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 24, marginTop: 2 }}>責任人：{item.responsible_employee_name}</div>
      )}
      {showRemark && (
        <div style={{ marginTop: 8, marginLeft: 24 }}>
          {/* 備註 */}
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>備註（現場數量 / 差異說明）</div>
          {canEdit ? (
            <textarea
              value={item.remark || ''}
              onChange={e => onChange({ remark: e.target.value })}
              placeholder="例：商品A 盤點11支，系統顯示10支"
              rows={2}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--t1)', fontSize: 12, resize: 'vertical' }}
            />
          ) : (
            item.remark
              ? <div style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', padding: '6px 8px', background: 'var(--glass)', borderRadius: 6 }}>{item.remark}</div>
              : <div style={{ fontSize: 12, color: 'var(--t3)' }}>—</div>
          )}

          {/* 附件照片 */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                <Paperclip size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                附件照片（{attachments.length}/15）
              </span>
              {canEdit && attachments.length < 15 && (
                <label style={{ fontSize: 12, color: '#38bdf8', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.5 : 1 }}>
                  {uploading ? '上傳中…' : '＋ 新增'}
                  <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFiles} disabled={uploading} />
                </label>
              )}
            </div>
            {attachments.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {attachments.map((url, i) => (
                  <div key={url} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: 'var(--glass)' }}>
                    <img src={url} alt={`附件 ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onClick={() => window.open(url, '_blank')} />
                    {canEdit && (
                      <button onClick={() => removeAttachment(url)}
                        style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 14, lineHeight: '20px', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            ) : canEdit ? (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, border: '1px dashed var(--border)', borderRadius: 8, cursor: uploading ? 'default' : 'pointer', fontSize: 12, color: 'var(--t3)' }}>
                <Paperclip size={14} /> {uploading ? '上傳中…' : '點此拍照或選圖（最多 15 張）'}
                <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFiles} disabled={uploading} />
              </label>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>—</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginTop: 16, padding: 12, background: 'var(--glass)', borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>
        {subtitle && <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400 }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ color: color || 'var(--t1)', textAlign: 'right', maxWidth: '70%' }}>{value}</span>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
