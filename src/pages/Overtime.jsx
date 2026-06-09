import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — 簽核 LINE 統一走主系統 DB trigger

// 算加班時數：依起訖時間 + 商店最小單位（step）
// 跨日：end <= start 自動 +24h（例 22:00 -> 02:00 = 4 小時）
function computeOvertimeHours(start, end, step = 0.5) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  const hours = mins / 60
  return Math.round(hours / step) * step
}

export default function Overtime() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [step, setStep] = useState(0.5)  // 廠商設定的最小單位
  const [form, setForm] = useState({ date: '', start_time: '', end_time: '', hours: 0, reason: '', store: '', ot_type: 'pay' })
  const [stores, setStores] = useState([])
  const [submitting, setSubmitting] = useState(false)

  // 載入該員工 org 的 stores
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_stores', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { if (Array.isArray(data)) setStores(data) })
  }, [lineProfile])

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_overtime_requests', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => { setRecords(Array.isArray(data) ? data : []); setLoading(false) })
  }

  // 載入加班 step 設定
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_my_unit_steps', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        if (data?.ok && data.overtime_step_hours) {
          const s = Number(data.overtime_step_hours)
          setStep(s)
          // 表單初始 hours 對齊 step
          setForm(f => ({ ...f, hours: s }))
        }
      })
  }, [lineProfile])

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
    setForm({ date: '', start_time: '', end_time: '', hours: 0, reason: '', store: '', ot_type: 'pay' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (r) => {
    setForm({
      date: r.date,
      start_time: r.start_time || '',
      end_time: r.end_time || '',
      hours: r.hours || 0,
      reason: r.reason || '',
      store: r.store || '',
      ot_type: r.ot_type || 'pay',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm('確定要撤回這筆加班申請嗎？')) return
    const { error } = await supabase.rpc('liff_delete_overtime_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.date) { alert('請選擇日期'); return }
    if (!form.start_time || !form.end_time) { alert('請選擇加班起訖時間'); return }
    if (!form.hours || form.hours <= 0) { alert('加班時數計算為 0，請檢查起訖時間'); return }
    if (!form.store) { alert('請選擇加班門市'); return }

    // Check duplicate date
    const dup = records.find(r => r.id !== editingId && r.date === form.date && r.status !== '已拒絕')
    if (dup) { alert(`${form.date} 已有加班申請`); return }

    setSubmitting(true)

    const payload = {
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      hours: parseFloat(form.hours),
      reason: form.reason,
      store: form.store,
      ot_type: form.ot_type || 'pay',
    }

    let error
    if (editingId) {
      ;({ error } = await supabase.rpc('liff_update_overtime_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_id: editingId,
        p_payload: payload,
      }))
    } else {
      ;({ error } = await supabase.rpc('liff_insert_overtime_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_payload: { ...payload, status: '待審核' },
      }))
    }

    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // 編輯重送：UPDATE 完之後叫 RPC 重啟駁回那關 + 推 LINE
    if (editingId && resubmitId && String(editingId) === String(resubmitId)) {
      try {
        await supabase.rpc('liff_resubmit_request', {
          p_line_user_id: lineProfile.lineUserId,
          p_type: 'overtime',
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

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : 'badge-red'

  // Stats
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthRecords = records.filter(r => r.date?.startsWith(thisMonth))
  const approvedHours = monthRecords.filter(r => r.status === '已核准').reduce((s, r) => s + (r.hours || 0), 0)
  const pendingCount = records.filter(r => r.status === '待審核').length

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🕐 加班申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) resetForm(); else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">加班日期</label>
            <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">加班門市</label>
            <select className="form-input" value={form.store} onChange={e => set('store', e.target.value)}>
              <option value="">— 選擇加班門市 —</option>
              {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              💡 跨門市加班請選實際支援門市
            </div>
          </div>
          <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">加班起時</label>
              <input className="form-input" type="time"
                value={form.start_time}
                onChange={e => {
                  const v = e.target.value
                  setForm(f => ({ ...f, start_time: v, hours: computeOvertimeHours(v, f.end_time, step) }))
                }} />
            </div>
            <div>
              <label className="form-label">加班訖時</label>
              <input className="form-input" type="time"
                value={form.end_time}
                onChange={e => {
                  const v = e.target.value
                  setForm(f => ({ ...f, end_time: v, hours: computeOvertimeHours(f.start_time, v, step) }))
                }} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">總時數</label>
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: form.hours > 0 ? 'rgba(34,211,238,0.12)' : 'var(--card)',
              color: form.hours > 0 ? 'var(--cyan)' : 'var(--t3)',
              fontWeight: 700, fontSize: 18,
              border: '1px solid var(--border2)',
            }}>
              {form.hours > 0 ? `${form.hours} 小時` : '請選擇起訖時間'}
              {form.start_time && form.end_time && form.end_time <= form.start_time && (
                <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 8, color: 'var(--orange)' }}>（跨日）</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              本店加班最小單位 {step} 小時 · 訖時 ≤ 起時自動視為跨日
            </div>
            {form.hours > 4 && (
              <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>
                提醒：單日加班超過 4 小時，依勞基法加班費率較高
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">加班原因</label>
            <textarea className="form-input" placeholder="請說明加班原因..." value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">結算方式</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 'pay',       label: '💰 加班費', hint: '當月薪資領取' },
                { v: 'comp_time', label: '🕐 補休',   hint: '1 年內有效' },
              ].map(opt => {
                const selected = (form.ot_type || 'pay') === opt.v
                return (
                  <label key={opt.v} style={{
                    flex: 1, cursor: 'pointer',
                    padding: '10px 12px', borderRadius: 10,
                    background: selected ? 'var(--cyan-dim)' : 'var(--card)',
                    border: `1.5px solid ${selected ? 'var(--cyan)' : 'var(--border2)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="radio" name="ot_type" value={opt.v} checked={selected}
                        onChange={() => set('ot_type', opt.v)} style={{ accentColor: 'var(--cyan)' }} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: selected ? 'var(--cyan)' : 'var(--t2)' }}>{opt.label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3, marginLeft: 22 }}>{opt.hint}</div>
                  </label>
                )
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
              💡 補休送出後不能改成加班費；未用過期會自動兌換加班費
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>
                取消
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{pendingCount}</div>
          <div className="stat-label">待審核</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--cyan)' }}>{approvedHours}</div>
          <div className="stat-label">本月核准時數</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無加班紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--cyan)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{r.date}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
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
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.hours} 小時
            {r.ot_type === 'comp_time' && (
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
              }}>🕐 補休</span>
            )}
          </div>
          {r.reason && (
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{r.reason}</div>
          )}
          {r.reject_reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 6,
              padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}>
              拒絕原因：{r.reject_reason}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
