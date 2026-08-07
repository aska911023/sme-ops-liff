import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Check, X, Lock, Users, Wallet, ChevronDown, ChevronRight, Calendar, FileText, Eye, ClipboardCheck, Inbox, FileCheck } from 'lucide-react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { liff } from '../lib/liff'
import TaskConfirmationList from '../components/TaskConfirmationList'
import ChainTimeline from '../components/ChainTimeline'
// notifyApprovalEvent 已拔除 — leave/overtime/trip/expense/expense_request/correction 簽核 LINE 統一走主系統 DB trigger
// (sme-ops-system: 20260508110000 expense_request + 20260508130000 hr_a_chain)
// notifyShiftSwapEvent/notifyOffRequestEvent 暫時保留（off_request / shift_swap 還沒做 trigger）
import { notifyShiftSwapEvent, notifyOffRequestEvent } from '../lib/approvalNotify'

// 幣別符號 map — 顯示用，根據 ISO 4217 code 對應到常用符號
//   之前所有金額寫死 'NT$ {amount}' 不看 er.currency → USD/JPY/CNY 等也顯示 NT$
//   現在統一用 fmtCurrency(amount, currency) → 自動換符號，沒對應就 fallback ISO code
const CURRENCY_SYMBOLS = {
  TWD: 'NT$', USD: '$', JPY: '¥', CNY: '¥', EUR: '€', GBP: '£',
  HKD: 'HK$', SGD: 'S$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$', KRW: '₩', THB: '฿',
}
const fmtCurrency = (amount, currency) => {
  const cur = currency || 'TWD'
  const sym = CURRENCY_SYMBOLS[cur] || cur
  return `${sym} ${Number(amount || 0).toLocaleString()}`
}

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料，請重新綁定 LINE',
  APPLICANT_NOT_FOUND: '找不到申請人',
  ORG_MISMATCH: '不在同一組織',
  NOT_YOUR_TURN: '目前不是輪到你簽',
  NO_CHAIN_ATTACHED: '此申請沒掛簽核鏈，請通知管理員設定',
  CHAIN_STEP_NOT_FOUND: '簽核鏈步驟不存在',
  INVALID_TYPE: '單據類型錯誤',
  INVALID_ACTION: '動作無效',
  REASON_REQUIRED: '請填寫退回原因',
  NOT_FOUND_OR_ALREADY_PROCESSED: '單據不存在或已被審過',
}

// 三大分組
const GROUPS = {
  hr: {
    label: '人事',
    icon: Users,
    color: 'cyan',
    tabs: [
      { key: 'leave',      label: '請假',   pendingStatus: '待審核' },
      { key: 'overtime',   label: '加班',   pendingStatus: '待審核' },
      { key: 'trip',       label: '出差',   pendingStatus: '待審核' },
      { key: 'correction', label: '補打卡', pendingStatus: '待審核' },
    ],
  },
  finance: {
    label: '經費',
    icon: Wallet,
    color: 'green',
    tabs: [
      { key: 'expense',         label: '經常性', pendingStatus: '待審核' },
      { key: 'expense_request', label: '非經常性-申請', pendingStatus: '申請中' },
      { key: 'expense_settle',  label: '非經常性-驗收', pendingStatus: '待核銷' },
      // 叫貨單跟費用同表(expense_requests)，doc_type='order' 才收；走同一支簽核 RPC
      { key: 'order_request',   label: '叫貨申請', pendingStatus: '申請中' },
      { key: 'order_settle',    label: '叫貨驗收', pendingStatus: '待核銷' },
    ],
  },
  schedule: {
    label: '排班',
    icon: Calendar,
    color: 'purple',
    tabs: [
      { key: 'off_request',        label: '希望休',      pendingStatus: '待審核' },
      { key: 'shift_swap_peer',    label: '換班-我同意', pendingStatus: '待對方同意' },
      { key: 'shift_swap_manager', label: '換班-我核准', pendingStatus: '待主管核准' },
    ],
  },
  task: {
    label: '任務',
    icon: ClipboardCheck,
    color: 'orange',
    tabs: [
      { key: 'task_confirmation', label: '任務確認', pendingStatus: '待確認' },
    ],
  },
  // HR 異動 3 表（之前只在 Web 看得到，LIFF 跟 Web 對齊後加上）
  personnel: {
    label: '異動',
    icon: Users,
    color: 'cyan',
    tabs: [
      { key: 'resignation', label: '離職',     pendingStatus: '申請中' },
      { key: 'loa',         label: '留停',     pendingStatus: '申請中' },
      { key: 'transfer',    label: '異動',     pendingStatus: '申請中' },
      { key: 'headcount',   label: '人力需求', pendingStatus: '申請中' },
    ],
  },
  // 自訂表單（form_submissions）+ 商品調撥
  form: {
    label: '自訂表單',
    icon: FileText,
    color: 'blue',
    tabs: [
      { key: 'form_submission', label: '表單申請', pendingStatus: '申請中' },
      { key: 'goods_transfer_apply',   label: '調撥-申請', pendingStatus: '申請審核中' },
      { key: 'goods_transfer_receipt', label: '調撥-驗收', pendingStatus: '驗收審核中' },
    ],
  },
}

// HR 異動 3 表 + headcount 的 type → hr_chain_approve 的 p_table 對應
const HR_CHAIN_TABLE_MAP = {
  resignation: 'resignation',
  loa: 'loa',
  transfer: 'transfer',
  headcount: 'headcount',
}

// ── 待簽核 view (原 Approve 內容 1:1 不動) ────────────────────────────────
function PendingApprovalsView() {
  const { lineProfile, employee } = useAuth()
  const navigate = useNavigate()
  // URL 用短英文 slug，內部還是用原本 key（往下相容）
  // /approve            → 預設
  // /approve/leave      → 人事/請假
  // /approve/off        → 排班/希望休
  // /approve/task       → 任務/任務確認
  const TAB_TO_SLUG = {
    leave: 'leave', overtime: 'overtime', trip: 'trip', correction: 'correction',
    expense: 'expense', expense_request: 'expense-request', expense_settle: 'expense-settle',
    order_request: 'order-request', order_settle: 'order-settle',
    off_request: 'off', shift_swap_peer: 'swap-peer', shift_swap_manager: 'swap-manager',
    task_confirmation: 'task',
    // HR 異動 3 表 + 人力需求
    resignation: 'resignation', loa: 'loa', transfer: 'transfer',
    headcount: 'headcount',
    // 商品調撥
    goods_transfer_apply: 'transfer-apply',
    goods_transfer_receipt: 'transfer-receipt',
    form_submission: 'form',
  }
  const SLUG_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_SLUG).map(([k, v]) => [v, k]))

  const findGroupByTab = (tabKey) => {
    for (const [g, def] of Object.entries(GROUPS)) {
      if (def.tabs.some(t => t.key === tabKey)) return g
    }
    return null
  }

  const { tabSlug } = useParams()
  const initialTab = (tabSlug && SLUG_TO_TAB[tabSlug]) || 'leave'
  const initialGroup = findGroupByTab(initialTab) || 'hr'
  const [group, setGroup] = useState(initialGroup)
  const [tab, setTab] = useState(initialTab)

  // 切 group / tab → navigate 到對應 slug 路徑（{ replace: true } 不增加 history entry）
  const changeGroup = (key) => {
    const firstTab = GROUPS[key]?.tabs[0]?.key
    setGroup(key)
    setTab(firstTab)
    navigate(`/approve/${TAB_TO_SLUG[firstTab] || firstTab}`, { replace: true })
  }
  const changeTab = (key) => {
    setTab(key)
    navigate(`/approve/${TAB_TO_SLUG[key] || key}`, { replace: true })
  }
  const [data, setData] = useState({
    leaves: [], overtimes: [], trips: [], expenses: [], corrections: [], expense_requests: [],
    expense_settles: [],
    order_requests: [], order_settles: [],
    resignation_requests: [], leave_of_absence_requests: [], personnel_transfer_requests: [],
    headcount_requests: [],
    form_submissions: [],
    goods_transfer_apply_requests: [],
    goods_transfer_receipt_requests: [],
    shift_swaps_for_peer: [], shift_swaps_for_manager: [], off_requests: [],
    task_confirmations: [],
    can: { hr: false, finance: false },
  })
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  // ★ 只在首次載入時自動切 group（避免 user 切到沒待辦的 group 立刻被踢回去 → 「跳一下跳一下」）
  const [autoSwitched, setAutoSwitched] = useState(false)
  // 自訂表單退回 modal（支援附件上傳）
  const [rejectModal, setRejectModal] = useState({ open: false, id: null })
  const [rejectReason, setRejectReason] = useState('')
  const [rejectFiles, setRejectFiles] = useState([])
  const [rejectBusy, setRejectBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const [{ data: rpc, error }, { data: taskConfs }, { data: transferList }] = await Promise.all([
      supabase.rpc('liff_list_pending_approvals', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_task_confirmations', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_transfer_approvals', { p_line_user_id: lineProfile.lineUserId }),
    ])
    if (error) { console.error('load approvals', error); setLoading(false); return }

    // 商品調撥：依 current_stage 切兩個 tab（申請 / 驗收）
    const transferAll = Array.isArray(transferList) ? transferList : []
    const transferApply   = transferAll.filter(r => r.current_stage === 'apply')
    const transferReceipt = transferAll.filter(r => r.current_stage === 'receipt')

    // ★ chain_total_steps 改 snapshot 感知：load 完 pending approvals 後批次拿正確 total
    //   覆蓋 RPC 內讀 live 的 chain_total_steps（chain 改動後 in-flight 單仍走 snapshot
    //   的 total，避免 LIFF 卡片「第 X/Y 關」的 Y 跟實際 timeline 對不上）
    const erIds = (rpc?.expense_requests || []).map(x => x.id).filter(Boolean)
    let erTotalMap = {}
    if (erIds.length) {
      const { data: totals } = await supabase.rpc('liff_get_chain_total_steps_batch', {
        p_request_type: 'expense_request',
        p_ids: erIds,
      })
      for (const row of (totals || [])) erTotalMap[row.id] = row.total_steps
    }
    // 申請段 expense_requests 沒帶 doc_type（pending RPC 用明確欄位清單），
    // 用 additive 小 RPC 補 doc_type，再把費用 / 叫貨拆開（驗收段 to_jsonb 本來就有 doc_type）
    let erDocMap = {}
    if (erIds.length) {
      const { data: dts } = await supabase.rpc('liff_doc_types_for_ids', { p_ids: erIds })
      for (const row of (dts || [])) erDocMap[row.id] = row.doc_type
    }
    const erWithSnap = (rpc?.expense_requests || []).map(item => ({
      ...item,
      chain_total_steps_snap: erTotalMap[item.id] ?? null,
      doc_type: erDocMap[item.id] || 'expense',
    }))
    const erExpense = erWithSnap.filter(e => (e.doc_type || 'expense') !== 'order')
    const erOrder   = erWithSnap.filter(e => e.doc_type === 'order')
    const settleAll = rpc?.expense_settles || []
    const settleExpense = settleAll.filter(e => (e.doc_type || 'expense') !== 'order')
    const settleOrder   = settleAll.filter(e => e.doc_type === 'order')

    // 請假:pending RPC 的 leaves 段沒回 attachments(病假/喪假證明)→ 加法小 RPC 補,主管審核看得到
    let leavesEnriched = rpc?.leaves || []
    const leaveIds = leavesEnriched.map(x => x.id).filter(Boolean)
    if (leaveIds.length) {
      const { data: la } = await supabase.rpc('liff_leave_attachments_for_ids', {
        p_line_user_id: lineProfile.lineUserId, p_ids: leaveIds,
      })
      const laMap = {}
      for (const row of (la || [])) laMap[row.id] = row.attachments
      leavesEnriched = leavesEnriched.map(l => (laMap[l.id] ? { ...l, attachments: laMap[l.id] } : l))
    }

    // 自訂表單:pending RPC 的 read-snapshot 改寫把 data_resolved 洗掉了(picker id 沒換成名字)
    //   → 前端補呼叫既有 anon 解析器 _resolve_form_submission_data(store/emp/dept picker id→name)
    const rawForms = rpc?.form_submissions || []
    const formSubsResolved = await Promise.all(rawForms.map(async (r) => {
      if (r.data_resolved || !r.data || !Array.isArray(r.template_fields)) return r
      const { data: rd } = await supabase.rpc('_resolve_form_submission_data', {
        p_data: r.data, p_fields: r.template_fields,
      })
      return rd ? { ...r, data_resolved: rd } : r
    }))

    // HR 異動類(離職/留停/異動/人力需求)pending RPC 只回 employee_id、沒回名字 → 卡片申請人顯示「—」
    //   用員工清單 RPC 建 id→name map 補上(審核離職至少要看得到是誰)
    const empNameMap = {}
    {
      const { data: allEmps } = await supabase.rpc('liff_list_employees_in_org', { p_line_user_id: lineProfile.lineUserId })
      for (const e of (allEmps || [])) empNameMap[e.id] = e.name
    }
    const withEmpName = (arr) => (arr || []).map(r =>
      (r.employee || !r.employee_id) ? r : { ...r, employee: empNameMap[r.employee_id] || r.employee })

    setData({
      leaves:                  leavesEnriched,
      overtimes:               rpc?.overtimes               || [],
      trips:                   rpc?.trips                   || [],
      expenses:                rpc?.expenses                || [],
      corrections:             rpc?.corrections             || [],
      expense_requests:        erExpense,
      expense_settles:         settleExpense,
      order_requests:          erOrder,
      order_settles:           settleOrder,
      // HR 異動 3 表（2026-05-17 LIFF 跟 Web 對齊後新增）— 補申請人名字(RPC 只回 id)
      resignation_requests:        withEmpName(rpc?.resignation_requests),
      leave_of_absence_requests:   withEmpName(rpc?.leave_of_absence_requests),
      personnel_transfer_requests: withEmpName(rpc?.personnel_transfer_requests),
      // 人力需求（2026-05-19）
      headcount_requests:          withEmpName(rpc?.headcount_requests),
      // 自訂表單 (2026-05-19 phase 2) — 已補 data_resolved(picker id→name)
      form_submissions:            formSubsResolved,
      // 商品調撥（2026-06-09 — 從專屬 RPC 拉，依 stage 切兩 tab）
      goods_transfer_apply_requests:   transferApply,
      goods_transfer_receipt_requests: transferReceipt,
      shift_swaps_for_peer:    rpc?.shift_swaps_for_peer    || [],
      shift_swaps_for_manager: rpc?.shift_swaps_for_manager || [],
      off_requests:            rpc?.off_requests            || [],
      task_confirmations:      Array.isArray(taskConfs) ? taskConfs : [],
      can:                     rpc?.can                     || { hr: false, finance: false },
    })
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  // 首次載入：若預設 group 沒待辦、別的 group 有 → 自動切到有待辦的（只跑一次）
  // 用戶後續手動切 group 不會再被自動踢回 → 修「跳一下跳一下」bug
  useEffect(() => {
    if (loading || autoSwitched) return
    // 使用者透過 URL 指定 tab → 不自動切
    if (tabSlug) { setAutoSwitched(true); return }

    const cnt = {
      hr:       GROUPS.hr.tabs.reduce((s, t) => s + ((data[mapKey(t.key)] || []).length), 0),
      finance:  GROUPS.finance.tabs.reduce((s, t) => s + ((data[mapKey(t.key)] || []).length), 0),
      schedule: GROUPS.schedule.tabs.reduce((s, t) => s + ((data[mapKey(t.key)] || []).length), 0),
      task:     GROUPS.task.tabs.reduce((s, t) => s + ((data[mapKey(t.key)] || []).length), 0),
    }

    if ((cnt[group] || 0) === 0) {
      const target = ['finance', 'hr', 'schedule', 'task'].find(g => g !== group && (cnt[g] || 0) > 0)
      if (target) {
        const firstTab = GROUPS[target].tabs[0].key
        setGroup(target)
        setTab(firstTab)
        navigate(`/approve/${TAB_TO_SLUG[firstTab] || firstTab}`, { replace: true })
      }
    }
    setAutoSwitched(true)
  }, [loading, data, autoSwitched]) // eslint-disable-line react-hooks/exhaustive-deps

  // tab fallback safety net：group 切到新值若 tab 在新 group 不存在，跳到該 group 第一個 tab
  useEffect(() => {
    const tabs = GROUPS[group].tabs
    if (!tabs.some(t => t.key === tab)) {
      const firstTab = tabs[0].key
      setTab(firstTab)
      navigate(`/approve/${TAB_TO_SLUG[firstTab] || firstTab}`, { replace: true })
    }
  }, [group, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // tab.key → data 屬性名 對應（如 leave → leaves）
  function mapKey(k) {
    return ({ leave: 'leaves', overtime: 'overtimes', trip: 'trips', correction: 'corrections',
              expense: 'expenses', expense_request: 'expense_requests', expense_settle: 'expense_settles',
              order_request: 'order_requests', order_settle: 'order_settles',
              shift_swap_peer: 'shift_swaps_for_peer', shift_swap_manager: 'shift_swaps_for_manager',
              off_request: 'off_requests',
              task_confirmation: 'task_confirmations',
              // HR 異動 3 表 + 人力需求 + 自訂表單
              resignation: 'resignation_requests',
              loa: 'leave_of_absence_requests',
              transfer: 'personnel_transfer_requests',
              headcount: 'headcount_requests',
              form_submission: 'form_submissions' })[k] || k
  }

  const closeRejectModal = () => {
    setRejectModal({ open: false, id: null })
    setRejectReason('')
    setRejectFiles([])
  }

  const handleFormSubmissionReject = async () => {
    if (!rejectReason.trim()) { alert('請填寫退回原因'); return }
    if (!employee?.id) { alert('找不到員工資料，請重新綁定 LINE'); return }
    setRejectBusy(true)

    const attachments = []
    for (const file of rejectFiles) {
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_一-鿿]/g, '_').slice(0, 80)
      const path = `form-reject/${rejectModal.id}/${ts}_${safeName}`
      const { error: upErr } = await supabase.storage.from('uploads').upload(path, file)
      if (upErr) { alert('附件上傳失敗：' + upErr.message); setRejectBusy(false); return }
      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path)
      attachments.push({ url: publicUrl, name: file.name, uploaded_at: new Date().toISOString() })
    }

    const { data: result, error } = await supabase.rpc('form_submission_chain_approve', {
      p_id: rejectModal.id, p_approver_id: employee.id,
      p_action: 'reject', p_reason: rejectReason,
      p_reject_attachments: attachments,
    })
    setRejectBusy(false)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) { alert(ERR_MSG[result?.error] || `退回失敗：${result?.error || 'unknown'}`); return }
    closeRejectModal()
    reload()
  }

  const handle = async (type, id, action) => {
    // 自訂表單退回 → 走 modal（支援附件上傳）
    if (type === 'form_submission' && action === 'reject') {
      setRejectModal({ open: true, id })
      return
    }

    let reason = null
    if (action === 'reject') {
      reason = prompt('退回原因（申請人會看到，並可改後重送）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫退回原因'); return }
    }
    setProcessing(id)

    let result, error
    if (type === 'goods_transfer_apply' || type === 'goods_transfer_receipt') {
      // 商品調撥（申請鏈 / 驗收鏈）— 走 liff_approve_transfer
      ;({ data: result, error } = await supabase.rpc('liff_approve_transfer', {
        p_line_user_id: lineProfile.lineUserId,
        p_id: id, p_action: action, p_reason: reason,
      }))
    } else if (type === 'form_submission') {
      // 自訂表單核准（reject 已在上方攔截）
      if (!employee?.id) {
        setProcessing(null)
        alert('找不到員工資料，請重新綁定 LINE'); return
      }
      ;({ data: result, error } = await supabase.rpc('form_submission_chain_approve', {
        p_id: id, p_approver_id: employee.id, p_action: action, p_reason: reason,
      }))
    } else if (HR_CHAIN_TABLE_MAP[type]) {
      // HR 異動 3 表走 hr_chain_approve（resignation / loa / transfer）
      if (!employee?.id) {
        setProcessing(null)
        alert('找不到員工資料，請重新綁定 LINE'); return
      }
      ;({ data: result, error } = await supabase.rpc('hr_chain_approve', {
        p_table: HR_CHAIN_TABLE_MAP[type], p_id: id,
        p_approver_id: employee.id, p_action: action, p_reason: reason,
      }))
    } else {
      // 其他類型走 liff_approve_request（leave / overtime / trip / correction / expense / expense_request / expense_settle）
      ;({ data: result, error } = await supabase.rpc('liff_approve_request', {
        p_line_user_id: lineProfile.lineUserId,
        p_type: type, p_id: id, p_action: action, p_reason: reason,
      }))
    }
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) {
      alert(ERR_MSG[result?.error] || `審核失敗：${result?.error || 'unknown'}`)
      return
    }
    // ★ 2026-05-08：client-side notifyApprovalEvent 已拔除
    // 推進 LINE 通知由主系統 DB trigger 處理：
    //   - expense_request: AFTER UPDATE current_step → 推下一關 / 終態
    //   - leave/overtime/trip/expense/correction: AFTER UPDATE tasks.assignee_id → 推下一關
    //                                              AFTER UPDATE workflow_instances.status → 推終態
    reload()
  }

  // 希望休 — 主管核准/駁回
  const handleOffRequest = async (off, action) => {
    let reason = null
    if (action === 'reject') {
      reason = prompt('駁回原因（員工會看到）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫駁回原因'); return }
    }
    setProcessing(off.id)
    const { data: result, error } = await supabase.rpc('liff_approve_off_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_id: off.id, p_action: action, p_reason: reason,
    })
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) { alert(ERR_MSG[result?.error] || `失敗：${result?.error}`); return }

    notifyOffRequestEvent({
      event: action === 'approve' ? 'approved' : 'rejected',
      applicantEmpId: result.applicant_emp_id,
      applicantName: off.employee,
      date: result.date,
      reason,
    }).catch(err => console.warn('notify failed', err))
    reload()
  }

  // 班別交換 — B 同意/拒絕
  const handleSwapPeer = async (swap, action) => {
    let reason = null
    if (action === 'reject') {
      reason = prompt('拒絕原因（申請人會看到）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫拒絕原因'); return }
    }
    setProcessing(swap.id)
    const { data: result, error } = await supabase.rpc('liff_respond_shift_swap_peer', {
      p_line_user_id: lineProfile.lineUserId,
      p_swap_id: swap.id, p_action: action === 'approve' ? 'agree' : 'reject', p_reason: reason,
    })
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) { alert(ERR_MSG[result?.error] || `失敗：${result?.error || 'unknown'}`); return }

    notifyShiftSwapEvent({
      event: result.event === 'agreed' ? 'peer_agreed' : 'peer_rejected',
      swap: { ...swap, manager_emp_id: result.manager_emp_id },
      reason,
    }).catch(err => console.warn('notify failed', err))
    reload()
  }

  // 班別交換 — 主管 核准/駁回
  const handleSwapManager = async (swap, action) => {
    let reason = null
    if (action === 'reject') {
      reason = prompt('駁回原因（A、B 都會看到）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫駁回原因'); return }
    }
    setProcessing(swap.id)
    const { data: result, error } = await supabase.rpc('liff_approve_shift_swap_manager', {
      p_line_user_id: lineProfile.lineUserId,
      p_swap_id: swap.id, p_action: action === 'approve' ? 'approve' : 'reject', p_reason: reason,
    })
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) { alert(ERR_MSG[result?.error] || `失敗：${result?.error || 'unknown'}`); return }

    notifyShiftSwapEvent({
      event: result.event === 'approved' ? 'approved' : 'manager_rejected',
      swap, reason,
    }).catch(err => console.warn('notify failed', err))
    reload()
  }

  // tab 對應計數
  const counts = {
    leave:               data.leaves.filter(l => l.status === '待審核').length,
    overtime:            data.overtimes.filter(o => o.status === '待審核').length,
    trip:                data.trips.filter(t => t.status === '待審核').length,
    correction:          data.corrections.filter(c => c.status === '待審核').length,
    expense:             data.expenses.filter(e => e.status === '待審核').length,
    expense_request:     data.expense_requests.filter(e => e.status === '申請中').length,
    expense_settle:      data.expense_settles.filter(e => e.status === '待核銷').length,
    order_request:       data.order_requests.filter(e => e.status === '申請中').length,
    order_settle:        data.order_settles.filter(e => e.status === '待核銷').length,
    shift_swap_peer:     data.shift_swaps_for_peer.length,
    shift_swap_manager:  data.shift_swaps_for_manager.length,
    off_request:         data.off_requests.length,
    task_confirmation:   data.task_confirmations.length,
    resignation:         data.resignation_requests.filter(r => r.status === '申請中').length,
    loa:                 data.leave_of_absence_requests.filter(r => r.status === '申請中').length,
    transfer:            data.personnel_transfer_requests.filter(r => r.status === '申請中').length,
    headcount:           data.headcount_requests.filter(r => r.status === '申請中').length,
    form_submission:     data.form_submissions.filter(r => r.status === '申請中').length,
  }
  const groupCounts = {
    hr:       GROUPS.hr.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    finance:  GROUPS.finance.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    schedule: GROUPS.schedule.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    task:     GROUPS.task.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    personnel: (GROUPS.personnel?.tabs || []).reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    form:     (GROUPS.form?.tabs || []).reduce((sum, t) => sum + (counts[t.key] || 0), 0),
  }
  const totalPending = groupCounts.hr + groupCounts.finance + groupCounts.schedule + groupCounts.task + (groupCounts.personnel || 0) + (groupCounts.form || 0)

  const statusBadge = (s) => s === '已核准' || s === '已核銷' ? 'badge-green' : s === '已退回' || s === '已駁回' || s === '已拒絕' ? 'badge-red' : 'badge-orange'
  // 排班 / 任務 / 異動：只要有 pending 就視為 enabled（任何員工都可能收到，server 端已過濾誰能簽）
  const groupEnabled = {
    hr:        data.can.hr,
    finance:   data.can.finance,
    schedule:  true,
    task:      true,
    personnel: true,  // 異動 3 表：server 端 chain-aware 過濾，無對應 can flag
    form:      true,  // 自訂表單：同上
  }
  const tabEnabled = (k) =>
    ['leave','overtime','trip','correction'].includes(k) ? data.can.hr :
    ['expense','expense_request','expense_settle','order_request','order_settle'].includes(k) ? data.can.finance :
    ['shift_swap_peer','shift_swap_manager','off_request'].includes(k) ? true :
    ['task_confirmation'].includes(k) ? true :
    ['resignation','loa','transfer','headcount','form_submission'].includes(k) ? true : false

  return (
    <>
      {totalPending > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
          }}>{totalPending} 件待審</span>
        </div>
      )}

      {/* ── Group toggle (人事 / 經費) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Object.entries(GROUPS).map(([key, g]) => {
          const Icon = g.icon
          const active = group === key
          const enabled = groupEnabled[key]
          const count = groupCounts[key]
          return (
            <button key={key} onClick={() => changeGroup(key)} style={{
              flex: 1, padding: '10px 6px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              border: `2px solid ${active ? `var(--${g.color})` : 'var(--border2)'}`,
              background: active ? `var(--${g.color}-dim)` : 'var(--card)',
              color: active ? `var(--${g.color})` : enabled ? 'var(--t1)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              opacity: enabled ? 1 : 0.55,
            }}>
              {!enabled && (
                <span style={{ position: 'absolute', top: 4, left: 4 }}>
                  <Lock size={10} />
                </span>
              )}
              <Icon size={20} />
              <span>{g.label}</span>
              {enabled && count > 0 && (
                <span style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--orange)', color: '#fff',
                  fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Sub-tabs (in current group) ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {GROUPS[group].tabs.map(t => {
          const enabled = tabEnabled(t.key)
          const count = counts[t.key] || 0
          return (
            <button key={t.key} onClick={() => changeTab(t.key)} style={{
              flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${tab === t.key ? 'var(--cyan)' : 'var(--border2)'}`,
              background: tab === t.key ? 'var(--cyan-dim)' : 'var(--card)',
              color: tab === t.key ? 'var(--cyan)' : enabled ? 'var(--t2)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative', opacity: enabled ? 1 : 0.55,
            }}>
              {t.label}
              {enabled && count > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
                  background: 'var(--orange)', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : !groupEnabled[group] ? (
        <div className="empty">
          <Lock size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>你的角色沒有權限審核此類單據</div>
        </div>
      ) : (
        renderTab(tab, data, processing, handle, statusBadge, handleSwapPeer, handleSwapManager, handleOffRequest, lineProfile?.lineUserId, reload)
      )}

      {/* ── 自訂表單退回 Modal ── */}
      {rejectModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999,
          display: 'flex', alignItems: 'flex-end',
        }} onClick={e => { if (e.target === e.currentTarget) closeRejectModal() }}>
          <div style={{
            width: '100%', background: 'var(--bg)', borderRadius: '16px 16px 0 0',
            padding: 20, maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: 'var(--t1)' }}>
              退回表單
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                退回原因 <span style={{ color: 'var(--red)' }}>*</span>
              </div>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="請填寫退回原因（申請人會看到）"
                rows={4}
                style={{
                  width: '100%', borderRadius: 8, border: '1.5px solid var(--border2)',
                  padding: '10px 12px', background: 'var(--bg-secondary)', color: 'var(--t1)',
                  fontSize: 14, resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                附件（最多 3 個，可選）
              </div>
              {rejectFiles.length < 3 && (
                <label style={{
                  display: 'block', padding: '12px', borderRadius: 8,
                  border: '1.5px dashed var(--border2)', textAlign: 'center',
                  fontSize: 13, color: 'var(--t3)', cursor: 'pointer',
                }}>
                  📎 選取檔案
                  <input type="file" multiple accept="*/*" style={{ display: 'none' }}
                    onChange={e => {
                      const picked = Array.from(e.target.files || [])
                      setRejectFiles(prev => [...prev, ...picked].slice(0, 3))
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
              {rejectFiles.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rejectFiles.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      background: 'var(--bg-secondary)', borderRadius: 8,
                    }}>
                      <span style={{ flex: 1, fontSize: 12, wordBreak: 'break-all', color: 'var(--t1)' }}>
                        📄 {f.name}
                      </span>
                      <button onClick={() => setRejectFiles(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={closeRejectModal} disabled={rejectBusy} style={{
                flex: 1, padding: 14, borderRadius: 10,
                border: '1.5px solid var(--border2)', background: 'transparent',
                color: 'var(--t2)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                取消
              </button>
              <button onClick={handleFormSubmissionReject} disabled={rejectBusy} style={{
                flex: 2, padding: 14, borderRadius: 10, border: 'none',
                background: rejectBusy ? 'var(--t3)' : 'var(--red)', color: '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: rejectBusy ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: rejectBusy ? 0.7 : 1,
              }}>
                {rejectBusy ? '處理中…' : <><X size={16} /> 確認退回</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function renderTab(tab, data, processing, handle, statusBadge, handleSwapPeer, handleSwapManager, handleOffRequest, lineUserId, reload) {
  const empty = (msg) => <div className="empty">{msg}</div>

  if (tab === 'task_confirmation') {
    return (
      <TaskConfirmationList
        confs={data.task_confirmations}
        lineUserId={lineUserId}
        onReload={reload}
        emptyText="沒有等你確認的任務"
      />
    )
  }

  if (tab === 'off_request') {
    if (data.off_requests.length === 0) return empty('沒有等你審的希望休')
    return data.off_requests.map(o => (
      <div key={o.id} className="list-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{o.employee}</span>
            {(o.store || o.department) && (
              <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500 }}>
                · {o.store || o.department}
              </span>
            )}
          </div>
          <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
          <span className="badge badge-purple" style={{ marginRight: 6 }}>希望休</span>
          {o.date}
        </div>
        {o.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{o.reason}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button disabled={processing === o.id} onClick={() => handleOffRequest(o, 'approve')} style={{
            flex: 3, padding: '10px', borderRadius: 10, border: 'none',
            background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: processing === o.id ? 0.5 : 1,
          }}><Check size={16} /> 核准</button>
          <button disabled={processing === o.id} onClick={() => handleOffRequest(o, 'reject')} style={{
            flex: 1, padding: '10px', borderRadius: 10,
            border: '1.5px solid var(--red)', background: 'transparent',
            color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}><X size={16} /> 駁回</button>
        </div>
      </div>
    ))
  }

  if (tab === 'leave') {
    if (data.leaves.length === 0) return empty('沒有等你審的請假單')
    return data.leaves.map(l => (
      <Row key={l.id} item={l} type="leave" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={l.my_approver_role} stepLabel={l.my_step_label} isSelf={l.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
            <span className="badge badge-cyan" style={{ marginRight: 6 }}>{l.type}</span>
            {l.start_date}{l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
            <span style={{ marginLeft: 8, color: 'var(--t3)' }}>
              {(Number(l.hours) || (Number(l.days) || 0) * 8)} 小時
            </span>
          </div>
          {l.reason && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{l.reason}</div>}
          {Array.isArray(l.attachments) && l.attachments.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📎 證明附件（{l.attachments.length}）</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {l.attachments.map((url, i) => {
                  const isImg = /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(String(url))
                  // 檔名:URL 最後一段去掉「單號-時間-」前綴(對齊 LINE 卡 deriveFileName)
                  let fname = ''
                  try { fname = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/^\d+-\d+-/, '') } catch { fname = '' }
                  fname = fname || `附件 ${i + 1}`
                  return isImg ? (
                    <a key={i} href={url} target="_blank" rel="noreferrer" title={fname}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, maxWidth: 66, textDecoration: 'none' }}>
                      <img src={url} alt={fname} loading="lazy"
                        style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border2)' }} />
                      <span style={{ fontSize: 9, color: 'var(--t3)', maxWidth: 66, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</span>
                    </a>
                  ) : (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: 'var(--cyan)', textDecoration: 'underline' }}>📄 {fname}</a>
                  )
                })}
              </div>
            </div>
          )}
        </>}
      />
    ))
  }
  if (tab === 'overtime') {
    if (data.overtimes.length === 0) return empty('沒有等你審的加班單')
    return data.overtimes.map(o => (
      <Row key={o.id} item={o} type="overtime" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={o.my_approver_role} stepLabel={o.my_step_label} isSelf={o.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            {o.date} · <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{o.hours}h</span>
          </div>
          {o.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{o.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'trip') {
    if (data.trips.length === 0) return empty('沒有等你審的出差單')
    return data.trips.map(t => (
      <Row key={t.id} item={t} type="trip" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={t.my_approver_role} stepLabel={t.my_step_label} isSelf={t.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{t.destination}</span>
            <span> · {t.start_date} ~ {t.end_date}</span>
          </div>
          {t.purpose && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{t.purpose}</div>}
          {t.budget > 0 && <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginTop: 4 }}>預算：{fmtCurrency(t.budget, t.currency)}</div>}
        </>}
      />
    ))
  }
  if (tab === 'correction') {
    if (data.corrections.length === 0) return empty('沒有等你審的補打卡單')
    return data.corrections.map(c => (
      <Row key={c.id} item={c} type="correction" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核准並修正"
        body={<>
          <ApproverRoleBadge role={c.my_approver_role} stepLabel={c.my_step_label} isSelf={c.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>{c.date}</div>
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600, marginTop: 2 }}>
            {({ clock_in: '上班打卡', clock_out: '下班打卡' }[c.type] || c.type || '上班打卡')}：{c.correction_time || '未填'}
          </div>
          {c.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{c.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'expense') {
    if (data.expenses.length === 0) return empty('沒有等你審的報帳單')
    return data.expenses.map(e => (
      <Row key={e.id} item={e} type="expense" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核銷"
        body={<>
          <ApproverRoleBadge role={e.my_approver_role} stepLabel={e.my_step_label} isSelf={e.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-cyan" style={{ marginRight: 6 }}>{e.category}</span>
            <span style={{ fontWeight: 700 }}>{fmtCurrency(e.amount, e.currency)}</span>
            <span style={{ color: 'var(--t3)' }}> · {e.date}</span>
          </div>
          {e.description && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{e.description}</div>}
        </>}
      />
    ))
  }
  if (tab === 'shift_swap_peer') {
    if (data.shift_swaps_for_peer.length === 0) return empty('沒有等你回覆的換班申請')
    return data.shift_swaps_for_peer.map(s => (
      <SwapRow key={s.id} swap={s} role="peer" processing={processing} statusBadge={statusBadge}
        onApprove={() => handleSwapPeer(s, 'approve')}
        onReject={() => handleSwapPeer(s, 'reject')}
      />
    ))
  }
  if (tab === 'shift_swap_manager') {
    if (data.shift_swaps_for_manager.length === 0) return empty('沒有等你核准的換班')
    return data.shift_swaps_for_manager.map(s => (
      <SwapRow key={s.id} swap={s} role="manager" processing={processing} statusBadge={statusBadge}
        onApprove={() => handleSwapManager(s, 'approve')}
        onReject={() => handleSwapManager(s, 'reject')}
      />
    ))
  }
  if (tab === 'expense_request') {
    if (data.expense_requests.length === 0) return empty('沒有等你審的申請單')
    return data.expense_requests.map(er => (
      <ExpenseRequestRow key={er.id} er={er} processing={processing} handle={handle} statusBadge={statusBadge} />
    ))
  }
  if (tab === 'expense_settle') {
    if (data.expense_settles.length === 0) return empty('沒有等你審的核銷單')
    return data.expense_settles.map(er => (
      <ExpenseSettleRow key={er.id} er={er} processing={processing} handle={handle} statusBadge={statusBadge} />
    ))
  }
  // 叫貨：跟費用同元件（handle 走 expense_request/expense_settle，RPC 認 id），只差標題標叫貨
  if (tab === 'order_request') {
    if (data.order_requests.length === 0) return empty('沒有等你審的叫貨申請單')
    return data.order_requests.map(er => (
      <ExpenseRequestRow key={er.id} er={er} processing={processing} handle={handle} statusBadge={statusBadge} />
    ))
  }
  if (tab === 'order_settle') {
    if (data.order_settles.length === 0) return empty('沒有等你驗收的叫貨單')
    return data.order_settles.map(er => (
      <ExpenseSettleRow key={er.id} er={er} processing={processing} handle={handle} statusBadge={statusBadge} />
    ))
  }
  // ─── HR 異動 3 表（共用通用 Row 元件） ──────────────────────────────
  if (tab === 'resignation') {
    if (data.resignation_requests.length === 0) return empty('沒有等你審的離職申請')
    return data.resignation_requests.map(r => (
      <Row key={r.id}
        item={{ ...r, employee: r.employee?.name || r.employee || '—', employee_id: r.employee?.id || r.employee_id }}
        type="resignation" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={r.my_approver_role} stepLabel={r.my_step_label} isSelf={r.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-purple" style={{ marginRight: 6 }}>離職</span>
            預計 {r.planned_resign_date || '—'}
          </div>
          {r.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{r.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'loa') {
    if (data.leave_of_absence_requests.length === 0) return empty('沒有等你審的留停申請')
    return data.leave_of_absence_requests.map(r => (
      <Row key={r.id}
        item={{ ...r, employee: r.employee?.name || r.employee || '—', employee_id: r.employee?.id || r.employee_id }}
        type="loa" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={r.my_approver_role} stepLabel={r.my_step_label} isSelf={r.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-purple" style={{ marginRight: 6 }}>留停</span>
            {r.start_date || ''} ~ {r.end_date || ''}
          </div>
          {r.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{r.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'transfer') {
    if (data.personnel_transfer_requests.length === 0) return empty('沒有等你審的人事異動')
    return data.personnel_transfer_requests.map(r => (
      <Row key={r.id}
        item={{ ...r, employee: r.employee?.name || r.employee || '—', employee_id: r.employee?.id || r.employee_id }}
        type="transfer" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={r.my_approver_role} stepLabel={r.my_step_label} isSelf={r.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-purple" style={{ marginRight: 6 }}>{r.transfer_type || '異動'}</span>
            生效 {r.effective_date || '—'}
          </div>
          {r.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{r.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'headcount') {
    if (data.headcount_requests.length === 0) return empty('沒有等你審的人力需求')
    return data.headcount_requests.map(r => (
      <Row key={r.id}
        item={{ ...r, employee: r.employee?.name || r.employee || '—', employee_id: r.employee?.id || r.employee_id }}
        type="headcount" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <ApproverRoleBadge role={r.my_approver_role} stepLabel={r.my_step_label} isSelf={r.is_self_approve} />
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-purple" style={{ marginRight: 6 }}>人力需求</span>
            {r.job_title || '—'} × {r.headcount || 0} 人
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
            {r.form_no ? `${r.form_no}　·　` : ''}
            {r.job_type || ''}
            {r.salary_type ? `　·　${r.salary_type} ${r.salary_range || ''}` : ''}
          </div>
          {r.new_reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>原因：{r.new_reason}</div>}
        </>}
      />
    ))
  }
  // 商品調撥（申請鏈 / 驗收鏈）— UI 一致，差別在 type 字串給 handle 用
  if (tab === 'goods_transfer_apply' || tab === 'goods_transfer_receipt') {
    const list = tab === 'goods_transfer_apply'
      ? data.goods_transfer_apply_requests
      : data.goods_transfer_receipt_requests
    if (list.length === 0) {
      return empty(tab === 'goods_transfer_apply' ? '沒有等你審的調撥申請' : '沒有等你審的調撥驗收')
    }
    const TYPE_LABEL = { warehouse_to_store: '總倉→門市', store_to_store: '門市→門市', store_to_warehouse: '門市→總倉' }
    return list.map(r => (
      <Row key={r.id}
        item={{ ...r, employee: r.applicant_name || '—', employee_id: r.applicant_id }}
        type={tab}
        processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-orange" style={{ marginRight: 6 }}>{r.document_no}</span>
            <span style={{ color: 'var(--t3)' }}>{TYPE_LABEL[r.transfer_type] || r.transfer_type}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t2)' }}>
            <b>{r.from_label || '—'}</b> → <b>{r.to_label || '—'}</b>
          </div>
          {Array.isArray(r.items) && r.items.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-card-alt, rgba(0,0,0,0.02))', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.items.map((it, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 12 }}>
                  <span style={{ color: 'var(--t1)' }}>{it.product_code} · {it.product_name}{it.spec ? ` (${it.spec})` : ''}</span>
                  <span style={{ color: 'var(--t3)' }}>
                    {tab === 'goods_transfer_receipt' && it.received_qty != null
                      ? `申 ${it.requested_qty} / 實 ${it.received_qty}`
                      : `${it.requested_qty} ${it.unit || ''}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {r.reasons && Array.isArray(r.reasons) && r.reasons.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t3)' }}>
              原因：{r.reasons.join('、')}{r.reason_other ? ` · ${r.reason_other}` : ''}
            </div>
          )}
        </>}
      />
    ))
  }

  if (tab === 'form_submission') {
    if (data.form_submissions.length === 0) return empty('沒有等你審的自訂表單')
    return data.form_submissions.map(r => {
      // 拆 fields → fieldRows (label + value) + attachments
      const fields = Array.isArray(r.template_fields) ? r.template_fields : []
      const src = r.data_resolved || r.data || {}
      const fieldRows = []
      const attachments = []
      for (const f of fields) {
        if (f.type === 'section') continue
        const v = src[f.key]
        if (f.type === 'file') {
          // 檔案欄位值可能是 [{url,name}] 陣列 / 單一 {url,name} 物件 / 字串 URL
          const items = Array.isArray(v) ? v : (v ? [v] : [])
          for (const it of items) {
            if (!it) continue
            if (typeof it === 'string') {
              const name = it.split('?')[0].split('/').pop() || f.label || '附件'
              attachments.push({ url: it, name, label: f.label })
            } else if (it.url) {
              const name = it.name || String(it.url).split('?')[0].split('/').pop() || f.label || '附件'
              attachments.push({ url: it.url, name, label: f.label })
            }
          }
        } else {
          let displayValue
          if (v === null || v === undefined || v === '') displayValue = '—'
          else if (f.type === 'checkbox') displayValue = v ? '✓ 是' : '✗ 否'
          else displayValue = String(v)
          fieldRows.push({ label: f.label, value: displayValue, multiline: f.type === 'textarea' })
        }
      }
      // form_attachments 表的附件（storage_path → public URL）
      const dbAttachments = (r.attachments || []).map(a => ({
        url: supabase.storage.from(a.storage_bucket || 'attachments').getPublicUrl(a.storage_path).data?.publicUrl || '',
        name: a.file_name,
        label: '附件',
      }))
      const allAttachments = [...attachments, ...dbAttachments]

      return (
        <Row key={r.id}
          item={{ ...r, employee: r.applicant_name || '—', employee_id: r.applicant_id }}
          type="form_submission" processing={processing} handle={handle} statusBadge={statusBadge}
          body={<>
            <ApproverRoleBadge role={r.my_approver_role} stepLabel={r.my_step_label} isSelf={r.is_self_approve} />
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>
              <span className="badge badge-blue" style={{ marginRight: 6 }}>{r.template_name || '自訂表單'}</span>
            </div>
            {/* 欄位資料 */}
            {fieldRows.length > 0 && (
              <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-card-alt, rgba(0,0,0,0.02))', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {fieldRows.map((row, i) => (
                  <div key={i} style={{
                    display: row.multiline ? 'block' : 'grid',
                    gridTemplateColumns: row.multiline ? undefined : '90px 1fr',
                    gap: 6, fontSize: 12, lineHeight: 1.5,
                  }}>
                    <span style={{ color: 'var(--t3)' }}>{row.label}</span>
                    <span style={{ color: 'var(--t1)', wordBreak: 'break-all' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 附件（data 欄位 URL + form_attachments 表） */}
            {allAttachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>📎 附件</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {allAttachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"
                       style={{ fontSize: 12, color: 'var(--accent-cyan, #06b6d4)', textDecoration: 'underline', wordBreak: 'break-all' }}>
                      {a.label}：{a.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>}
        />
      )
    })
  }
  return null
}

// ── 專屬 expense_request row：上方摘要 / 下方 3 TAB（基本 / 細節 / 進度） ──
function ExpenseRequestRow({ er, processing, handle, statusBadge }) {
  const { employee: me, lineProfile } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('basic')   // 'basic' | 'detail' | 'progress'
  const [chainSteps, setChainSteps] = useState(null)  // null = 未載入；array = 已載入
  const [chainLoading, setChainLoading] = useState(false)
  const isPending = er.status === '申請中'

  // 加簽（P3c）相關 state
  const [pendingExtra, setPendingExtra] = useState(null)    // 此單目前的 pending 加簽（任何人）
  const [extraEmployees, setExtraEmployees] = useState([])  // 加簽人選清單
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [extraAssignee, setExtraAssignee] = useState('')
  const [extraReason, setExtraReason] = useState('')
  const [extraBusy, setExtraBusy] = useState(false)

  // 從 LINE 卡「🪶 加簽」按鈕跳過來：URL ?id=X&openAddSigner=1 → 自動展開 row + 開加簽表單
  const [urlParams] = useSearchParams()
  const autoOpenId = urlParams.get('id')
  const autoOpenAddSigner = urlParams.get('openAddSigner')
  useEffect(() => {
    if (autoOpenId && String(er.id) === String(autoOpenId)) {
      setExpanded(true)
      if (autoOpenAddSigner === '1' && isPending) {
        // 等 useEffect 撈完 employees / pendingExtra 再開（不然下拉選單沒人）
        setTimeout(() => setShowExtraForm(true), 600)
      }
    }
  }, [autoOpenId, autoOpenAddSigner, er.id, isPending])

  // 切到「進度」tab 才 lazy fetch chain steps（避免不展開的 row 也送 RPC）
  useEffect(() => {
    if (tab !== 'progress' || !expanded || chainSteps !== null) return
    setChainLoading(true)
    supabase.rpc('liff_get_expense_request_chain_status', { p_id: er.id })
      .then(({ data }) => setChainSteps(Array.isArray(data) ? data : []))
      .finally(() => setChainLoading(false))
  }, [tab, expanded, chainSteps, er.id])

  // 撈這張單的 pending 加簽 + 員工清單（供加簽人選擇）
  //   ⚠️ 不綁 expanded：加簽按鈕/表單在 isPending 就會出現、不需展開卡片，
  //      若清單只在展開時抓 → 沒展開就點加簽 → 選單永遠空（老問題病灶）
  useEffect(() => {
    if (!isPending || !lineProfile?.lineUserId) return
    let cancelled = false
    ;(async () => {
      const { data: extra } = await supabase.rpc('liff_get_pending_extra_step', {
        p_line_user_id: lineProfile?.lineUserId,
        p_source_table: 'expense_requests',
        p_source_id: er.id,
      })
      if (!cancelled) setPendingExtra(extra || null)

      if (extraEmployees.length === 0) {
        // LIFF anon 直接讀 employees 表會被 RLS 擋 → 走 SECURITY DEFINER RPC
        const { data: emps } = await supabase.rpc('liff_list_employees_in_org', {
          p_line_user_id: lineProfile?.lineUserId,
        })
        if (!cancelled) setExtraEmployees(Array.isArray(emps) ? emps : [])
      }
    })()
    return () => { cancelled = true }
  }, [isPending, er.id, extraEmployees.length, lineProfile?.lineUserId])

  // 我發起的加簽 / 我是被加簽的人
  const isMyExtraRequest = pendingExtra && me && pendingExtra.requested_by_id === me.id
  const isMyExtraAssignment = pendingExtra && me && pendingExtra.assignee_id === me.id

  const submitExtra = async () => {
    if (!extraAssignee) { alert('請選擇加簽人'); return }
    setExtraBusy(true)
    const { error } = await supabase.rpc('request_extra_signer', {
      p_source_table: 'expense_requests',
      p_source_id: er.id,
      p_insert_before_step: er.current_step ?? 0,
      p_assignee_id: Number(extraAssignee),
      p_requested_by_id: me?.id,
      p_reason: extraReason?.trim() || null,
    })
    setExtraBusy(false)
    if (error) {
      alert(`加簽失敗：${error.message}`)
      return
    }
    setShowExtraForm(false)
    setExtraAssignee('')
    setExtraReason('')
    // 重新撈 pending extra
    const { data: extra } = await supabase.rpc('liff_get_pending_extra_step', {
      p_line_user_id: lineProfile?.lineUserId,
      p_source_table: 'expense_requests',
      p_source_id: er.id,
    })
    setPendingExtra(extra || null)
  }

  const cancelMyExtra = async () => {
    if (!pendingExtra || !confirm('確定撤銷加簽？')) return
    setExtraBusy(true)
    const { error } = await supabase.rpc('cancel_extra_signer', {
      p_extra_step_id: pendingExtra.id,
      p_canceller_id: me?.id,
    })
    setExtraBusy(false)
    if (error) { alert(`撤銷失敗：${error.message}`); return }
    setPendingExtra(null)
  }

  const processExtra = async (action) => {
    if (!pendingExtra) return
    let reason = null
    if (action === 'reject') {
      reason = prompt('退回加簽原因（必填）：')
      if (!reason || !reason.trim()) { alert('必須填寫退回原因'); return }
    }
    setExtraBusy(true)
    const { error } = await supabase.rpc('process_extra_signer', {
      p_extra_step_id: pendingExtra.id,
      p_processor_id: me?.id,
      p_action: action,
      p_reject_reason: reason?.trim() || null,
    })
    setExtraBusy(false)
    if (error) { alert(`${action === 'approve' ? '核准' : '退回'}失敗：${error.message}`); return }
    setPendingExtra(null)
    if (action === 'reject') {
      // 整單會被 trigger 標已駁回；觸發 parent 重新 load
      alert('已退回加簽，整單會自動退回')
    }
  }

  const items = Array.isArray(er.items) ? er.items : []
  const hasItems = items.length > 0
  const hasSupplier = er.supplier && er.supplier.trim()
  const isNonExpense = er.is_expense === false

  return (
    <div className="list-item" style={{
      borderLeft: er.status === '已退回' ? '3px solid var(--red)' : undefined,
    }}>
      {/* Header (clickable) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 15, fontWeight: 800 }}>{er.employee}</span>
          </div>
          <span className={`badge ${statusBadge(er.status)}`}>{er.status}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
          {er.title}
          {er.doc_type === 'order' && (
            <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.15)', color: '#6366f1', fontWeight: 700 }}>🛒 叫貨</span>
          )}
          {isNonExpense && (
            <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', color: 'var(--purple)', fontWeight: 700 }}>非費用</span>
          )}
        </div>
        {!isNonExpense && (
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700, marginBottom: 4 }}>
            {fmtCurrency(er.estimated_amount, er.currency)}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          {!isNonExpense && er.account_name && <span>{er.account_name} · </span>}
          {er.department && <span>{er.department} · </span>}
          {!isNonExpense && er.store && <span>{er.store}</span>}
        </div>
        {er.chain_name && (
          <div style={{
            marginTop: 6, padding: '4px 8px', borderRadius: 6,
            background: 'var(--purple-dim)', color: 'var(--purple)',
            fontSize: 11, fontWeight: 600,
          }}>
            🔐 {er.chain_name} · 第 {er.current_step + 1} / {er.chain_total_steps_snap ?? er.chain_total_steps} 關
            {er.my_step_label ? `（${er.my_step_label}）` : ''}
          </div>
        )}
        <ApproverRoleBadge role={er.my_approver_role} stepLabel={null} isSelf={er.is_self_approve} />
      </div>

      {/* 退回原因（醒目） */}
      {er.reject_reason && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.12)', border: '1px solid var(--red)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>🔄 退回原因</div>
          <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{er.reject_reason}</div>
        </div>
      )}

      {/* 展開內容 — 左右 2 TAB */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* TabBar（左右各占一半）*/}
          <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid var(--border2)' }}>
            <button
              onClick={() => setTab('basic')}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: tab === 'basic' ? 'var(--cyan)' : 'var(--t3)',
                borderBottom: tab === 'basic' ? '2px solid var(--cyan)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >📋 基本資訊</button>
            <button
              onClick={() => setTab('detail')}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: tab === 'detail' ? 'var(--cyan)' : 'var(--t3)',
                borderBottom: tab === 'detail' ? '2px solid var(--cyan)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >📦 細節與附件</button>
            <button
              onClick={() => setTab('progress')}
              style={{
                flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: tab === 'progress' ? 'var(--cyan)' : 'var(--t3)',
                borderBottom: tab === 'progress' ? '2px solid var(--cyan)' : '2px solid transparent',
                marginBottom: -1,
              }}
            >🔐 簽核進度</button>
          </div>

          {/* TAB 1：基本資訊 */}
          {tab === 'basic' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              {er.created_at && (
                <KvRow k="提交時間" v={er.created_at.replace('T', ' ').slice(0, 16)} />
              )}
              <KvRow k="申請人" v={er.employee} />
              {er.department && <KvRow k="部門" v={er.department} />}
              {!isNonExpense && er.store && <KvRow k="門市" v={er.store} />}
              {isNonExpense
                ? <KvRow k="類型" v="非費用申請" highlight />
                : <KvRow k="預估金額" v={fmtCurrency(er.estimated_amount, er.currency)} highlight />
              }
              {!isNonExpense && er.account_code && (
                <KvRow k="會計科目" v={`${er.account_code} ${er.account_name || ''}`} />
              )}
              {er.chain_name && (
                <KvRow k="簽核鏈" v={`${er.chain_name} (第 ${er.current_step + 1}/${er.chain_total_steps_snap ?? er.chain_total_steps} 關)`} />
              )}
            </div>
          )}

          {/* TAB 2：細節與附件 */}
          {tab === 'detail' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <KvRow k={isNonExpense ? '主旨' : '項目'} v={er.title || '—'} />
              {!isNonExpense && hasSupplier && <KvRow k="供應商" v={er.supplier} />}
              {er.description && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📝 說明</div>
                  <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap',
                    padding: 8, background: 'var(--bg)', borderRadius: 6 }}>{er.description}</div>
                </div>
              )}

              {/* 品項明細 table — 非費用隱藏 */}
              {!isNonExpense && hasItems && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>🛒 品項明細</div>
                  <div style={{ border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          <th style={{ padding: '5px 6px', textAlign: 'left', color: 'var(--t3)' }}>品名</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--t3)', width: 50 }}>數量</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--t3)', width: 80 }}>單價</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', color: 'var(--t3)', width: 90 }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((li, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border2)' }}>
                            <td style={{ padding: '4px 6px' }}>{li.name}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }}>{li.qty}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {fmtCurrency(li.unit_price, er.currency)}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                              {fmtCurrency(li.subtotal, er.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 附件 */}
              <div style={{ marginTop: 10 }}>
                <ExpenseAttachments requestId={er.id} />
              </div>

              {!hasItems && !hasSupplier && !er.description && (
                <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 12, padding: 20 }}>
                  此筆無細節資料
                </div>
              )}
            </div>
          )}

          {/* TAB 3：簽核進度（時間軸） */}
          {tab === 'progress' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <ChainTimeline
                steps={chainSteps}
                loading={chainLoading}
                requestType="expense_request"
                requestId={er.id}
              />
            </div>
          )}
        </div>
      )}

      {/* 核准 / 退回 / 加簽 按鈕（依加簽狀態切換）*/}
      {isPending && (() => {
        // 情境 A：我是加簽人 → 渲染處理加簽的按鈕（取代正常 chain 按鈕）
        if (isMyExtraAssignment) {
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: 'rgba(249,115,22,0.12)', color: 'var(--orange, #f97316)',
                fontSize: 13, fontWeight: 700,
              }}>
                🪶 加簽待你處理
                {pendingExtra?.reason && <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4, color: 'var(--t1)' }}>原因：{pendingExtra.reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={extraBusy} onClick={() => processExtra('approve')} style={{
                  flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: extraBusy ? 0.5 : 1,
                }}><Check size={16} /> 核准加簽</button>
                <button disabled={extraBusy} onClick={() => processExtra('reject')} style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1.5px solid var(--red)', background: 'transparent',
                  color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><X size={16} /> 退回</button>
              </div>
            </div>
          )
        }

        // 情境 B：有 pending 加簽，但我不是加簽人 → 顯示加簽中狀態（發起人可撤銷）
        if (pendingExtra) {
          const assigneeName = extraEmployees.find(e => e.id === pendingExtra.assignee_id)?.name || '加簽人'
          return (
            <div style={{
              marginTop: 10, padding: '10px', borderRadius: 10,
              background: 'rgba(249,115,22,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange, #f97316)' }}>
                🪶 加簽中：{assigneeName}
              </span>
              {isMyExtraRequest && (
                <button disabled={extraBusy} onClick={cancelMyExtra} style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1.5px solid var(--orange, #f97316)', background: 'transparent',
                  color: 'var(--orange, #f97316)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  opacity: extraBusy ? 0.5 : 1,
                }}>撤銷加簽</button>
              )}
            </div>
          )
        }

        // 情境 C：正常 — 核准 / 退回 / 加簽 三鈕
        return (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button disabled={processing === er.id} onClick={() => handle('expense_request', er.id, 'approve')} style={{
                flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: processing === er.id ? 0.5 : 1,
              }}><Check size={16} /> 核准</button>
              <button disabled={processing === er.id} onClick={() => handle('expense_request', er.id, 'reject')} style={{
                flex: 1, padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--red)', background: 'transparent',
                color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}><X size={16} /> 退回</button>
            </div>
            <button onClick={() => setShowExtraForm(s => !s)} style={{
              width: '100%', marginTop: 6, padding: '8px', borderRadius: 8,
              border: '1.5px dashed var(--orange, #f97316)', background: 'transparent',
              color: 'var(--orange, #f97316)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>🪶 加簽（邀請第三人協助審核）</button>
          </>
        )
      })()}

      {/* 加簽 inline form（P3c）*/}
      {isPending && showExtraForm && !pendingExtra && (
        <div style={{
          marginTop: 10, padding: 12, borderRadius: 10,
          background: 'rgba(249,115,22,0.06)', border: '1.5px solid var(--orange, #f97316)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--orange, #f97316)' }}>🪶 發起加簽</div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>加簽人 *</label>
          <EmployeePicker
            value={extraAssignee}
            onChange={setExtraAssignee}
            options={extraEmployees.filter(e => e.id !== me?.id && e.id !== er.employee_id)}
            placeholder="— 請選擇加簽人 —"
          />

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>加簽原因（選填）</label>
          <textarea value={extraReason} onChange={e => setExtraReason(e.target.value)}
            placeholder="例：金額較高，請會計師先看"
            rows={2}
            style={{
              width: '100%', padding: '8px', borderRadius: 6, marginBottom: 10,
              border: '1px solid var(--border2)', background: 'var(--card)',
              fontSize: 13, color: 'var(--t1)', resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowExtraForm(false); setExtraAssignee(''); setExtraReason('') }}
              style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: '1px solid var(--border2)', background: 'transparent',
                color: 'var(--t3)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>取消</button>
            <button disabled={extraBusy || !extraAssignee} onClick={submitExtra} style={{
              flex: 2, padding: '8px', borderRadius: 8, border: 'none',
              background: 'var(--orange, #f97316)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: (extraBusy || !extraAssignee) ? 0.5 : 1,
            }}>{extraBusy ? '送出中…' : '送出加簽請求'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 專屬 expense_settle row：實際 vs 申請金額 + chain 進度 ──
function ExpenseSettleRow({ er, processing, handle, statusBadge }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('basic')
  const [chainSteps, setChainSteps] = useState(null)
  const [chainLoading, setChainLoading] = useState(false)
  const isPending = er.status === '待核銷'
  const diff = (Number(er.actual_amount) || 0) - (Number(er.estimated_amount) || 0)

  useEffect(() => {
    if (tab !== 'progress' || !expanded || chainSteps !== null) return
    setChainLoading(true)
    supabase.rpc('liff_get_expense_settle_chain_status', { p_id: er.id })
      .then(({ data }) => setChainSteps(Array.isArray(data) ? data : []))
      .finally(() => setChainLoading(false))
  }, [tab, expanded, chainSteps, er.id])

  return (
    <div className="list-item" style={{
      borderLeft: er.status === '核銷已退回' ? '3px solid var(--red)' : undefined,
    }}>
      <ApproverRoleBadge role={er.my_approver_role} stepLabel={er.my_step_label} isSelf={er.is_self_approve} />
      {/* Header (clickable) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 15, fontWeight: 800 }}>{er.employee}</span>
            {er.doc_type === 'order'
              ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: 'rgba(22,163,74,0.15)', color: 'var(--green)', fontWeight: 700 }}>📦 驗收</span>
              : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: 'var(--cyan-dim)', color: 'var(--cyan)', fontWeight: 700 }}>🧾 核銷</span>}
          </div>
          <span className={`badge ${statusBadge(er.status)}`}>{er.status}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{er.title}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 4 }}>
          <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>
            {er.doc_type === 'order' ? '實收' : '實際'} {fmtCurrency(er.actual_amount, er.currency)}
          </span>
          <span style={{ color: 'var(--t3)' }}>
            (申請 {Number(er.estimated_amount || 0).toLocaleString()})
          </span>
          {diff !== 0 && (
            <span style={{ color: diff > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
              {diff > 0 ? '+' : ''}{diff.toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>
          {er.account_name && <span>{er.account_name} · </span>}
          {er.department && <span>{er.department} · </span>}
          {er.store && <span>{er.store}</span>}
        </div>
        {er.settle_chain_name && (
          <div style={{
            marginTop: 6, padding: '4px 8px', borderRadius: 6,
            background: 'var(--purple-dim)', color: 'var(--purple)',
            fontSize: 11, fontWeight: 600,
          }}>
            🔐 {er.settle_chain_name} · 第 {(er.settle_current_step ?? 0) + 1} / {er.settle_total_steps} 關
            {er.my_step_label ? `（${er.my_step_label}）` : ''}
          </div>
        )}
      </div>

      {/* 退回原因 */}
      {er.settle_reject_reason && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.12)', border: '1px solid var(--red)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>🔄 退回原因</div>
          <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap' }}>{er.settle_reject_reason}</div>
        </div>
      )}

      {/* 展開內容 */}
      {expanded && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 10, borderBottom: '1px solid var(--border2)' }}>
            <button onClick={() => setTab('basic')} style={{
              flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === 'basic' ? 'var(--cyan)' : 'var(--t3)',
              borderBottom: tab === 'basic' ? '2px solid var(--cyan)' : '2px solid transparent',
              marginBottom: -1,
            }}>📋 基本</button>
            <button onClick={() => setTab('detail')} style={{
              flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === 'detail' ? 'var(--cyan)' : 'var(--t3)',
              borderBottom: tab === 'detail' ? '2px solid var(--cyan)' : '2px solid transparent',
              marginBottom: -1,
            }}>📦 細節與附件</button>
            <button onClick={() => setTab('progress')} style={{
              flex: 1, padding: '8px 12px', fontSize: 13, fontWeight: 700,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: tab === 'progress' ? 'var(--cyan)' : 'var(--t3)',
              borderBottom: tab === 'progress' ? '2px solid var(--cyan)' : '2px solid transparent',
              marginBottom: -1,
            }}>🔐 簽核進度</button>
          </div>

          {tab === 'basic' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <KvRow k="申請人" v={er.employee} />
              {er.department && <KvRow k="部門" v={er.department} />}
              {er.store && <KvRow k="門市" v={er.store} />}
              <KvRow k="實際金額" v={fmtCurrency(er.actual_amount, er.currency)} highlight />
              <KvRow k="申請金額" v={fmtCurrency(er.estimated_amount, er.currency)} />
              {diff !== 0 && (
                <KvRow k="差額" v={`${diff > 0 ? '+' : ''}${fmtCurrency(diff, er.currency)}`} />
              )}
              {er.account_code && (
                <KvRow k="會計科目" v={`${er.account_code} ${er.account_name || ''}`} />
              )}
              {er.chain_name && (
                <KvRow k="核銷簽核鏈" v={`${er.chain_name} (第 ${er.settle_current_step + 1}/${er.chain_total_steps_snap ?? er.chain_total_steps} 關)`} />
              )}
            </div>
          )}

          {tab === 'detail' && (() => {
            const settleItems = Array.isArray(er.items) ? er.items : []
            const hasSettleItems = settleItems.length > 0
            const hasSettleSupplier = er.supplier && er.supplier.trim()
            return (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <KvRow k="項目" v={er.title || '—'} />
              {hasSettleSupplier && <KvRow k="供應商" v={er.supplier} />}
              {er.description && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📝 申請說明</div>
                  <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap',
                    padding: 8, background: 'var(--bg)', borderRadius: 6 }}>{er.description}</div>
                </div>
              )}
              {er.notes && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📝 核銷說明</div>
                  <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap',
                    padding: 8, background: 'var(--bg)', borderRadius: 6 }}>{er.notes}</div>
                </div>
              )}

              {/* 品項明細 table（對齊申請段渲染）*/}
              {hasSettleItems && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>🛒 品項明細</div>
                  <div style={{ border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--bg)' }}>
                        <tr>
                          <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: 600 }}>品名</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--t3)', fontWeight: 600 }}>數量</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--t3)', fontWeight: 600 }}>單價</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--t3)', fontWeight: 600 }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settleItems.map((li, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border2)' }}>
                            <td style={{ padding: '4px 6px' }}>{li.name}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }}>{li.qty}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtCurrency(li.unit_price, er.currency)}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmtCurrency(li.subtotal, er.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <ExpenseAttachments requestId={er.id} />
              </div>
            </div>
            )
          })()}

          {tab === 'progress' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <ChainTimeline
                steps={chainSteps}
                loading={chainLoading}
                requestType="expense_settle"
                requestId={er.id}
              />
            </div>
          )}
        </div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button disabled={processing === er.id} onClick={() => handle('expense_settle', er.id, 'approve')} style={{
            flex: 3, padding: '10px', borderRadius: 10, border: 'none',
            background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: processing === er.id ? 0.5 : 1,
          }}><Check size={16} /> 核准核銷</button>
          <button disabled={processing === er.id} onClick={() => handle('expense_settle', er.id, 'reject')} style={{
            flex: 1, padding: '10px', borderRadius: 10,
            border: '1.5px solid var(--red)', background: 'transparent',
            color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}><X size={16} /> 退回</button>
        </div>
      )}
    </div>
  )
}

// 小 helper：key/value row
function KvRow({ k, v, highlight }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px dashed var(--border2)' }}>
      <span style={{ color: 'var(--t3)', minWidth: 70, flexShrink: 0 }}>{k}</span>
      <span style={{
        color: highlight ? 'var(--cyan)' : 'var(--t1)',
        fontWeight: highlight ? 700 : 400,
        wordBreak: 'break-all', whiteSpace: 'pre-wrap',
      }}>{v}</span>
    </div>
  )
}

function SwapRow({ swap, role, processing, statusBadge, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const isPeer = role === 'peer'
  const detailFields = [
    ['日期', swap.swap_date],
    ['門市', swap.store || '—'],
    ['申請人', `${swap.requester} (原班 ${swap.requester_shift || '—'})`],
    ['對象', `${swap.target} (原班 ${swap.target_shift || '—'})`],
    ['理由', swap.reason || '—'],
    ['提交時間', swap.created_at?.replace('T', ' ').slice(0, 16) || '—'],
  ]
  if (swap.peer_response) detailFields.push(['對方回覆', `${swap.peer_response}${swap.peer_reject_reason ? ` (${swap.peer_reject_reason})` : ''}`])

  return (
    <div className="list-item">
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 15, fontWeight: 800 }}>{swap.requester} ↔ {swap.target}</span>
          </div>
          <span className={`badge ${statusBadge(swap.status)}`}>{swap.status}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
          <span className="badge badge-purple" style={{ marginRight: 6 }}>{swap.swap_date}</span>
          <span style={{ fontFamily: 'monospace' }}>{swap.requester_shift} ↔ {swap.target_shift}</span>
        </div>
        {swap.store && <div style={{ fontSize: 12, color: 'var(--t3)' }}>🏪 {swap.store}</div>}
        {swap.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{swap.reason}</div>}
        {!isPeer && swap.peer_response && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 6, fontWeight: 600 }}>
            ✓ 對方已同意 {swap.peer_responded_at?.slice(11, 16)}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card)', border: '1px solid var(--border2)',
        }}>
          {detailFields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border2)' }}>
              <span style={{ color: 'var(--t3)', minWidth: 70, flexShrink: 0 }}>{k}</span>
              <span style={{ color: 'var(--t1)', wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button disabled={processing === swap.id} onClick={onApprove} style={{
          flex: 3, padding: '10px', borderRadius: 10, border: 'none',
          background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          opacity: processing === swap.id ? 0.5 : 1,
        }}><Check size={16} /> {isPeer ? '同意' : '核准'}</button>
        <button disabled={processing === swap.id} onClick={onReject} style={{
          flex: 1, padding: '10px', borderRadius: 10,
          border: '1.5px solid var(--red)', background: 'transparent',
          color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}><X size={16} /> {isPeer ? '拒絕' : '駁回'}</button>
      </div>
    </div>
  )
}

function ExpenseAttachments({ requestId }) {
  const { lineProfile } = useAuth()
  const [atts, setAtts] = useState(null) // null=loading, []=loaded

  useEffect(() => {
    if (!lineProfile?.lineUserId || !requestId) return
    supabase.rpc('liff_list_expense_request_attachments', {
      p_line_user_id: lineProfile.lineUserId,
      p_request_id: requestId,
    }).then(({ data, error }) => {
      if (error) { console.warn('load attachments failed', error); setAtts([]); return }
      setAtts(Array.isArray(data) ? data : [])
    })
  }, [lineProfile?.lineUserId, requestId])

  const viewFile = (att) => {
    const { data } = supabase.storage.from('attachments').getPublicUrl(att.storage_path)
    const url = data?.publicUrl
    if (!url) { alert('無法取得檔案網址'); return }
    if (typeof liff?.isInClient === 'function' && liff.isInClient()) {
      liff.openWindow({ url, external: true })
    } else {
      window.open(url, '_blank')
    }
  }

  if (atts === null) {
    return (
      <div style={{
        marginTop: 8, padding: '8px 12px', borderRadius: 8,
        background: 'var(--card)', border: '1px solid var(--border2)',
        fontSize: 12, color: 'var(--t3)', textAlign: 'center',
      }}>讀取附件中...</div>
    )
  }
  if (atts.length === 0) return null

  return (
    <div style={{
      marginTop: 8, padding: '10px 12px', borderRadius: 8,
      background: 'var(--card)', border: '1px solid var(--border2)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>
        📎 附件（{atts.length}）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {atts.map(att => {
          const isImage = att.file_type?.startsWith('image')
          // 縮圖用 Supabase Image Transform（120×120 @ quality 60）避免下載原始大圖
          const thumbUrl = isImage
            ? supabase.storage.from('attachments').getPublicUrl(att.storage_path, {
                transform: { width: 120, height: 120, resize: 'cover', quality: 60 },
              })?.data?.publicUrl
            : null
          // 點開才下載原圖
          const url = supabase.storage.from('attachments').getPublicUrl(att.storage_path)?.data?.publicUrl
          return (
            <div key={att.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
              borderRadius: 6, background: 'var(--card-2, transparent)',
              cursor: 'pointer',
            }} onClick={() => viewFile(att)}>
              {isImage && thumbUrl ? (
                <img src={thumbUrl} alt="" loading="lazy" style={{
                  width: 44, height: 44, borderRadius: 6, objectFit: 'cover',
                  border: '1px solid var(--border2)', flexShrink: 0,
                }} />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: 6,
                  background: 'var(--orange-dim)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileText size={20} color="var(--orange)" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {att.file_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                  {att.stage === 'settlement' ? '核銷' : '申請'}
                  {att.file_size && ` · ${Math.round(att.file_size / 1024)} KB`}
                </div>
              </div>
              <Eye size={16} color="var(--cyan)" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// 加簽支援的 type → source_table 對照（HR 5 + HR 異動 3）
const TYPE_TO_SOURCE_TABLE = {
  leave: 'leave_requests',
  overtime: 'overtime_requests',
  trip: 'business_trips',
  correction: 'clock_corrections',
  expense: 'expenses',
  resignation: 'resignation_requests',
  loa: 'leave_of_absence_requests',
  transfer: 'personnel_transfer_requests',
}

// my_approver_role → 中文顯示
const ROLE_LABEL = {
  fixed_emp:                    '指定審核人',
  applicant_dept_manager:       '部門主管',
  applicant_store_manager:      '門市主管',
  applicant_supervisor:         '直屬主管',
  applicant_section_supervisor: '區域督導',
  specific_dept_manager:        '指定部門主管',
  specific_store_manager:       '指定門市主管',
  specific_section_supervisor:  '指定區域督導',
  fixed_role:                   '指定角色',
  fixed_dept:                   '部門審核',
  extra_signer:                 '加簽審核人',
  direct_manager:               '直屬主管',
}

function ApproverRoleBadge({ role, stepLabel, isSelf }) {
  if (!role && !stepLabel && !isSelf) return null
  const isExtra = role === 'extra_signer'
  const label = ROLE_LABEL[role] || role
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      {label && (
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: isExtra ? 'var(--orange-dim)' : 'var(--cyan-dim)',
          color: isExtra ? 'var(--orange)' : 'var(--cyan)',
        }}>
          以 {label} 身分審核
        </span>
      )}
      {isSelf && (
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: 'var(--purple-dim, rgba(167,139,250,0.15))',
          color: 'var(--purple, #a78bfa)',
        }}>
          ⚠ 自審
        </span>
      )}
      {stepLabel && (
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{stepLabel}</span>
      )}
    </div>
  )
}

// 當天出勤面板格式化（忘打卡/加班/請假 審核用）
const ATT_TYPES = ['leave', 'overtime', 'correction']
const _hhmm = (v) => { if (!v) return null; const m = String(v).match(/(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : String(v) }
function fmtSched(s) {
  if (!s) return '當天無排班'
  const seg = (a, b) => (a || b) ? `${_hhmm(a) || '?'}–${_hhmm(b) || '?'}` : ''
  let t = s.shift || ''
  const s1 = seg(s.actual_start, s.actual_end); if (s1) t += (t ? ' ' : '') + s1
  const s2 = seg(s.actual_start_2, s.actual_end_2); if (s2) t += ` + ${s2}`
  if (s.rest_minutes) t += `（休 ${s.rest_minutes} 分）`
  if (s.absence_type) t += ` · ${s.absence_type}`
  return t || '—'
}
function fmtClock(c) {
  if (!c) return '當天無打卡'
  let t = `${_hhmm(c.clock_in) || '—'} 上 / ${_hhmm(c.clock_out) || '—'} 下`
  if (c.is_late && c.late_minutes) t += ` · 遲到 ${c.late_minutes} 分`
  if (c.clock_in_mode === 'outing') t += ' · 外出'
  if (c.total_hours) t += ` · ${c.total_hours}h`
  return t
}
// 加班警示:單日加班上限 = 12h − 當天排定淨工時(排10h→2h;無排班以8h計→4h)。時數皆扣休息(rest_minutes 優先,否則≥9h→60、≥5h→30)。
function otCapWarn(type, item, dayAtt) {
  if (type !== 'overtime' || !dayAtt) return null
  const toMin = t => { if (!t) return null; const m = String(t).match(/(\d{2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null }
  const brkOf = m => (m >= 540 ? 60 : m >= 300 ? 30 : 0)
  const otH = Number(item.ot_hours ?? item.hours ?? 0)
  if (!otH) return null
  const s = dayAtt.schedule
  let schedH = 8, hasSched = false
  if (s && s.actual_start && s.actual_end) {
    hasSched = true
    let ss = toMin(s.actual_start), se = toMin(s.actual_end); if (se <= ss) se += 1440
    let seg = se - ss
    if (s.actual_start_2 && s.actual_end_2) { let a = toMin(s.actual_start_2), b = toMin(s.actual_end_2); if (b <= a) b += 1440; seg += b - a }
    const brk = s.rest_minutes != null ? s.rest_minutes : brkOf(seg)
    schedH = Math.max(0, seg - brk) / 60
  }
  const cap = Math.max(0, 12 - schedH)
  if (otH <= cap + 0.01) return null
  const fmtH = h => (Number.isInteger(h) ? String(h) : h.toFixed(1))
  return hasSched
    ? `當天排定 ${fmtH(schedH)} 小時 → 單日加班上限約 ${fmtH(cap)} 小時,本次 ${fmtH(otH)} 小時已超過(單日總工時逾 12 小時)`
    : `當天無排班(以標準 8 小時計)→ 單日加班上限約 4 小時,本次 ${fmtH(otH)} 小時已超過(單日總工時逾 12 小時)`
}

function Row({ item, type, processing, handle, statusBadge, body, approveLabel = '核准', extraExpanded = null }) {
  const { employee: me, lineProfile } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const isPending = item.status === '待審核' || item.status === '申請中'
  const sourceTable = TYPE_TO_SOURCE_TABLE[type] || null

  // 加簽 state（P3-extend）
  const [pendingExtra, setPendingExtra] = useState(null)
  const [extraEmployees, setExtraEmployees] = useState([])
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [extraAssignee, setExtraAssignee] = useState('')
  const [extraReason, setExtraReason] = useState('')
  const [extraBusy, setExtraBusy] = useState(false)
  const [extraErr, setExtraErr] = useState(null)

  // ⚠️ 不綁 expanded：加簽表單在 isPending 就會出現、不需展開卡片（見 ExpenseRequestRow 註解）
  useEffect(() => {
    if (!isPending || !sourceTable || !lineProfile?.lineUserId) return
    let cancelled = false
    ;(async () => {
      const { data: extra } = await supabase.rpc('liff_get_pending_extra_step', {
        p_line_user_id: lineProfile?.lineUserId,
        p_source_table: sourceTable,
        p_source_id: item.id,
      })
      if (!cancelled) setPendingExtra(extra || null)

      if (extraEmployees.length === 0) {
        // anon 直查 employees 會被 RLS 擋成空 → 走 SECURITY DEFINER RPC（與 ExpenseRequestRow 一致）
        const { data: emps, error: empErr } = await supabase.rpc('liff_list_employees_in_org', {
          p_line_user_id: lineProfile?.lineUserId,
        })
        if (!cancelled) {
          setExtraErr(empErr ? `${empErr.code || ''} ${empErr.message || ''}` : null)
          setExtraEmployees(Array.isArray(emps) ? emps : [])
        }
      }
    })()
    return () => { cancelled = true }
  }, [isPending, sourceTable, item.id, extraEmployees.length, lineProfile?.lineUserId])

  // 當天出勤（忘打卡/加班/請假）：展開時抓申請人當天班表 vs 打卡
  const [dayAtt, setDayAtt] = useState(null)
  useEffect(() => {
    if (!expanded || !ATT_TYPES.includes(type) || !sourceTable) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('liff_get_applicant_day_attendance', {
        p_line_user_id: lineProfile?.lineUserId,
        p_source_table: sourceTable,
        p_source_id: item.id,
      })
      if (!cancelled) setDayAtt(data?.ok ? data : null)
    })()
    return () => { cancelled = true }
  }, [expanded, type, sourceTable, item.id, lineProfile?.lineUserId])

  const isMyExtraRequest = pendingExtra && me && pendingExtra.requested_by_id === me.id
  const isMyExtraAssignment = pendingExtra && me && pendingExtra.assignee_id === me.id

  const submitExtra = async () => {
    if (!extraAssignee) { alert('請選擇加簽人'); return }
    setExtraBusy(true)
    const { error } = await supabase.rpc('request_extra_signer', {
      p_source_table: sourceTable,
      p_source_id: item.id,
      p_insert_before_step: item.current_step ?? 0,
      p_assignee_id: Number(extraAssignee),
      p_requested_by_id: me?.id,
      p_reason: extraReason?.trim() || null,
    })
    setExtraBusy(false)
    if (error) { alert(`加簽失敗：${error.message}`); return }
    setShowExtraForm(false); setExtraAssignee(''); setExtraReason('')
    const { data: extra } = await supabase.rpc('liff_get_pending_extra_step', {
      p_line_user_id: lineProfile?.lineUserId,
      p_source_table: sourceTable, p_source_id: item.id,
    })
    setPendingExtra(extra || null)
  }

  const cancelMyExtra = async () => {
    if (!pendingExtra || !confirm('確定撤銷加簽？')) return
    setExtraBusy(true)
    const { error } = await supabase.rpc('cancel_extra_signer', {
      p_extra_step_id: pendingExtra.id, p_canceller_id: me?.id,
    })
    setExtraBusy(false)
    if (error) { alert(`撤銷失敗：${error.message}`); return }
    setPendingExtra(null)
  }

  const processExtra = async (action) => {
    if (!pendingExtra) return
    let reason = null
    if (action === 'reject') {
      reason = prompt('退回加簽原因（必填）：')
      if (!reason || !reason.trim()) { alert('必須填寫退回原因'); return }
    }
    setExtraBusy(true)
    const { error } = await supabase.rpc('process_extra_signer', {
      p_extra_step_id: pendingExtra.id,
      p_processor_id: me?.id,
      p_action: action,
      p_reject_reason: reason?.trim() || null,
    })
    setExtraBusy(false)
    if (error) { alert(`${action === 'approve' ? '核准' : '退回'}失敗：${error.message}`); return }
    setPendingExtra(null)
    if (action === 'reject') alert('已退回加簽，整單會自動退回')
  }

  // 動態欄位：展開時顯示
  const detailFields = []
  if (item.created_at)   detailFields.push(['提交時間', item.created_at.replace('T', ' ').slice(0, 16)])
  if (item.department)   detailFields.push(['部門', item.department])
  if (item.store)        detailFields.push(['門市', item.store])
  if (item.start_date)   detailFields.push(['起始日', item.start_date])
  if (item.end_date && item.end_date !== item.start_date) detailFields.push(['結束日', item.end_date])
  if (item.date)         detailFields.push(['日期', item.date])
  if (item.hours)        detailFields.push(['時數', `${item.hours} 小時`])
  if (item.days)         detailFields.push(['天數', `${item.days} 天`])
  if (item.type)         detailFields.push(['類型', item.type])
  if (item.destination)  detailFields.push(['出差地', item.destination])
  if (item.budget)       detailFields.push(['預算', fmtCurrency(item.budget, item.currency)])
  if (item.amount)       detailFields.push(['金額', fmtCurrency(item.amount, item.currency)])
  if (item.estimated_amount) detailFields.push(['預估金額', fmtCurrency(item.estimated_amount, item.currency)])
  if (item.account_code) detailFields.push(['會計科目', `${item.account_code} ${item.account_name || ''}`])
  if (item.category)     detailFields.push(['會計科目', item.category])
  if (item.correction_time) detailFields.push(['補卡時間', item.correction_time])
  if (item.purpose)      detailFields.push(['出差目的', item.purpose])
  if (item.reason)       detailFields.push(['原因', item.reason])
  if (item.description)  detailFields.push(['說明', item.description])
  if (item.chain_name)   detailFields.push(['簽核鏈', `${item.chain_name} (第 ${(item.current_step ?? 0) + 1}/${item.chain_total_steps_snap ?? item.chain_total_steps} 關)`])

  return (
    <div className="list-item" style={{
      borderLeft: item.status === '已退回' ? '3px solid var(--red)' : undefined,
    }}>
      <ApproverRoleBadge role={item.my_approver_role} stepLabel={item.my_step_label} isSelf={item.is_self_approve} />
      {/* Header (clickable to expand) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 15, fontWeight: 800 }}>{item.employee}</span>
            {(item.store || item.department) && (
              <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500 }}>
                · {item.store || item.department}
              </span>
            )}
          </div>
          <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
        </div>
        {body}
      </div>

      {/* 退回原因（明顯） */}
      {item.reject_reason && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.12)', border: '1px solid var(--red)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>
            🔄 退回原因
          </div>
          <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap' }}>
            {item.reject_reason}
          </div>
        </div>
      )}

      {/* 當天出勤（忘打卡/加班/請假 審核用）*/}
      {expanded && ATT_TYPES.includes(type) && dayAtt && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card)', border: '1px solid var(--border2)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>📅 當天出勤（{dayAtt.date}）</div>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border2)' }}>
            <span style={{ color: 'var(--t3)', minWidth: 40 }}>班表</span>
            <span style={{ fontWeight: 600 }}>{fmtSched(dayAtt.schedule)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0' }}>
            <span style={{ color: 'var(--t3)', minWidth: 40 }}>打卡</span>
            <span style={{ fontWeight: 600, color: dayAtt.clock ? 'var(--t1)' : 'var(--t3)' }}>{fmtClock(dayAtt.clock)}</span>
          </div>
          {(() => { const wc = otCapWarn(type, item, dayAtt); return wc ? (
            <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', color: 'var(--red, #ef4444)', fontSize: 11, fontWeight: 600 }}>⚠️ {wc}</div>
          ) : null })()}
        </div>
      )}

      {/* 展開詳細 */}
      {expanded && detailFields.length > 0 && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card)', border: '1px solid var(--border2)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>📄 完整資訊</div>
          {detailFields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border2)' }}>
              <span style={{ color: 'var(--t3)', minWidth: 70, flexShrink: 0 }}>{k}</span>
              <span style={{ color: 'var(--t1)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* 額外擴充內容 (例如附件預覽) */}
      {expanded && extraExpanded}

      {isPending && (() => {
        // 我是加簽人 → 處理加簽
        if (isMyExtraAssignment) {
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{
                padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                background: 'rgba(249,115,22,0.12)', color: 'var(--orange, #f97316)',
                fontSize: 13, fontWeight: 700,
              }}>
                🪶 加簽待你處理
                {pendingExtra?.reason && <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4, color: 'var(--t1)' }}>原因：{pendingExtra.reason}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={extraBusy} onClick={() => processExtra('approve')} style={{
                  flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: extraBusy ? 0.5 : 1,
                }}><Check size={16} /> 核准加簽</button>
                <button disabled={extraBusy} onClick={() => processExtra('reject')} style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1.5px solid var(--red)', background: 'transparent',
                  color: 'var(--red)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><X size={16} /> 退回</button>
              </div>
            </div>
          )
        }
        // 有 pending 加簽且不是我 → 加簽中（發起人可撤銷）
        if (pendingExtra) {
          const assigneeName = extraEmployees.find(e => e.id === pendingExtra.assignee_id)?.name || '加簽人'
          return (
            <div style={{
              marginTop: 10, padding: '10px', borderRadius: 10,
              background: 'rgba(249,115,22,0.12)', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange, #f97316)' }}>
                🪶 加簽中：{assigneeName}
              </span>
              {isMyExtraRequest && (
                <button disabled={extraBusy} onClick={cancelMyExtra} style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1.5px solid var(--orange, #f97316)', background: 'transparent',
                  color: 'var(--orange, #f97316)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  opacity: extraBusy ? 0.5 : 1,
                }}>撤銷加簽</button>
              )}
            </div>
          )
        }
        // 正常 — 三鈕
        return (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button disabled={processing === item.id} onClick={() => handle(type, item.id, 'approve')} style={{
                flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: processing === item.id ? 0.5 : 1,
              }}><Check size={16} /> {approveLabel}</button>
              <button disabled={processing === item.id} onClick={() => handle(type, item.id, 'reject')} style={{
                flex: 1, padding: '10px', borderRadius: 10,
                border: '1.5px solid var(--red)', background: 'transparent',
                color: 'var(--red)', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}><X size={16} /> 退回</button>
            </div>
            {sourceTable && (
              <button onClick={() => setShowExtraForm(s => !s)} style={{
                width: '100%', marginTop: 6, padding: '8px', borderRadius: 8,
                border: '1.5px dashed var(--orange, #f97316)', background: 'transparent',
                color: 'var(--orange, #f97316)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>🪶 加簽（邀請第三人協助審核）</button>
            )}
          </>
        )
      })()}

      {isPending && showExtraForm && !pendingExtra && sourceTable && (
        <div style={{
          marginTop: 10, padding: 12, borderRadius: 10,
          background: 'rgba(249,115,22,0.06)', border: '1.5px solid var(--orange, #f97316)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--orange, #f97316)' }}>🪶 發起加簽</div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>加簽人 *</label>
          <EmployeePicker
            value={extraAssignee}
            onChange={setExtraAssignee}
            options={extraEmployees.filter(e => e.id !== me?.id && e.id !== item.employee_id)}
            placeholder="— 請選擇加簽人 —"
          />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>加簽原因（選填）</label>
          <textarea value={extraReason} onChange={e => setExtraReason(e.target.value)}
            placeholder="例：金額較高，請會計師先看"
            rows={2}
            style={{
              width: '100%', padding: '8px', borderRadius: 6, marginBottom: 10,
              border: '1px solid var(--border2)', background: 'var(--card)',
              fontSize: 13, color: 'var(--t1)', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowExtraForm(false); setExtraAssignee(''); setExtraReason('') }}
              style={{
                flex: 1, padding: '8px', borderRadius: 8,
                border: '1px solid var(--border2)', background: 'transparent',
                color: 'var(--t3)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>取消</button>
            <button disabled={extraBusy || !extraAssignee} onClick={submitExtra} style={{
              flex: 2, padding: '8px', borderRadius: 8, border: 'none',
              background: 'var(--orange, #f97316)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              opacity: (extraBusy || !extraAssignee) ? 0.5 : 1,
            }}>{extraBusy ? '送出中…' : '送出加簽請求'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 自訂選人下拉（避開 iOS native picker 怪 UI + 加搜尋功能） ───
function EmployeePicker({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find(o => String(o.id) === String(value))
  const filtered = options.filter(o => !search || (o.name || '').includes(search))

  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <div onClick={() => setOpen(s => !s)} style={{
        width: '100%', padding: '10px 12px',
        borderRadius: 6, border: '1px solid var(--border2)',
        background: 'var(--card)', fontSize: 13,
        cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: selected ? 'var(--t1)' : 'var(--t3)',
      }}>
        <span>{selected ? selected.name : placeholder}</span>
        <span style={{ color: 'var(--t3)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 99, background: 'transparent',
          }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            marginTop: 4, background: 'var(--card)',
            border: '1px solid var(--border2)', borderRadius: 6,
            maxHeight: 260, overflowY: 'auto', zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 搜尋姓名…"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px',
                border: 'none', borderBottom: '1px solid var(--border2)',
                background: 'var(--card)',
                fontSize: 13, color: 'var(--t1)',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {filtered.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>
                沒有符合的同事
              </div>
            ) : (
              filtered.map(o => (
                <div key={o.id}
                  onClick={() => { onChange(String(o.id)); setOpen(false); setSearch('') }}
                  style={{
                    padding: '10px 14px', fontSize: 13,
                    cursor: 'pointer',
                    background: String(value) === String(o.id) ? 'rgba(34,211,238,0.1)' : 'transparent',
                    color: 'var(--t1)',
                    borderBottom: '1px solid var(--border2)',
                  }}>
                  {String(value) === String(o.id) && '✓ '}{o.name}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// 已簽核 view — 從 liff_list_my_signed_approvals RPC 拉
// ════════════════════════════════════════════════════════════════════════════
const SIGNED_TYPE_LABEL = {
  leave: '請假', overtime: '加班', trip: '出差', correction: '補打卡',
  expense: '報帳', expense_request: '非經常性費用申請',
  resignation: '離職', loa: '留停', transfer: '異動', headcount: '人力需求',
}

function SignedApprovalsView() {
  const { lineProfile } = useAuth()
  const today = new Date()
  const [yearMonth, setYearMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    supabase.rpc('liff_list_my_signed_approvals', {
      p_line_user_id: lineProfile.lineUserId,
      p_year_month: yearMonth,
    }).then(({ data }) => {
      if (data?.error) { console.warn('liff_list_my_signed_approvals:', data.error); setList([]) }
      else setList(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [lineProfile?.lineUserId, yearMonth])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>{yearMonth} 已簽核 · {list.length} 件</div>
        <input className="form-input" type="month" value={yearMonth}
          onChange={e => setYearMonth(e.target.value)}
          style={{ width: 140, fontSize: 13 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>載入中...</div>
      ) : list.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
          這個月還沒簽過任何單
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((row, i) => {
            const isApproved = row.my_action === 'approved'
            const typeLabel = SIGNED_TYPE_LABEL[row.source_type] || row.source_type
            return (
              <div key={`${row.source_type}-${row.source_id}-${i}`} style={{
                padding: 10, borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${row.is_extra ? 'badge-orange' : 'badge-purple'}`} style={{ fontSize: 10 }}>
                    {row.is_extra ? '🪶 加簽' : typeLabel}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: isApproved ? 'var(--green)' : 'var(--red)',
                    marginLeft: 'auto',
                  }}>{isApproved ? '✓ 核准' : '✗ 退回'}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>
                  {row.applicant_name || '—'} · {row.summary || `#${row.source_id}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  {row.step_label || ''} · {row.signed_at ? new Date(row.signed_at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  整單狀態：{row.current_status || '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Outer wrapper — 切換「待簽核 / 已簽核」最外層 tab
// ════════════════════════════════════════════════════════════════════════════
export default function Approve() {
  const navigate = useNavigate()
  const [outerTab, setOuterTab] = useState('pending')

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 簽核中心</div>
      </div>

      {/* 外層 tab bar */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 12,
        borderBottom: '2px solid var(--border)',
      }}>
        {[
          { key: 'pending', label: '待簽核', icon: Inbox },
          { key: 'signed',  label: '已簽核', icon: FileCheck },
        ].map(t => {
          const Icon = t.icon
          const isActive = outerTab === t.key
          return (
            <button key={t.key} onClick={() => setOuterTab(t.key)} style={{
              flex: 1, padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: isActive ? 'var(--cyan)' : 'var(--t3)',
              borderBottom: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
              marginBottom: -2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {outerTab === 'pending' ? <PendingApprovalsView /> : <SignedApprovalsView />}
    </div>
  )
}
