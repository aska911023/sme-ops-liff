import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Check, X, Lock, Users, Wallet, ChevronDown, ChevronRight, Calendar, FileText, Eye, ClipboardCheck } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import TaskConfirmationList from '../components/TaskConfirmationList'
import ChainTimeline from '../components/ChainTimeline'
// notifyApprovalEvent 已拔除 — leave/overtime/trip/expense/expense_request/correction 簽核 LINE 統一走主系統 DB trigger
// (sme-ops-system: 20260508110000 expense_request + 20260508130000 hr_a_chain)
// notifyShiftSwapEvent/notifyOffRequestEvent 暫時保留（off_request / shift_swap 還沒做 trigger）
import { notifyShiftSwapEvent, notifyOffRequestEvent } from '../lib/approvalNotify'

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
      { key: 'expense',         label: '報帳', pendingStatus: '待審核' },
      { key: 'expense_request', label: '申請', pendingStatus: '申請中' },
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
}

export default function Approve() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  // URL 用短英文 slug，內部還是用原本 key（往下相容）
  // /approve            → 預設
  // /approve/leave      → 人事/請假
  // /approve/off        → 排班/希望休
  // /approve/task       → 任務/任務確認
  const TAB_TO_SLUG = {
    leave: 'leave', overtime: 'overtime', trip: 'trip', correction: 'correction',
    expense: 'expense', expense_request: 'expense-request',
    off_request: 'off', shift_swap_peer: 'swap-peer', shift_swap_manager: 'swap-manager',
    task_confirmation: 'task',
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
    shift_swaps_for_peer: [], shift_swaps_for_manager: [], off_requests: [],
    task_confirmations: [],
    can: { hr: false, finance: false },
  })
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  // ★ 只在首次載入時自動切 group（避免 user 切到沒待辦的 group 立刻被踢回去 → 「跳一下跳一下」）
  const [autoSwitched, setAutoSwitched] = useState(false)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const [{ data: rpc, error }, { data: taskConfs }] = await Promise.all([
      supabase.rpc('liff_list_pending_approvals', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_task_confirmations', { p_line_user_id: lineProfile.lineUserId }),
    ])
    if (error) { console.error('load approvals', error); setLoading(false); return }
    setData({
      leaves:                  rpc?.leaves                  || [],
      overtimes:               rpc?.overtimes               || [],
      trips:                   rpc?.trips                   || [],
      expenses:                rpc?.expenses                || [],
      corrections:             rpc?.corrections             || [],
      expense_requests:        rpc?.expense_requests        || [],
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
              expense: 'expenses', expense_request: 'expense_requests',
              shift_swap_peer: 'shift_swaps_for_peer', shift_swap_manager: 'shift_swaps_for_manager',
              off_request: 'off_requests',
              task_confirmation: 'task_confirmations' })[k] || k
  }

  const handle = async (type, id, action) => {
    let reason = null
    if (action === 'reject') {
      reason = prompt('退回原因（申請人會看到，並可改後重送）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫退回原因'); return }
    }
    setProcessing(id)
    const { data: result, error } = await supabase.rpc('liff_approve_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: type, p_id: id, p_action: action, p_reason: reason,
    })
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
    shift_swap_peer:     data.shift_swaps_for_peer.length,
    shift_swap_manager:  data.shift_swaps_for_manager.length,
    off_request:         data.off_requests.length,
    task_confirmation:   data.task_confirmations.length,
  }
  const groupCounts = {
    hr:       GROUPS.hr.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    finance:  GROUPS.finance.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    schedule: GROUPS.schedule.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    task:     GROUPS.task.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
  }
  const totalPending = groupCounts.hr + groupCounts.finance + groupCounts.schedule + groupCounts.task

  const statusBadge = (s) => s === '已核准' || s === '已核銷' ? 'badge-green' : s === '已退回' || s === '已駁回' || s === '已拒絕' ? 'badge-red' : 'badge-orange'
  // 排班 / 任務：只要有 pending 就視為 enabled（任何員工都可能收到）
  const groupEnabled = {
    hr:       data.can.hr,
    finance:  data.can.finance,
    schedule: groupCounts.schedule > 0 || true,  // 一律允許進入排班 group
    task:     true,                              // 任何員工都可能收到「任務確認」
  }
  const tabEnabled = (k) =>
    ['leave','overtime','trip','correction'].includes(k) ? data.can.hr :
    ['expense','expense_request'].includes(k) ? data.can.finance :
    ['shift_swap_peer','shift_swap_manager','off_request'].includes(k) ? true :
    ['task_confirmation'].includes(k) ? true : false

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 簽核中心</div>
        {totalPending > 0 && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
          }}>{totalPending} 件待審</span>
        )}
      </div>

      {/* ── Group toggle (人事 / 經費) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Object.entries(GROUPS).map(([key, g]) => {
          const Icon = g.icon
          const active = group === key
          const enabled = groupEnabled[key]
          const count = groupCounts[key]
          return (
            <button key={key} onClick={() => changeGroup(key)} style={{
              flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: `2px solid ${active ? `var(--${g.color})` : 'var(--border2)'}`,
              background: active ? `var(--${g.color}-dim)` : 'var(--card)',
              color: active ? `var(--${g.color})` : enabled ? 'var(--t1)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: enabled ? 1 : 0.55,
            }}>
              {!enabled && <Lock size={12} />}
              <Icon size={16} /> {g.label}
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
    </div>
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
        {/* 1. headline + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <span className="badge badge-purple" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>希望休</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{o.date}</span>
          </div>
          <span className={`badge ${statusBadge(o.status)}`} style={{ flexShrink: 0 }}>{o.status}</span>
        </div>
        {/* 2. 申請人 + 門市 */}
        <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--t3)' }}>
          <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{o.employee}</span>
          {o.store && <span> · {o.store}</span>}
        </div>
        {/* 3. body */}
        {o.reason && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{o.reason}</div>}
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
        headline={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-cyan" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>{l.type}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            {l.start_date}{l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
          </span>
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>
            · {l.hours && l.hours < 8 ? `${l.hours}h` : `${l.days}天`}
          </span>
        </div>}
        body={l.reason && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{l.reason}</div>}
      />
    ))
  }
  if (tab === 'overtime') {
    if (data.overtimes.length === 0) return empty('沒有等你審的加班單')
    return data.overtimes.map(o => (
      <Row key={o.id} item={o} type="overtime" processing={processing} handle={handle} statusBadge={statusBadge}
        headline={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-orange" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>加班</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{o.date}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>· {o.hours} h</span>
        </div>}
        body={o.reason && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{o.reason}</div>}
      />
    ))
  }
  if (tab === 'trip') {
    if (data.trips.length === 0) return empty('沒有等你審的出差單')
    return data.trips.map(t => (
      <Row key={t.id} item={t} type="trip" processing={processing} handle={handle} statusBadge={statusBadge}
        headline={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-blue" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>出差</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{t.destination}</span>
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>· {t.start_date} ~ {t.end_date}</span>
        </div>}
        body={<>
          {t.purpose && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{t.purpose}</div>}
          {t.budget > 0 && <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginTop: 4 }}>預算：NT$ {Number(t.budget).toLocaleString()}</div>}
        </>}
      />
    ))
  }
  if (tab === 'correction') {
    if (data.corrections.length === 0) return empty('沒有等你審的補打卡單')
    return data.corrections.map(c => (
      <Row key={c.id} item={c} type="correction" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核准並修正"
        headline={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-purple" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>
            {c.type === 'clock_in' || c.type === '上班打卡' ? '上班補登' :
             c.type === 'clock_out' || c.type === '下班打卡' ? '下班補登' : (c.type || '補打卡')}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{c.date}</span>
          {c.correction_time && <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>· {c.correction_time}</span>}
        </div>}
        body={c.reason && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{c.reason}</div>}
      />
    ))
  }
  if (tab === 'expense') {
    if (data.expenses.length === 0) return empty('沒有等你審的報帳單')
    return data.expenses.map(e => (
      <Row key={e.id} item={e} type="expense" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核銷"
        headline={<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-yellow" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>{e.category}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>NT$ {Number(e.amount).toLocaleString()}</span>
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>· {e.date}</span>
        </div>}
        body={e.description && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{e.description}</div>}
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
  return null
}

// ── 專屬 expense_request row：上方摘要 / 下方 3 TAB（基本 / 細節 / 進度） ──
function ExpenseRequestRow({ er, processing, handle, statusBadge }) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('basic')   // 'basic' | 'detail' | 'progress'
  const [chainSteps, setChainSteps] = useState(null)  // null = 未載入；array = 已載入
  const [chainLoading, setChainLoading] = useState(false)
  const isPending = er.status === '申請中'

  // 切到「進度」tab 才 lazy fetch chain steps（避免不展開的 row 也送 RPC）
  useEffect(() => {
    if (tab !== 'progress' || !expanded || chainSteps !== null) return
    setChainLoading(true)
    supabase.rpc('liff_get_expense_request_chain_status', { p_id: er.id })
      .then(({ data }) => setChainSteps(Array.isArray(data) ? data : []))
      .finally(() => setChainLoading(false))
  }, [tab, expanded, chainSteps, er.id])

  const items = Array.isArray(er.items) ? er.items : []
  const hasItems = items.length > 0
  const hasSupplier = er.supplier && er.supplier.trim()

  return (
    <div className="list-item" style={{
      borderLeft: er.status === '已退回' ? '3px solid var(--red)' : undefined,
    }}>
      {/* Header (clickable) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        {/* 1. 申請 + 標題 + 金額 + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span className="badge badge-yellow" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>費用申請</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>NT$ {Number(er.estimated_amount || 0).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{er.title}</div>
          </div>
          <span className={`badge ${statusBadge(er.status)}`} style={{ flexShrink: 0 }}>{er.status}</span>
        </div>
        {/* 2. 申請人 + 部門/門市 + 科目 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 12, color: 'var(--t3)', flexWrap: 'wrap' }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{er.employee}</span>
          {(er.store || er.department) && <span>· {er.store || er.department}</span>}
          {er.account_name && <span>· {er.account_name}</span>}
        </div>
        {/* 3. 簽核鏈進度 */}
        {er.chain_name && (
          <div style={{
            padding: '4px 8px', borderRadius: 6,
            background: 'var(--purple-dim)', color: 'var(--purple)',
            fontSize: 11, fontWeight: 600,
          }}>
            🔐 {er.chain_name} · 第 {er.current_step + 1} / {er.chain_total_steps} 關（{er.current_step_target || er.current_step_label || '—'}）
          </div>
        )}
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
              {er.store && <KvRow k="門市" v={er.store} />}
              <KvRow k="預估金額" v={`NT$ ${Number(er.estimated_amount || 0).toLocaleString()}`} highlight />
              {er.account_code && (
                <KvRow k="會計科目" v={`${er.account_code} ${er.account_name || ''}`} />
              )}
              {er.chain_name && (
                <KvRow k="簽核鏈" v={`${er.chain_name} (第 ${er.current_step + 1}/${er.chain_total_steps} 關)`} />
              )}
            </div>
          )}

          {/* TAB 2：細節與附件 */}
          {tab === 'detail' && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--card)', border: '1px solid var(--border2)',
            }}>
              <KvRow k="項目" v={er.title || '—'} />
              {hasSupplier && <KvRow k="供應商" v={er.supplier} />}
              {er.description && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>📝 說明</div>
                  <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap',
                    padding: 8, background: 'var(--bg)', borderRadius: 6 }}>{er.description}</div>
                </div>
              )}

              {/* 品項明細 table */}
              {hasItems && (
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
                              NT$ {Number(li.unit_price || 0).toLocaleString()}
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                              NT$ {Number(li.subtotal || 0).toLocaleString()}
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
              <ChainTimeline steps={chainSteps} loading={chainLoading} />
            </div>
          )}
        </div>
      )}

      {/* 核准 / 退回按鈕 */}
      {isPending && (
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
        {/* 1. 換班 + 日期 + 班別 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <span className="badge badge-purple" style={{ fontSize: 14, fontWeight: 700, padding: '4px 12px' }}>換班</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{swap.swap_date}</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--cyan)', fontWeight: 600 }}>
              · {swap.requester_shift} ↔ {swap.target_shift}
            </span>
          </div>
          <span className={`badge ${statusBadge(swap.status)}`} style={{ flexShrink: 0 }}>{swap.status}</span>
        </div>
        {/* 2. 申請人 ↔ 對方 + 門市 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 12, color: 'var(--t3)' }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{swap.requester} ↔ {swap.target}</span>
          {swap.store && <span>· {swap.store}</span>}
        </div>
        {/* 3. 理由 / 對方回覆 */}
        {swap.reason && <div style={{ fontSize: 13, color: 'var(--t2)' }}>{swap.reason}</div>}
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
    if (data?.publicUrl) window.open(data.publicUrl, '_blank')
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
          const url = supabase.storage.from('attachments').getPublicUrl(att.storage_path)?.data?.publicUrl
          return (
            <div key={att.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
              borderRadius: 6, background: 'var(--card-2, transparent)',
              cursor: 'pointer',
            }} onClick={() => viewFile(att)}>
              {isImage && url ? (
                <img src={url} alt="" style={{
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

function Row({ item, type, processing, handle, statusBadge, headline, body, approveLabel = '核准', extraExpanded = null }) {
  const [expanded, setExpanded] = useState(false)
  const isPending = item.status === '待審核' || item.status === '申請中'

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
  if (item.budget)       detailFields.push(['預算', `NT$ ${Number(item.budget).toLocaleString()}`])
  if (item.amount)       detailFields.push(['金額', `NT$ ${Number(item.amount).toLocaleString()}`])
  if (item.estimated_amount) detailFields.push(['預估金額', `NT$ ${Number(item.estimated_amount).toLocaleString()}`])
  if (item.account_code) detailFields.push(['會計科目', `${item.account_code} ${item.account_name || ''}`])
  if (item.category)     detailFields.push(['類別', item.category])
  if (item.correction_time) detailFields.push(['補卡時間', item.correction_time])
  if (item.purpose)      detailFields.push(['出差目的', item.purpose])
  if (item.reason)       detailFields.push(['原因', item.reason])
  if (item.description)  detailFields.push(['說明', item.description])
  if (item.chain_name)   detailFields.push(['簽核鏈', `${item.chain_name} (第 ${(item.current_step ?? 0) + 1}/${item.chain_total_steps} 關)`])

  return (
    <div className="list-item" style={{
      borderLeft: item.status === '已退回' ? '3px solid var(--red)' : undefined,
    }}>
      {/* Header (clickable to expand)
          視覺階層：
          1. 「事情」(假別/類型/金額) — 最大、最上面
          2. 申請人 + 門市/部門 — 灰色 sub-info
          3. body (期間/原因 等) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        {/* 1. headline + status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {headline}
          </div>
          <span className={`badge ${statusBadge(item.status)}`} style={{ flexShrink: 0 }}>{item.status}</span>
        </div>
        {/* 2. 申請人 + 門市/部門 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontSize: 12, color: 'var(--t3)' }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span style={{ fontWeight: 600, color: 'var(--t2)' }}>{item.employee}</span>
          {(item.store || item.department) && (
            <span>· {item.store || item.department}</span>
          )}
        </div>
        {/* 3. body */}
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

      {isPending && (
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
      )}
    </div>
  )
}
