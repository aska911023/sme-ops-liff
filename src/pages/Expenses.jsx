import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, Paperclip, Image, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — 簽核 LINE 統一走主系統 DB trigger

const CATEGORIES = ['交通', '住宿', '餐飲', '設備', '其他']

export default function Expenses() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [accounts, setAccounts] = useState([])  // 會計科目（跟費用申請同源 liff_list_accounts）
  const [trips, setTrips] = useState([]) // for linking
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [form, setForm] = useState({ category: CATEGORIES[0], amount: '', date: '', description: '', receipt: true, business_trip_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [attachFiles, setAttachFiles] = useState([])
  const [existingAttach, setExistingAttach] = useState([])
  const [uploading, setUploading] = useState(false)

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_my_expenses', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_business_trips', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_accounts'),
    ]).then(([e, t, a]) => {
      setRecords(Array.isArray(e.data) ? e.data : [])
      const activeTrips = (Array.isArray(t.data) ? t.data : [])
        .filter(x => ['已核准', '出差中'].includes(x.status))
      setTrips(activeTrips)
      const accs = Array.isArray(a.data) ? a.data : []
      setAccounts(accs)
      setForm(f => ({ ...f, category: f.category || accs[0]?.name || '' }))
      setLoading(false)
    })
  }

  useEffect(() => { reload() }, [lineProfile])

  // 自動進入編輯模式（從 ApprovalStatus 的「編輯重送」按鈕跳過來）
  useEffect(() => {
    if (!resubmitId || editingId || records.length === 0) return
    const target = records.find(r => String(r.id) === String(resubmitId))
    if (target) handleEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmitId, records.length])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ category: accounts[0]?.name || '', amount: '', date: '', description: '', receipt: true, business_trip_id: '' })
    setEditingId(null)
    setShowForm(false)
    setAttachFiles([])
    setExistingAttach([])
  }

  const handleEdit = (r) => {
    setForm({
      category: r.category, amount: r.amount, date: r.date,
      description: r.description || '', receipt: r.receipt,
      business_trip_id: r.business_trip_id || '',
    })
    setExistingAttach(r.attachments || [])
    setAttachFiles([])
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆報帳嗎？')) return
    const { error } = await supabase.rpc('liff_delete_expense', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    setAttachFiles(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))].slice(0, 5))
    e.target.value = ''
  }

  const removeFile = (i) => {
    setAttachFiles(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, j) => j !== i) })
  }

  const uploadReceipts = async (expenseId) => {
    if (attachFiles.length === 0) return []
    const urls = []
    for (const { file } of attachFiles) {
      const ext = file.name.split('.').pop()
      const path = `emp-${employee.id}/${expenseId}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { upsert: true })
      if (error) {
        alert(`收據上傳失敗: ${error.message}`)
      } else {
        const { data } = supabase.storage.from('expense-receipts').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    // ★ URL 寫回 expenses.attachments：anon 對 expenses 沒 grant，走 SECURITY DEFINER RPC
    // (liff_set_expense_attachments 內驗證本人擁有才更新)。expenseId 必須是真 id。
    if (urls.length > 0 && expenseId) {
      const { error: updErr } = await supabase.rpc('liff_set_expense_attachments', {
        p_line_user_id: lineProfile.lineUserId,
        p_id: expenseId,
        p_urls: urls,
      })
      if (updErr) console.warn('attach urls update fail:', updErr)
    }
    return urls
  }

  const handleSubmit = async () => {
    if (!form.amount || !form.date) { alert('請填寫金額和日期'); return }
    setSubmitting(true)

    const payload = {
      category: form.category,
      amount: Number(form.amount),
      date: form.date,
      description: form.description,
      // receipt / business_trip_id / attachments 需要後端擴充，此版先送基礎欄位
    }

    const { data: upRes, error } = await supabase.rpc('liff_upsert_expense', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: editingId,
      p_payload: payload,
    })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    const newId = editingId || upRes?.id || null   // 接住 upsert 回傳的真 id（給附件寫回用）

    // 附件上傳維持原流程（Supabase Storage 的 bucket RLS 與資料表 RLS 分離）
    if (attachFiles.length > 0) {
      setUploading(true)
      await uploadReceipts(editingId || newId)
      setUploading(false)
    }

    // 編輯重送：UPDATE 完之後叫 RPC 重啟駁回那關 + 推 LINE
    if (editingId && resubmitId && String(editingId) === String(resubmitId)) {
      try {
        await supabase.rpc('liff_resubmit_request', {
          p_line_user_id: lineProfile.lineUserId,
          p_type: 'expense',
          p_id: editingId,
          p_changes: null,
        })
      } catch (e) { console.error('[liff_resubmit] failed:', e) }
      alert('已重新送審，主管會收到通知')
      navigate('/approval-status')
      return
    }

    // ★ 2026-05-08：client-side notifyNewSubmission 已拔除，由主系統 DB trigger 推送

    reload()
    resetForm()
    setSubmitting(false)
  }

  const totalPending = records.filter(r => r.status === '待審核').reduce((s, r) => s + Number(r.amount || 0), 0)
  const getTripLabel = (id) => { const t = trips.find(t => t.id === id); return t ? `${t.destination} (${t.start_date})` : '' }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🧾 經常性費用申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(251,191,36,0.2)' }}>
          {/* Trip linking */}
          {trips.length > 0 && (
            <div className="form-group">
              <label className="form-label">關聯出差（選填）</label>
              <select className="form-input" value={form.business_trip_id} onChange={e => set('business_trip_id', e.target.value)}>
                <option value="">— 不關聯 —</option>
                {trips.map(t => <option key={t.id} value={t.id}>{t.destination}（{t.start_date} ~ {t.end_date}）</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">會計科目</label>
              <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
                <option value="">— 請選擇會計科目 —</option>
                {(accounts.length > 0
                  ? accounts.map(a => <option key={a.id ?? a.code} value={a.name}>{a.code} {a.name}</option>)
                  : CATEGORIES.map(c => <option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">金額 (NT$)</label>
              <input className="form-input" type="number" placeholder="0" value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">日期</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">說明</label>
            <textarea className="form-input" rows={2} placeholder="費用說明..." value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {/* Receipt upload */}
          <div className="form-group">
            <label className="form-label">收據照片</label>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px', borderRadius: 10, border: '2px dashed var(--border2)',
              color: 'var(--cyan)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <Paperclip size={14} /> 拍照 / 選擇圖片
              <input type="file" accept="image/*,.pdf" multiple hidden onChange={handleFileSelect} />
            </label>
            {existingAttach.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {existingAttach.map((url, i) => (
                  <div key={'ex-' + i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--green)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none' }} />
                    <button onClick={() => setExistingAttach(prev => prev.filter((_, j) => j !== i))} style={{
                      position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            {attachFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {attachFiles.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                    <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => removeFile(i)} style={{
                      position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting || uploading}>
              {uploading ? '上傳中...' : submitting ? '送出中...' : editingId ? '更新報帳' : '送出報帳'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>取消</button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '待審核').length}</div>
          <div className="stat-label">待審核</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)', fontSize: 18 }}>NT$ {totalPending.toLocaleString()}</div>
          <div className="stat-label">待核銷金額</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無報銷紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--cyan)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-cyan">{r.category}</span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>NT$ {Number(r.amount).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${r.status === '已核銷' ? 'badge-green' : r.status === '已駁回' ? 'badge-red' : 'badge-orange'}`}>{r.status}</span>
              {r.status === '待審核' && (
                <>
                  <button onClick={() => handleEdit(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Pencil size={11} /> 編輯</button>
                  <button onClick={() => handleDelete(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Trash2 size={11} /> 撤回</button>
                </>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {r.date}{r.description ? ` · ${r.description}` : ''}
          </div>
          {r.business_trip_id && (
            <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 4 }}>✈️ {getTripLabel(r.business_trip_id)}</div>
          )}
          {r.attachments?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {r.attachments.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                  borderRadius: 6, background: 'var(--cyan-dim)', fontSize: 10, fontWeight: 600,
                  color: 'var(--cyan)', textDecoration: 'none',
                }}><Image size={10} /> 收據 {i + 1}</a>
              ))}
            </div>
          )}
          {r.reject_reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 6,
              padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}>駁回原因：{r.reject_reason}</div>
          )}
        </div>
      ))}
    </div>
  )
}
