import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — 簽核 LINE 統一走主系統 DB trigger

// 補打卡只修「正常班」的打卡；加班走加班單（有起訖時間=打卡）、請假走請假單、換班走換班流程。
// 故補打卡模式只留 一般 / 外出（attendance 也只支援這兩種 mode）。
const MODE_META = {
  normal:     { label: '一般', icon: '🕒', color: 'var(--cyan)',   dim: 'var(--cyan-dim)' },
  outing:     { label: '外出', icon: '✈️', color: 'var(--green)',  dim: 'var(--green-dim)' },
}

// type 統一存英文（對齊主系統補登 trigger _apply_correction_to_attendance）；顯示用中文 label
const TYPE_LABEL = { clock_in: '上班打卡', clock_out: '下班打卡' }
const normType = (t) => (t === '上班打卡' ? 'clock_in' : t === '下班打卡' ? 'clock_out' : (t || 'clock_in'))

export default function ClockCorrection() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  // clock_corrections 實際欄位：type (clock_in/clock_out，英文) + correction_time + clock_mode
  const [form, setForm] = useState({ date: '', type: 'clock_in', correction_time: '', reason: '', store: '', clock_mode: 'normal' })
  const [stores, setStores] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [attachFiles, setAttachFiles] = useState([]) // 選填照片：{ file, preview }

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_clock_corrections', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { reload() }, [lineProfile])

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_stores', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setStores(data) })
  }, [lineProfile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    const added = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setAttachFiles(prev => [...prev, ...added].slice(0, 5))
    e.target.value = ''
  }
  const removeAttach = (idx) => {
    setAttachFiles(prev => {
      try { URL.revokeObjectURL(prev[idx].preview) } catch {}
      return prev.filter((_, i) => i !== idx)
    })
  }
  // 上傳到 attachments bucket → 走 DEFINER RPC 寫 form_attachments(form_type='correction'),HR 審核時看得到
  const uploadAttachments = async (correctionId) => {
    for (const { file } of attachFiles) {
      const safeName = (file.name || 'photo.jpg').replace(/[\/\\?#%]+/g, '_').replace(/\s+/g, '_')
      const path = `correction/${correctionId}-${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { cacheControl: '3600', upsert: true })
      if (upErr) { console.warn('附件上傳失敗:', upErr); continue }
      const { error: rpcErr } = await supabase.rpc('liff_add_clock_correction_attachment', {
        p_line_user_id: lineProfile.lineUserId, p_id: correctionId, p_storage_path: path,
        p_file_name: safeName, p_file_size: file.size || null, p_mime_type: file.type || null,
      })
      if (rpcErr) console.warn('附件關聯失敗:', rpcErr)
    }
  }

  const resetForm = () => {
    setForm({ date: '', type: 'clock_in', correction_time: '', reason: '', store: '', clock_mode: 'normal' })
    attachFiles.forEach(a => { try { URL.revokeObjectURL(a.preview) } catch {} })
    setAttachFiles([])
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      date: r.date,
      type: normType(r.type),
      correction_time: r.correction_time || '',
      reason: r.reason || '',
      store: r.store || '',
      clock_mode: r.clock_mode || 'normal',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('撤回這張補打卡申請？撤回後可重新申請。')) return
    const { error } = await supabase.rpc('liff_delete_clock_correction', {
      p_line_user_id: lineProfile.lineUserId, p_id: r.id,
    })
    if (error) {
      const m = error.message || ''
      if (/找不到|待審核/.test(m))       alert('無法撤回：這張申請可能已經審核完成或狀態已改變，請下拉重新整理後再看看。')
      else if (/employee not found/.test(m)) alert('無法撤回：身份辨識失敗，請關掉重新從 LINE 進入。')
      else if (/function|does not exist|404/.test(m)) alert('撤回功能尚未上線（系統更新中），請稍後再試或聯繫管理員。')
      else alert('撤回失敗：' + m)
      return
    }
    reload()
  }

  const handleSubmit = async () => {
    if (!form.date || !form.reason) { alert('請填寫日期和原因'); return }
    if (!form.correction_time) { alert('請填寫補正的時間'); return }
    if (!form.store) { alert('請選擇補打卡門市'); return }
    setSubmitting(true)

    const { data, error } = editingId
      ? await supabase.rpc('liff_update_clock_correction', {
          p_line_user_id: lineProfile.lineUserId,
          p_id: editingId,
          p_payload: { type: form.type, correction_time: form.correction_time, reason: form.reason },
        })
      : await supabase.rpc('liff_insert_clock_correction', {
          p_line_user_id: lineProfile.lineUserId,
          p_payload: {
            date: form.date,
            type: form.type,
            correction_time: form.correction_time,
            reason: form.reason,
            store: form.store,
            clock_mode: form.clock_mode,
          },
        })
    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // 選填照片:送出成功後上傳並關聯到這張單(新單取回傳 id、編輯用 editingId)
    const correctionId = editingId || data?.id
    if (correctionId && attachFiles.length > 0) {
      try { await uploadAttachments(correctionId) } catch (e) { console.warn('附件流程異常:', e) }
    }

    // ★ 2026-05-08：client-side notifyNewSubmission 已拔除，由主系統 DB trigger 推送

    reload()
    resetForm()
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : 'badge-red'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🔧 補打卡申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">補打卡日期</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">補打卡門市</label>
            <select className="form-input" value={form.store} onChange={e => set('store', e.target.value)}>
              <option value="">— 選擇實際門市 —</option>
              {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              💡 跨門市支援請選實際門市
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">類型</label>
              <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="clock_in">上班打卡</option>
                <option value="clock_out">下班打卡</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">補正時間</label>
              <input className="form-input" type="time" value={form.correction_time} onChange={e => set('correction_time', e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>
            一次補正一個時段；如要補上班+下班兩個，請分兩筆送出
          </div>

          {/* 4 模式選擇 — 與 Clock.jsx 對齊 */}
          <div className="form-group">
            <label className="form-label">補打卡模式</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 6 }}>
              {Object.entries(MODE_META).map(([key, m]) => {
                const active = form.clock_mode === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set('clock_mode', key)}
                    style={{
                      padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                      background: active ? m.dim : 'var(--card)',
                      border: `1px solid ${active ? m.color : 'var(--border2)'}`,
                      color: active ? m.color : 'var(--t3)',
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    {m.label}
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>
              💡 標明這筆補打卡屬於哪種模式，HR 核准後會反映到出勤紀錄
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">補打卡原因 *</label>
            <textarea className="form-input" placeholder="例：忘記打卡、手機沒電..." value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">照片（選填）</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              📷 上傳照片
              <input type="file" accept="image/*" multiple hidden onChange={handleFileSelect} />
            </label>
            {attachFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {attachFiles.map((a, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={a.preview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border2)' }} />
                    <button type="button" onClick={() => removeAttach(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red, #ef4444)', color: '#fff', border: 'none', fontSize: 13, lineHeight: '20px', cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>💡 可附現場照片/證明,HR 審核時看得到(最多 5 張)</div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
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
          <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准').length}</div>
          <div className="stat-label">已核准</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無補打卡紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{r.date}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
              {r.status === '待審核' && (
                <>
                  {(r.current_step ?? 0) === 0 && (
                  <button onClick={() => handleEdit(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Pencil size={11} /> 編輯</button>
                  )}
                  <button onClick={() => handleDelete(r)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                    background: 'var(--card)', color: 'var(--red)', cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}><Trash2 size={11} /> 撤回</button>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
            <span>{TYPE_LABEL[r.type] || r.type}：{r.correction_time}</span>
            {r.clock_mode && r.clock_mode !== 'normal' && MODE_META[r.clock_mode] && (
              <span style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: MODE_META[r.clock_mode].dim,
                color: MODE_META[r.clock_mode].color,
              }}>
                {MODE_META[r.clock_mode].icon} {MODE_META[r.clock_mode].label}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>原因：{r.reason}</div>
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
