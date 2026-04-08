import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, FileText, ChevronDown, ChevronUp, Paperclip, Image, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPES = ['特休', '事假', '病假', '公假', '婚假', '喪假', '產假', '陪產假', '育嬰假', '生理假', '心理假', '產檢假', '家庭照顧假', '公傷病假']

// 特休天數依年資計算（勞基法 §38）
function calcAnnualLeave(joinDate) {
  if (!joinDate) return 0
  const years = (new Date() - new Date(joinDate)) / (365.25 * 86400000)
  if (years < 0.5) return 0
  if (years < 1) return 3
  if (years < 2) return 7
  if (years < 3) return 10
  if (years < 5) return 14
  if (years < 10) return 15
  return Math.min(30, 15 + (Math.floor(years) - 10))
}

// 各假別年度上限 + 說明（曆年制：1/1 ~ 12/31）
const LEAVE_INFO = {
  '特休': { max: null, paid: '有薪', law: '勞基法 §38', note: '依年資計算，未休完應折算工資' },
  '事假': { max: 14, paid: '無薪', law: '勞工請假規則 §7', note: '因事必須親自處理' },
  '病假': { max: 30, paid: '半薪', law: '勞工請假規則 §4', note: '未住院30天/年，2026新制10天內不得不利處分' },
  '心理假': { max: 3, paid: '有薪', law: '2025新制', note: '不需診斷證明，不列入考績' },
  '家庭照顧假': { max: 7, paid: '無薪', law: '性平法 §20', note: '2026起可以小時為單位，不扣全勤' },
  '生理假': { max: 12, paid: '半薪', law: '性平法 §14', note: '每月1天，女性員工適用' },
  '婚假': { max: 8, paid: '有薪', law: '勞工請假規則 §2', note: '登記日前10日起3個月內請畢' },
  '喪假': { max: 8, paid: '有薪', law: '勞工請假規則 §3', note: '父母/配偶8天、祖父母/子女6天、兄弟姊妹3天' },
  '陪產假': { max: 7, paid: '有薪', law: '性平法 §15', note: '配偶分娩前後15日內請畢' },
  '產檢假': { max: 7, paid: '有薪', law: '性平法 §15', note: '可以小時為單位，女性適用' },
  '公假': { max: null, paid: '有薪', law: '勞工請假規則 §3', note: '選舉、教召、作證等' },
  '產假': { max: 56, paid: '有薪', law: '勞基法 §50', note: '分娩8週，女性適用' },
  '育嬰假': { max: 730, paid: '津貼80%', law: '性平法 §16', note: '子女滿3歲前，2026可按日申請' },
  '公傷病假': { max: null, paid: '有薪', law: '勞基法 §43', note: '職業災害，工資照給' },
}
const LEAVE_LIMITS = Object.fromEntries(
  Object.entries(LEAVE_INFO).filter(([, v]) => v.max).map(([k, v]) => [k, v.max])
)

// 取得特休年度區間（到職週年制）
function getAnnualLeaveRange(joinDate) {
  const join = new Date(joinDate)
  const now = new Date()
  const thisAnniv = new Date(now.getFullYear(), join.getMonth(), join.getDate())
  if (thisAnniv > now) {
    // 今年週年還沒到，用去年週年 ~ 今年週年
    const lastAnniv = new Date(now.getFullYear() - 1, join.getMonth(), join.getDate())
    return { start: lastAnniv, end: thisAnniv }
  }
  // 今年週年已過，用今年週年 ~ 明年週年
  const nextAnniv = new Date(now.getFullYear() + 1, join.getMonth(), join.getDate())
  return { start: thisAnniv, end: nextAnniv }
}

// 取得曆年區間
function getCalendarYearRange() {
  const year = new Date().getFullYear()
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) }
}

// 計算工作天數（排除週六日 + 國定假日）
function countWorkDays(startStr, endStr, holidayList) {
  if (!startStr) return 0
  const start = new Date(startStr)
  const end = new Date(endStr || startStr)
  const holidaySet = new Set(holidayList)
  let count = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay() // 0=Sun, 6=Sat
    const dateStr = d.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !holidaySet.has(dateStr)) {
      count++
    }
  }
  return Math.max(1, count)
}

export default function Leave() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [holidays, setHolidays] = useState([]) // ['2026-04-04', ...]
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // null = new, id = editing
  const [form, setForm] = useState({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [showAllBalances, setShowAllBalances] = useState(false)
  const [attachFiles, setAttachFiles] = useState([]) // { file, preview }
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('leave_requests').select('*').eq('employee', employee.name).order('start_date', { ascending: false }),
      supabase.from('holidays').select('date'),
    ]).then(([lr, hd]) => {
      setRecords(lr.data || [])
      setHolidays((hd.data || []).map(h => h.date))
      setLoading(false)
    })
  }, [employee])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
    setEditingId(null)
    setShowForm(false)
    setAttachFiles([])
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    const newFiles = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setAttachFiles(prev => [...prev, ...newFiles].slice(0, 5)) // max 5
    e.target.value = ''
  }

  const removeFile = (idx) => {
    setAttachFiles(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const uploadAttachments = async (leaveId) => {
    if (attachFiles.length === 0) return []
    const urls = []
    for (const { file } of attachFiles) {
      const ext = file.name.split('.').pop()
      const path = `${employee.name}/${leaveId}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('leave-attachments').upload(path, file)
      if (!error) {
        const { data } = supabase.storage.from('leave-attachments').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    return urls
  }

  const handleEdit = (r) => {
    setForm({
      type: r.type,
      start_date: r.start_date,
      end_date: r.end_date || r.start_date,
      start_time: r.start_time || '09:00',
      end_time: r.end_time || '18:00',
      unit: r.start_time ? 'hour' : 'day',
      reason: r.reason || '',
    })
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm(`確定要撤回這筆${r.type}申請嗎？`)) return
    const { error } = await supabase.from('leave_requests').delete().eq('id', r.id)
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.start_date) return
    setSubmitting(true)

    let days, hours
    if (form.unit === 'hour') {
      const [sh, sm] = form.start_time.split(':').map(Number)
      const [eh, em] = form.end_time.split(':').map(Number)
      hours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
      days = Math.round(hours / 8 * 10) / 10
    } else {
      days = countWorkDays(form.start_date, form.end_date || form.start_date, holidays)
      hours = days * 8
    }

    const payload = {
      employee: employee.name,
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      days,
      hours,
      start_time: form.unit === 'hour' ? form.start_time : null,
      end_time: form.unit === 'hour' ? form.end_time : null,
      reason: form.reason,
      status: '待審核',
    }

    let result, error
    if (editingId) {
      ;({ data: result, error } = await supabase.from('leave_requests').update(payload).eq('id', editingId).select().single())
    } else {
      ;({ data: result, error } = await supabase.from('leave_requests').insert(payload).select().single())
    }

    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }
    if (result) {
      // Upload attachments if any
      if (attachFiles.length > 0) {
        setUploading(true)
        const urls = await uploadAttachments(result.id)
        if (urls.length > 0) {
          const existing = result.attachments || []
          const { data: updated } = await supabase.from('leave_requests')
            .update({ attachments: [...existing, ...urls] }).eq('id', result.id).select().single()
          if (updated) result = updated
        }
        setUploading(false)
      }
      if (editingId) {
        setRecords(prev => prev.map(r => r.id === result.id ? result : r))
      } else {
        setRecords(prev => [result, ...prev])
      }
      resetForm()
    }
    setSubmitting(false)
  }

  const statusBadge = (s) => s === '已核准' ? 'badge-green' : s === '待審核' ? 'badge-orange' : 'badge-red'

  const generateCertificate = (r) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })

    // Use built-in Helvetica (no CJK font loading needed — we'll use Unicode text rendering)
    // For CJK we embed a minimal approach: draw with canvas-like text
    doc.setFont('Helvetica')

    // Border
    doc.setDrawColor(34, 211, 238)
    doc.setLineWidth(1)
    doc.rect(15, 15, 180, 267)
    doc.setLineWidth(0.3)
    doc.rect(18, 18, 174, 261)

    // Header
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text('SME OPS System', 105, 30, { align: 'center' })

    doc.setFontSize(22)
    doc.setTextColor(30)
    doc.text('Leave Certificate', 105, 45, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(34, 211, 238)
    doc.text('--- OFFICIAL DOCUMENT ---', 105, 53, { align: 'center' })

    // Info table
    const info = [
      ['Employee', r.employee || employee?.name || '-'],
      ['Department', employee?.dept || '-'],
      ['Position', employee?.position || '-'],
      ['Leave Type', r.type],
      ['Period', `${r.start_date}${r.end_date !== r.start_date ? ' ~ ' + r.end_date : ''}${r.start_time ? ' ' + r.start_time + ' - ' + r.end_time : ''}`],
      ['Duration', r.hours && r.hours < 8 ? `${r.hours} hours` : `${r.days} day(s)`],
      ['Reason', r.reason || '-'],
      ['Status', r.status],
      ['Approver', r.approver || '-'],
      ['Applied', r.created_at ? new Date(r.created_at).toLocaleDateString('zh-TW') : '-'],
    ]

    let y = 70
    doc.setFontSize(11)
    info.forEach(([label, value]) => {
      doc.setTextColor(100)
      doc.setFont('Helvetica', 'bold')
      doc.text(label + ':', 30, y)
      doc.setFont('Helvetica', 'normal')
      doc.setTextColor(30)
      doc.text(String(value), 80, y)
      y += 10
    })

    // Leave policy reference
    const leaveInfo = LEAVE_INFO[r.type]
    if (leaveInfo) {
      y += 10
      doc.setDrawColor(200)
      doc.line(30, y, 180, y)
      y += 8
      doc.setFontSize(10)
      doc.setTextColor(100)
      doc.setFont('Helvetica', 'bold')
      doc.text('Legal Basis:', 30, y)
      doc.setFont('Helvetica', 'normal')
      doc.text(leaveInfo.law, 80, y)
      y += 8
      doc.setFont('Helvetica', 'bold')
      doc.text('Pay Status:', 30, y)
      doc.setFont('Helvetica', 'normal')
      doc.text(leaveInfo.paid, 80, y)
    }

    // Signature area
    y = 230
    doc.setDrawColor(180)
    doc.line(30, y, 85, y)
    doc.line(115, y, 175, y)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('Employee Signature', 57, y + 6, { align: 'center' })
    doc.text('Supervisor Signature', 145, y + 6, { align: 'center' })

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(160)
    doc.text(`Generated: ${new Date().toLocaleString('zh-TW')}`, 105, 270, { align: 'center' })
    doc.text('This document is system-generated by SME OPS.', 105, 275, { align: 'center' })

    doc.save(`leave-certificate-${r.employee || 'unknown'}-${r.start_date}.pdf`)
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 請假申請</div>
        <button className="btn btn-primary btn-sm" onClick={() => { if (showForm) { resetForm() } else { setEditingId(null); setShowForm(true) } }}>
          <Plus size={14} /> {showForm ? '取消' : '新增'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ borderColor: 'rgba(34,211,238,0.2)' }}>
          <div className="form-group">
            <label className="form-label">假別</label>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {/* Day / Hour toggle */}
          <div className="form-group">
            <label className="form-label">請假單位</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ value: 'day', label: '整天' }, { value: 'hour', label: '時數' }].map(u => (
                <button key={u.value} onClick={() => set('unit', u.value)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${form.unit === u.value ? 'var(--cyan)' : 'var(--border2)'}`,
                  background: form.unit === u.value ? 'var(--cyan-dim)' : 'var(--card)',
                  color: form.unit === u.value ? 'var(--cyan)' : 'var(--t2)',
                  cursor: 'pointer',
                }}>{u.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: form.unit === 'hour' ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">{form.unit === 'hour' ? '日期' : '開始日期'}</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            {form.unit === 'day' && (
              <div className="form-group">
                <label className="form-label">結束日期</label>
                <input className="form-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            )}
          </div>
          {form.unit === 'hour' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">開始時間</label>
                <input className="form-input" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">結束時間</label>
                <input className="form-input" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
              </div>
            </div>
          )}
          {/* Days preview */}
          {form.unit === 'day' && form.start_date && (() => {
            const wd = countWorkDays(form.start_date, form.end_date || form.start_date, holidays)
            const start = new Date(form.start_date)
            const end = new Date(form.end_date || form.start_date)
            const calDays = Math.max(1, Math.ceil((end - start) / 86400000) + 1)
            const skipped = calDays - wd
            return (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.15)',
                fontSize: 13, color: 'var(--t2)',
              }}>
                實際請假 <b style={{ color: 'var(--cyan)' }}>{wd} 個工作天</b>
                {skipped > 0 && <span style={{ color: 'var(--t3)', fontSize: 12 }}>（已扣除 {skipped} 天假日/週末）</span>}
              </div>
            )
          })()}
          <div className="form-group">
            <label className="form-label">請假事由</label>
            <textarea className="form-input" placeholder="請輸入請假原因..." value={form.reason} onChange={e => set('reason', e.target.value)} />
          </div>
          {/* Attachments */}
          <div className="form-group">
            <label className="form-label">附件證明（選填）</label>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>
              喪假需附死亡證明、婚假需附結婚證書等，最多 5 張
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '12px', borderRadius: 10, border: '2px dashed var(--border2)',
              color: 'var(--cyan)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              <Paperclip size={14} /> 選擇圖片/檔案
              <input type="file" accept="image/*,.pdf" multiple hidden onChange={handleFileSelect} />
            </label>
            {attachFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {attachFiles.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                    {f.file.type.startsWith('image/') ? (
                      <img src={f.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', fontSize: 10, color: 'var(--t3)' }}>
                        {f.file.name.split('.').pop().toUpperCase()}
                      </div>
                    )}
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
            <button className="btn btn-success" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting || uploading}>
              {uploading ? '上傳中...' : submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ padding: '10px 16px', background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>
                取消
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leave Balance */}
      {employee?.join_date && (() => {
        const annualTotal = calcAnnualLeave(employee.join_date)
        const approved = records.filter(r => r.status !== '已拒絕')

        // 特休：到職週年制
        const annualRange = getAnnualLeaveRange(employee.join_date)
        const annualUsed = approved
          .filter(r => r.type === '特休' && new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)

        // 其他假別：曆年制
        const calRange = getCalendarYearRange()
        const usedByType = (type) => approved
          .filter(r => r.type === type && new Date(r.start_date) >= calRange.start && new Date(r.start_date) < calRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)
        const allBalances = [
          { label: '特休', total: annualTotal, used: annualUsed },
          ...Object.entries(LEAVE_LIMITS).map(([type, total]) => ({
            label: type, total, used: usedByType(type),
          })),
        ]
        const mainBalances = allBalances.filter(b => ['特休', '事假', '病假', '心理假'].includes(b.label))
        const otherBalances = allBalances.filter(b => !['特休', '事假', '病假', '心理假'].includes(b.label))
        const displayed = showAllBalances ? allBalances : mainBalances

        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>假期餘額</div>
            {displayed.map(b => {
              const info = LEAVE_INFO[b.label]
              const remaining = b.total - b.used
              return (
                <div key={b.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: 'var(--t2)', fontWeight: 600 }}>
                      {b.label}
                      {info && <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                        {info.paid} · {info.law}
                      </span>}
                    </span>
                    <span style={{ color: remaining <= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      剩 {remaining} / {b.total} 天
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${Math.min(100, (b.used / b.total) * 100)}%`,
                      background: remaining <= 0 ? 'var(--red)' : b.label === '特休' ? 'var(--cyan)' : 'var(--green)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  {info?.note && showAllBalances && (
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{info.note}</div>
                  )}
                </div>
              )
            })}
            {otherBalances.length > 0 && (
              <button onClick={() => setShowAllBalances(!showAllBalances)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                width: '100%', padding: '6px', borderRadius: 8, border: '1px solid var(--border2)',
                background: 'transparent', color: 'var(--cyan)', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', marginTop: 4,
              }}>
                {showAllBalances ? <><ChevronUp size={12} /> 收合</> : <><ChevronDown size={12} /> 顯示全部 {allBalances.length} 種假別</>}
              </button>
            )}
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 10 }}>
              年資 {Math.round((new Date() - new Date(employee.join_date)) / (365.25 * 86400000) * 10) / 10} 年
              {annualTotal === 0 && '（未滿 6 個月，尚無特休）'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
              特休週期：{annualRange.start.toLocaleDateString('zh-TW')} ~ {new Date(annualRange.end.getTime() - 86400000).toLocaleDateString('zh-TW')}
              ｜其他假別：{calRange.start.getFullYear()} 年度
            </div>
          </div>
        )
      })()}

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
        <div className="empty">尚無請假紀錄</div>
      ) : records.map(r => (
        <div key={r.id} className="list-item" style={{ borderLeft: editingId === r.id ? '3px solid var(--cyan)' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="badge badge-cyan">{r.type}</span>
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
              {r.status === '已核准' && (
                <button onClick={() => generateCertificate(r)} style={{
                  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border2)',
                  background: 'var(--card)', color: 'var(--green)', cursor: 'pointer', fontSize: 11,
                  display: 'flex', alignItems: 'center', gap: 3,
                }}><FileText size={11} /> 證明</button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {r.start_date}{r.start_time ? ` ${r.start_time}` : ''}{r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ''}{r.end_time ? ` ${r.end_time}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {r.hours && r.hours < 8 ? `${r.hours} 小時` : `${r.days} 天`}{r.reason ? ` · ${r.reason}` : ''}
          </div>
          {r.attachments?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {r.attachments.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{
                  display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                  borderRadius: 6, background: 'var(--cyan-dim)', fontSize: 10,
                  color: 'var(--cyan)', textDecoration: 'none', fontWeight: 600,
                }}>
                  <Image size={10} /> 附件 {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
