import { useState, useEffect } from 'react'
import { ChevronLeft, Plus, Pencil, Trash2, FileText, ChevronDown, ChevronUp, Paperclip, Image, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
// notifyNewSubmission 已拔除 — 簽核 LINE 統一走主系統 DB trigger
// (sme-ops-system: 20260508130000_hr_a_chain_db_trigger.sql)

const TYPES = ['特休', '事假', '病假', '補休', '公假', '婚假', '喪假', '產假', '陪產假', '育嬰假', '生理假', '心理假', '產檢假', '家庭照顧假', '公傷病假']

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

// 兼職特休時數 = 天數 × 8 × (週工時 / 40)
function calcPTAnnualLeaveHours(joinDate, weeklyHours) {
  const days = calcAnnualLeave(joinDate)
  const ratio = Math.min(1, (Number(weeklyHours) || 0) / 40)
  return { hours: Math.round(days * 8 * ratio * 10) / 10, days, ratio }
}

// 各假別年度上限 + 說明（曆年制：1/1 ~ 12/31）
const LEAVE_INFO = {
  '特休': { max: null, paid: '有薪', law: '勞基法 §38', note: '依年資計算，未休完應折算工資' },
  '事假': { max: 14, paid: '無薪', law: '勞工請假規則 §7', note: '因事必須親自處理' },
  '病假': { max: 30, paid: '半薪', law: '勞工請假規則 §4', note: '未住院30天/年，2026新制10天內不得不利處分' },
  '補休': { max: null, paid: '由補休時數抵扣', law: '', note: '加班申請選補休累積；FIFO 扣最早到期那筆' },
  '心理假': { max: 3, paid: '有薪', law: '2025新制', note: '不需診斷證明，不列入考績' },
  '家庭照顧假': { max: 7, paid: '無薪', law: '性平法 §20', note: '2026起可以小時為單位，不扣全勤' },
  '生理假': { max: 12, paid: '半薪', law: '性平法 §14', note: '每月1天，女性員工適用' },
  '婚假': { max: 8, paid: '有薪', law: '勞工請假規則 §2', note: '登記日前10日起3個月內請畢' },
  '喪假': { max: 8, paid: '有薪', law: '勞工請假規則 §3', note: '父母/配偶8天、祖父母/子女6天、兄弟姊妹3天' },
  '陪產假': { max: 7, paid: '有薪', law: '性平法 §15', note: '配偶分娩前後15日內請畢', onDemand: true },
  '產檢假': { max: 7, paid: '有薪', law: '性平法 §15', note: '可以小時為單位，女性適用', onDemand: true },
  '公假': { max: null, paid: '有薪', law: '勞工請假規則 §3', note: '選舉、教召、作證等' },
  '產假': { max: 56, paid: '有薪', law: '勞基法 §50', note: '分娩8週，女性適用', onDemand: true },
  '育嬰假': { max: 730, paid: '津貼80%', law: '性平法 §16', note: '子女滿3歲前，2026可按日申請', onDemand: true },
  '公傷病假': { max: null, paid: '有薪', law: '勞基法 §43', note: '職業災害，工資照給' },
}
const LEAVE_LIMITS = Object.fromEntries(
  Object.entries(LEAVE_INFO).filter(([, v]) => v.max).map(([k, v]) => [k, v.max])
)

// benefit_policies code → LIFF 假別名稱對照
const LEAVE_CODE_MAP = {
  annual: '特休', sick: '病假', personal: '事假', official: '公假',
  maternity: '產假', paternity: '陪產假', parental: '育嬰假',
  menstrual: '生理假', marriage: '婚假', bereavement: '喪假',
  family_care: '家庭照顧假', mental_health: '心理假',
  occupational: '公傷病假', nursing: '哺乳時間', prenatal: '產檢假',
}

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
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [signedIds, setSignedIds] = useState(new Set())  // 已有人簽過的 leave id（編輯/撤回鎖用）
  const [holidays, setHolidays] = useState([]) // ['2026-04-04', ...]
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // null = new, id = editing
  const [searchParams] = useSearchParams()
  const resubmitId = searchParams.get('resubmit')
  const [form, setForm] = useState({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [showAllBalances, setShowAllBalances] = useState(false)
  const [attachFiles, setAttachFiles] = useState([]) // new files: { file, preview }
  const [existingAttach, setExistingAttach] = useState([]) // existing URLs from DB
  const [uploading, setUploading] = useState(false)
  const [benefitExtras, setBenefitExtras] = useState({}) // code → extra_days from benefit_policies
  const [dbBalances, setDbBalances] = useState([])      // leave_balances rows from DB
  const [leaveSteps, setLeaveSteps] = useState({}) // 中文假別名稱 → {step, unit}
  const [compBalance, setCompBalance] = useState(null) // { total_remaining, ledgers: [...] }

  // 取目前選的假別 step（如 type='特休'，看 leaveSteps 有沒有 'annual' override）
  const currentStep = (() => {
    // form.type 是中文（如 '特休'），需轉成 code
    const codeMap = { '特休': 'annual', '病假': 'sick', '事假': 'personal', '婚假': 'marriage',
      '喪假': 'bereavement', '產假': 'maternity', '陪產假': 'paternity', '生理假': 'menstrual',
      '家庭照顧假': 'family', '公假': 'official', '公傷假': 'injury' }
    const code = codeMap[form?.type] || ''
    const cfg = leaveSteps[code]
    if (!cfg) return { step: 0.5, unit: 'day' }  // fallback
    return { step: Number(cfg.step), unit: cfg.unit || 'day' }
  })()

  // 把計算出的天/時往上對齊到 step 倍數
  const snapToStep = (val, step) => {
    if (!val || !step) return val
    return Math.ceil(val / step - 1e-9) * step
  }

  const reload = () => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_leave_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_holidays'),
      supabase.rpc('liff_list_benefit_policies', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_get_my_leave_balances', { p_line_user_id: lineProfile.lineUserId }),
    ]).then(([lr, hd, bp, lbRes]) => {
      const leaveList = Array.isArray(lr.data) ? lr.data : []
      setRecords(leaveList)
      setHolidays((Array.isArray(hd.data) ? hd.data : []).map(h => h.date))
      // 抓「已有人 approved 過」的 leave id（駁回不算）— 走 SECURITY DEFINER RPC 繞 anon RLS
      const ids = leaveList.map(x => x.id).filter(Boolean)
      if (ids.length) {
        supabase.rpc('list_request_ids_with_approved_step', {
          p_request_type: 'leave',
          p_request_ids: ids,
        }).then(({ data }) => {
          setSignedIds(new Set((data || []).map(r => typeof r === 'number' ? r : r.list_request_ids_with_approved_step)))
        })
      }

      // Benefit policy 優先序：employee_id > store_id > global
      const storeId = employee?.store_id
      const empId = employee?.id
      const allPolicies = (Array.isArray(bp.data) ? bp.data : [])
        .filter(p => p.category === 'leave' && p.is_active)
      const extras = {}
      for (const p of allPolicies) {
        // Scope 相關：只取 global、本店、或本人
        const isGlobal = !p.store_id && !p.employee_id
        const isStore = p.store_id === storeId && !p.employee_id
        const isEmp = p.employee_id === empId
        if (!(isGlobal || isStore || isEmp)) continue
        const specificity = (p.employee_id ? 2 : 0) + (p.store_id ? 1 : 0)
        const leaveCode = LEAVE_CODE_MAP[p.code] || p.code
        if (!extras[leaveCode] || specificity > (extras[leaveCode]._s || 0)) {
          extras[leaveCode] = { extra_days: p.config?.extra_days || 0, _s: specificity }
        }
      }
      for (const k of Object.keys(extras)) delete extras[k]._s
      setBenefitExtras(extras)
      setDbBalances(Array.isArray(lbRes.data) ? lbRes.data : [])
      setLoading(false)
    })
  }

  useEffect(() => { reload() }, [lineProfile, employee])

  // 自動進入編輯模式（從 ApprovalStatus 的「編輯重送」按鈕跳過來）
  useEffect(() => {
    if (!resubmitId || editingId || records.length === 0) return
    const target = records.find(r => String(r.id) === String(resubmitId))
    if (target) handleEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmitId, records.length])

  // 載入「請假最小單位」設定（廠商在主系統設定的 step）
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_my_unit_steps', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        if (data?.ok && data.leave_steps && typeof data.leave_steps === 'object') {
          setLeaveSteps(data.leave_steps)
        }
      })
  }, [lineProfile])

  // 載入補休餘額（給「補休」假別 + 假期餘額卡顯示）
  const reloadCompBalance = () => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_my_comp_time_balance', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        if (data?.ok) setCompBalance({ total_remaining: Number(data.total_remaining || 0), ledgers: data.ledgers || [] })
      })
  }
  useEffect(() => { reloadCompBalance() }, [lineProfile])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const resetForm = () => {
    setForm({ type: TYPES[0], start_date: '', end_date: '', start_time: '09:00', end_time: '18:00', unit: 'day', reason: '' })
    setEditingId(null)
    setShowForm(false)
    setAttachFiles([])
    setExistingAttach([])
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
      const path = `emp-${employee.id}/${leaveId}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('leave-attachments').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      })
      if (error) {
        console.error('Upload failed:', error)
        alert(`附件上傳失敗: ${error.message}`)
      } else {
        const { data } = supabase.storage.from('leave-attachments').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
    }
    // ★ URL 寫回 leave_requests.attachments，不然審核人/申請人列表看不到。
    // anon 對 leave_requests 沒 grant，直接 update 會被 RLS 擋 → 走 SECURITY DEFINER RPC
    // (liff_set_leave_attachments 內驗證「這張單是本人的」才更新)。leaveId 必須是真 id。
    if (urls.length > 0 && leaveId) {
      const { error: updErr } = await supabase.rpc('liff_set_leave_attachments', {
        p_line_user_id: lineProfile.lineUserId,
        p_id: leaveId,
        p_urls: urls,
      })
      if (updErr) console.warn('attach urls update fail:', updErr)
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
    setExistingAttach(r.attachments || [])
    setAttachFiles([])
    setEditingId(r.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (r) => {
    if (!confirm(`確定要撤回這筆${r.type}申請嗎？`)) return
    const { error } = await supabase.rpc('liff_delete_leave_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: r.id,
    })
    if (error) { alert('撤回失敗: ' + error.message); return }
    setRecords(prev => prev.filter(x => x.id !== r.id))
  }

  const handleSubmit = async () => {
    if (!form.start_date) return

    // 特休年資檢查（勞基法 §38：須滿 6 個月）
    if (form.type === '特休') {
      const entitlement = calcAnnualLeave(employee?.join_date)
      if (entitlement === 0) {
        alert('未滿 6 個月年資，尚無特休資格，無法申請特休')
        return
      }
      // 兼職：用時數上限驗證
      if (employee?.salary_type === 'hourly') {
        const empWeeklyHours = Number(employee?.weekly_hours) || 0
        const { hours: ptEntitleHours } = calcPTAnnualLeaveHours(employee.join_date, empWeeklyHours)
        const annualRange = getAnnualLeaveRange(employee.join_date)
        const dailyHours = empWeeklyHours / 5 || 8
        const usedHoursThisYear = records
          .filter(r => r.status !== '已拒絕' && r.type === '特休' && r.id !== editingId &&
            new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => s + (r.hours != null ? r.hours : (r.days || 0) * dailyHours), 0)
        const requestHours = form.unit === 'hour'
          ? (() => {
              const [sh, sm] = form.start_time.split(':').map(Number)
              const [eh, em] = form.end_time.split(':').map(Number)
              return Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
            })()
          : countWorkDays(form.start_date, form.end_date || form.start_date, holidays) * dailyHours
        if (usedHoursThisYear + requestHours > ptEntitleHours) {
          alert(`特休時數不足：本期可用 ${ptEntitleHours} 小時，已用 ${usedHoursThisYear} 小時，本次申請 ${requestHours} 小時`)
          return
        }
      }
    }

    // 補休：先擋餘額不足（RPC 也會擋；前端先擋給 UX）
    if (form.type === '補休') {
      if (!compBalance || compBalance.total_remaining <= 0) {
        alert('沒有補休餘額，需先有加班申請選「補休」並核准')
        return
      }
      // 預估扣多少小時
      let needHours
      if (form.unit === 'hour') {
        const [sh, sm] = form.start_time.split(':').map(Number)
        const [eh, em] = form.end_time.split(':').map(Number)
        needHours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
      } else {
        const wd = countWorkDays(form.start_date, form.end_date || form.start_date, holidays)
        needHours = wd * 8
      }
      if (compBalance.total_remaining < needHours) {
        alert(`補休餘額不足：剩 ${compBalance.total_remaining} 小時，本次要請 ${needHours} 小時`)
        return
      }
    }

    // Check date overlap with existing leaves
    const startD = new Date(form.start_date)
    const endD = new Date(form.end_date || form.start_date)
    const overlap = records.find(r => {
      if (r.id === editingId) return false // skip self when editing
      if (r.status === '已拒絕') return false
      const rStart = new Date(r.start_date)
      const rEnd = new Date(r.end_date || r.start_date)
      return startD <= rEnd && endD >= rStart
    })
    if (overlap) {
      alert(`日期與已申請的「${overlap.type}」（${overlap.start_date}${overlap.end_date !== overlap.start_date ? ' ~ ' + overlap.end_date : ''}）重疊，請修改日期`)
      return
    }

    setSubmitting(true)

    let days, hours
    if (form.unit === 'hour') {
      const [sh, sm] = form.start_time.split(':').map(Number)
      const [eh, em] = form.end_time.split(':').map(Number)
      hours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
      // 對齊到該假別的最小單位（小時模式）
      if (currentStep.unit === 'hour') {
        hours = snapToStep(hours, currentStep.step)
      }
      days = Math.round(hours / 8 * 10) / 10
    } else {
      days = countWorkDays(form.start_date, form.end_date || form.start_date, holidays)
      // 對齊到該假別的最小單位（天模式）
      if (currentStep.unit === 'day') {
        days = snapToStep(days, currentStep.step)
      }
      hours = days * 8
    }

    const payload = {
      type: form.type,
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      days,
      hours,
      start_time: form.unit === 'hour' ? form.start_time : '',
      end_time: form.unit === 'hour' ? form.end_time : '',
      reason: form.reason,
    }

    let error
    let newId = editingId   // 編輯：用原 id；新增：接住 insert RPC 回傳的真 id（給附件寫回用）
    if (editingId) {
      ;({ error } = await supabase.rpc('liff_update_leave_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_id: editingId,
        p_payload: payload,
      }))
    } else {
      const { data: insData, error: insErr } = await supabase.rpc('liff_insert_leave_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_payload: { ...payload, status: '待審核' },
      })
      error = insErr
      newId = insData?.id ?? null
    }

    if (error) { alert('送出失敗: ' + error.message); setSubmitting(false); return }

    // 編輯重送：UPDATE 完之後叫 RPC 重啟駁回那關 + 推 LINE
    if (editingId && resubmitId && String(editingId) === String(resubmitId)) {
      try {
        await supabase.rpc('liff_resubmit_request', {
          p_line_user_id: lineProfile.lineUserId,
          p_type: 'leave',
          p_id: editingId,
          p_changes: null,
        })
      } catch (e) { console.error('[liff_resubmit] failed:', e) }
      alert('已重新送審，主管會收到通知')
      navigate('/approval-status')
      return
    }

    // 附件上傳流程走 Supabase Storage（bucket-level RLS，與資料表 RLS 分離）
    if (attachFiles.length > 0) {
      setUploading(true)
      try { await uploadAttachments(editingId || newId) } catch (e) { /* ignore */ }
      setUploading(false)
    }

    // ★ 2026-05-08：client-side notifyNewSubmission 已拔除，由主系統 DB trigger 推送

    reload()
    reloadCompBalance()  // 補休扣完要更新餘額顯示
    resetForm()
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
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
              本店此假別最小單位：<b style={{ color: 'var(--cyan)' }}>{currentStep.step} {currentStep.unit === 'day' ? '天' : '小時'}</b>
              <span style={{ marginLeft: 4 }}>· 不滿一個單位會自動進位</span>
            </div>
            {form.type === '補休' && compBalance && (
              <div style={{
                marginTop: 8, padding: '10px 12px', borderRadius: 10,
                background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)',
                fontSize: 12, color: 'var(--t2)', lineHeight: 1.5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>🕐 補休餘額</span>
                  <span style={{
                    fontWeight: 800, fontSize: 14,
                    color: compBalance.total_remaining > 0 ? '#a78bfa' : 'var(--red)',
                  }}>
                    {compBalance.total_remaining} 小時
                  </span>
                </div>
                {compBalance.ledgers.length > 0 ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--t3)' }}>
                    <div style={{ marginBottom: 4 }}>📋 明細（最早到期先扣）：</div>
                    {compBalance.ledgers.slice(0, 3).map(l => (
                      <div key={l.ledger_id}>
                        • {l.ot_date} 加班 → 剩 <b style={{ color: 'var(--t2)' }}>{Number(l.hours_remaining).toFixed(1)}h</b>，
                        {l.expires_at} 到期
                        {l.days_to_expire <= 30 && (
                          <span style={{ color: 'var(--orange)', marginLeft: 4 }}>（{l.days_to_expire}天）</span>
                        )}
                      </div>
                    ))}
                    {compBalance.ledgers.length > 3 && (
                      <div style={{ marginTop: 2, fontStyle: 'italic' }}>… 另有 {compBalance.ledgers.length - 3} 筆</div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                    沒有餘額。先去加班申請選「補休」累積。
                  </div>
                )}
              </div>
            )}
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
            // 套用最小單位進位（同 handleSubmit 的邏輯，讓員工事先看到實際扣多少）
            const snapped = currentStep.unit === 'day'
              ? snapToStep(wd, currentStep.step)
              : wd
            const snapDelta = snapped - wd
            return (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.15)',
                fontSize: 13, color: 'var(--t2)',
              }}>
                實際請假 <b style={{ color: 'var(--cyan)' }}>{wd} 個工作天</b>
                {skipped > 0 && <span style={{ color: 'var(--t3)', fontSize: 12 }}> （已扣除 {skipped} 天假日/週末）</span>}
                {snapDelta > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--orange)' }}>
                    ⚠️ 進位後實際扣 <b>{snapped} 天</b>（本店此假別最小 {currentStep.step} 天）
                  </div>
                )}
              </div>
            )
          })()}
          {/* Hour preview（小時模式對齊 step） */}
          {form.unit === 'hour' && form.start_time && form.end_time && (() => {
            const [sh, sm] = form.start_time.split(':').map(Number)
            const [eh, em] = form.end_time.split(':').map(Number)
            const naturalHours = Math.max(0.5, (eh + em / 60) - (sh + sm / 60))
            const snapped = currentStep.unit === 'hour'
              ? snapToStep(naturalHours, currentStep.step)
              : naturalHours
            const snapDelta = snapped - naturalHours
            return (
              <div style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                background: 'var(--cyan-dim)', border: '1px solid rgba(34,211,238,0.15)',
                fontSize: 13, color: 'var(--t2)',
              }}>
                實際請假 <b style={{ color: 'var(--cyan)' }}>{naturalHours.toFixed(1)} 小時</b>
                {snapDelta > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--orange)' }}>
                    ⚠️ 進位後實際扣 <b>{snapped} 小時</b>（本店此假別最小 {currentStep.step} 小時）
                  </div>
                )}
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
            {/* Existing attachments (when editing) */}
            {existingAttach.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {existingAttach.map((url, i) => (
                  <div key={'ex-' + i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--green)' }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                    <div style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', fontSize: 9, color: 'var(--t3)' }}>
                      已上傳
                    </div>
                    <button onClick={() => setExistingAttach(prev => prev.filter((_, j) => j !== i))} style={{
                      position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
            {/* New file previews */}
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
            <button className="btn btn-success" style={{ flex: 3 }} onClick={handleSubmit} disabled={submitting || uploading}>
              {uploading ? '上傳中...' : submitting ? '送出中...' : editingId ? '更新申請' : '送出申請'}
            </button>
            {editingId && (
              <button className="btn" style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--t3)' }} onClick={resetForm}>
                取消
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leave Balance */}
      {employee?.join_date && (() => {
        const isEmpPT = employee?.salary_type === 'hourly'
        const empWeeklyHours = Number(employee?.weekly_hours) || 0
        const annualLegal = calcAnnualLeave(employee.join_date)
        const annualExtra = benefitExtras['特休']?.extra_days || 0
        const approved = records.filter(r => r.status !== '已拒絕')

        // 特休：到職週年制
        const annualRange = getAnnualLeaveRange(employee.join_date)

        // 兼職改用時數；正職用天數
        const ptInfo = isEmpPT ? calcPTAnnualLeaveHours(employee.join_date, empWeeklyHours) : null
        const ptExtraHours = isEmpPT ? (annualExtra * 8 * Math.min(1, empWeeklyHours / 40)) : 0
        const annualTotal = isEmpPT
          ? Math.round((ptInfo.hours + ptExtraHours) * 10) / 10
          : annualLegal + annualExtra
        const dailyHours = isEmpPT ? (empWeeklyHours / 5 || 8) : 8
        const annualUsed = approved
          .filter(r => r.type === '特休' && new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => isEmpPT
            ? s + (r.hours != null ? r.hours : (r.days || 0) * dailyHours)
            : s + (r.days || 0), 0)

        // 其他假別：曆年制（法定 + 加給）
        const calRange = getCalendarYearRange()
        const usedByType = (type) => approved
          .filter(r => r.type === type && new Date(r.start_date) >= calRange.start && new Date(r.start_date) < calRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)
        // DB 餘額 map（與 leaveBalanceCalc 邏輯一致）
        const dbMap = {}
        for (const b of dbBalances) dbMap[b.leave_type] = { total: Number(b.total_days || 0), carry: Number(b.carry_over_days || 0) }

        const allBalances = [
          { label: '特休', total: annualTotal, used: annualUsed, extra: isEmpPT ? ptExtraHours : annualExtra },
          // onDemand 假別（產假/陪產/產檢/育嬰）不顯示在「假期餘額」— 不是每人每年固定有
          ...Object.entries(LEAVE_LIMITS)
            .filter(([type]) => !LEAVE_INFO[type]?.onDemand)
            .map(([type, legalMax]) => {
              const extra = benefitExtras[type]?.extra_days || 0
              const db = dbMap[type]
              const effectiveTotal = db && db.total > 0
                ? Math.max(db.total, legalMax + extra) + db.carry
                : legalMax + extra
              return { label: type, total: effectiveTotal, used: usedByType(type), extra }
            }),
        ]
        const mainBalances = allBalances.filter(b => ['特休', '事假', '病假', '心理假'].includes(b.label))
        const otherBalances = allBalances.filter(b => !['特休', '事假', '病假', '心理假'].includes(b.label))
        const displayed = showAllBalances ? allBalances : mainBalances

        return (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>假期餘額</div>
            {compBalance && compBalance.total_remaining > 0 && (
              <div style={{
                marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.20)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--t2)', fontWeight: 700 }}>
                    🕐 補休
                    <span style={{ color: 'var(--t3)', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                      加班累積 · FIFO 扣
                    </span>
                  </span>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>
                    剩 {compBalance.total_remaining} 小時
                  </span>
                </div>
                {compBalance.ledgers.some(l => l.days_to_expire <= 30) && (
                  <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>
                    ⚠️ 有 {compBalance.ledgers.filter(l => l.days_to_expire <= 30).length} 筆 30 天內到期，未用會自動兌換加班費
                  </div>
                )}
              </div>
            )}
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
                      {b.label === '特休' && isEmpPT && (
                        <span style={{ color: 'var(--cyan)', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                          兼職 週{empWeeklyHours}h
                        </span>
                      )}
                    </span>
                    <span style={{ color: remaining <= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                      {b.label === '特休' && isEmpPT
                        ? `剩 ${Math.round((remaining) * 10) / 10} / ${b.total} 小時`
                        : `剩 ${remaining} / ${b.total} 天`}
                      {b.extra > 0 && <span style={{ color: 'var(--cyan)', fontSize: 10, fontWeight: 500 }}> (+{b.extra})</span>}
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
      {(() => {
        const thisMonth = new Date().toISOString().slice(0, 7)
        const monthApprovedDays = records
          .filter(r => r.start_date?.startsWith(thisMonth) && r.status === '已核准')
          .reduce((s, r) => s + (Number(r.days) || 0), 0)
        return (
          <div className="stat-row">
            <div className="stat-box">
              <div className="stat-num" style={{ color: 'var(--cyan)' }}>{monthApprovedDays}</div>
              <div className="stat-label">本月天數</div>
            </div>
            <div className="stat-box">
              <div className="stat-num" style={{ color: 'var(--orange)' }}>{records.filter(r => r.status === '待審核').length}</div>
              <div className="stat-label">待審核</div>
            </div>
            <div className="stat-box">
              <div className="stat-num" style={{ color: 'var(--green)' }}>{records.filter(r => r.status === '已核准').length}</div>
              <div className="stat-label">已核准</div>
            </div>
          </div>
        )
      })()}

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
                signedIds.has(r.id) ? (
                  <span style={{ fontSize: 11, color: 'var(--t3)' }} title="已有人簽核">🔒 簽核中</span>
                ) : (
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
                )
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
          {r.reject_reason && (
            <div style={{
              fontSize: 12, color: 'var(--red)', marginTop: 6,
              padding: '6px 10px', borderRadius: 8, background: 'var(--red-dim)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}>
              拒絕原因：{r.reject_reason}
            </div>
          )}
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
