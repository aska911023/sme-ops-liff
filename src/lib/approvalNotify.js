// ============================================================
// 簽核事件 → LINE 推播 (Flex Message)
//
// 全部走 Flex Bubble 卡片風格，跟主系統一致：
//   - 紫色 header (任務確認 / 簽核請求)
//   - 綠色 header (狀態變化通知)
//   - 紅色 header (退回)
//   - 卡片底部一個 CTA 按鈕跳對應 LIFF 頁
// ============================================================

import { supabase } from './supabase'

const LIFF_ID = import.meta.env.VITE_LIFF_ID
const LIFF_BASE = LIFF_ID ? `https://liff.line.me/${LIFF_ID}` : 'https://sme-ops-liff.vercel.app'

const TYPE_LABEL = {
  leave: '請假',
  overtime: '加班',
  trip: '出差',
  correction: '補打卡',
  expense: '報帳',
  expense_request: '申請',
}

// type → 簽核中心 sub-tab slug（路徑式 deep link）
const TYPE_SLUG = {
  leave: 'leave', overtime: 'overtime', trip: 'trip', correction: 'correction',
  expense: 'expense', expense_request: 'expense-request',
  shift_swap: 'swap-peer', off_request: 'off',
}
const approveLink = (type) => `/approve/${TYPE_SLUG[type] || 'leave'}`

async function getLineTarget(empId) {
  if (!empId) return { line_user_id: null, channel_code: null }
  // 走 SECURITY DEFINER RPC 繞 RLS（直查 employee_line_accounts 在 anon 下被擋會回空）
  const { data, error } = await supabase.rpc('liff_resolve_line_target', { p_emp_id: empId })
  if (error) { console.warn('liff_resolve_line_target failed', error); return { line_user_id: null, channel_code: null } }
  return {
    line_user_id: data?.line_user_id || null,
    channel_code: data?.channel_code || null,
  }
}

async function pushFlex(lineUserId, altText, bubble, channelCode) {
  if (!lineUserId) return
  try {
    await supabase.functions.invoke('line-push', {
      body: {
        to: lineUserId,
        messages: [{ type: 'flex', altText, contents: bubble }],
        channelCode,
      },
    })
  } catch (err) {
    console.warn('line-push failed', err)
  }
}

// ── Flex card builders ──────────────────────────────────────

function buildBubble({ headerColor, headerText, title, subtitle, footnote, btnLabel, btnPath, btnColor }) {
  const url = btnPath ? `${LIFF_BASE}${btnPath.startsWith('/') ? '' : '/'}${btnPath}` : LIFF_BASE
  return {
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: headerColor,
      paddingAll: '14px',
      contents: [{ type: 'text', text: headerText, color: '#ffffff', weight: 'bold', size: 'md' }],
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
        ...(subtitle ? [{ type: 'text', text: subtitle, size: 'sm', color: '#8c8c8c', wrap: true }] : []),
        ...(footnote ? [{ type: 'text', text: footnote, size: 'xs', color: '#a8a8a8', wrap: true, margin: 'sm' }] : []),
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
      contents: [{
        type: 'button',
        action: { type: 'uri', label: btnLabel, uri: url },
        style: 'primary', color: btnColor || headerColor, height: 'sm',
      }],
    },
  }
}

// ── Public APIs ─────────────────────────────────────────────

// 申請類事件（advanced/approved/rejected）
//   requestId: 帶進來讓 advanced 事件能 build rich card（RPC 回傳沒包）
export async function notifyApprovalEvent({ type, result, requestId }) {
  if (!result?.ok) return
  const typeLabel = TYPE_LABEL[type] || type
  const event = result.event

  // (1) 申請人狀態變化
  if (event === 'approved' || event === 'rejected') {
    const applicantId = result.applicant?.emp_id
    const target = await getLineTarget(applicantId)
    if (!target.line_user_id) return
    const isApproved = event === 'approved'
    const bubble = buildBubble({
      headerColor: isApproved ? '#10b981' : '#ef4444',
      headerText: isApproved ? '✅ 簽核通過' : '🔄 申請被退回',
      title: `你的「${typeLabel}」${isApproved ? '已通過' : '被退回'}`,
      subtitle: isApproved
        ? `狀態：${result.status}`
        : '可在「我的簽核進度」修改後重送',
      btnLabel: isApproved ? '查看詳情' : '修改重送',
      btnPath: '/approval-status',
      btnColor: isApproved ? '#10b981' : '#ef4444',
    })
    await pushFlex(target.line_user_id, `${typeLabel}${isApproved ? '已通過' : '被退回'}`, bubble, target.channel_code)
    return
  }

  // (2) 推進下一關 — 下關簽核者推 rich card（可直接核准/駁回）
  if (event === 'advanced' && Array.isArray(result.next_approvers)) {
    const totalAtStep = result.advanced_to_step + 1
    const applicantEmpId = result.applicant?.emp_id

    // 預先 build rich card（同一張推給所有下關簽核者）
    // requestId 由 caller 帶進來（RPC 回傳沒包）
    let richBubble = null
    if (requestId) {
      try { richBubble = await buildApprovalCardBubble(type, requestId, applicantEmpId) }
      catch (err) { console.warn('buildApprovalCardBubble (advanced) failed', err) }
    }

    const palette = REQUEST_TYPE_PALETTE[type]
    const altText = palette ? `${palette.emoji} ${palette.label} 等待你簽核 (第${totalAtStep}關)` : `${typeLabel} 簽核請求`

    for (const ap of result.next_approvers) {
      const target = await getLineTarget(ap.emp_id)
      if (!target.line_user_id) continue
      const bubble = richBubble || buildBubble({
        headerColor: '#8b5cf6',
        headerText: '📝 簽核請求',
        title: `「${typeLabel}」等待你簽核`,
        subtitle: `第 ${totalAtStep} 關 · ${result.applicant?.name || '申請人'}`,
        btnLabel: '前往審核',
        btnPath: approveLink(type),
      })
      await pushFlex(target.line_user_id, altText, bubble, target.channel_code)
    }
    // 通知申請人進度（保持簡單卡 — 申請人不用做動作，純通知）
    if (applicantEmpId) {
      const target = await getLineTarget(applicantEmpId)
      if (target.line_user_id) {
        const bubble = buildBubble({
          headerColor: '#06b6d4',
          headerText: '🔔 簽核進度更新',
          title: `「${typeLabel}」已通過第 ${result.advanced_to_step} 關`,
          subtitle: `進入第 ${totalAtStep} 關審核`,
          btnLabel: '查看進度',
          btnPath: '/approval-status',
          btnColor: '#06b6d4',
        })
        await pushFlex(target.line_user_id, `${typeLabel} 進度更新`, bubble, target.channel_code)
      }
    }
  }
}

// 執行人完成任務時，推給審批人「請審核」（任務確認專用）
export async function pushTaskApprovalRequest({ taskTitle, approvers }) {
  for (const ap of approvers || []) {
    if (!ap.line_user_id) continue
    const bubble = buildBubble({
      headerColor: '#f59e0b',
      headerText: '✔️ 任務確認',
      title: `任務「${taskTitle}」需要你確認`,
      subtitle: '執行人已標記完成，請審核',
      btnLabel: '前往確認',
      btnPath: '/task-confirmations',
      btnColor: '#f59e0b',
    })
    await pushFlex(ap.line_user_id, `任務「${taskTitle}」需要你確認`, bubble, ap.channel_code)
  }
}

// 班別交換事件通知（兩段確認流程）
//   event = 'requested'    → 推給 B（你被申請換班，等你確認）
//   event = 'peer_agreed'  → 推給店長（B 已同意，等你核准）
//   event = 'peer_rejected'→ 推給 A（B 拒絕了你的換班）
//   event = 'approved'     → 推給 A 跟 B（換班成立）
//   event = 'manager_rejected' → 推給 A 跟 B（駁回 + 理由）
export async function notifyShiftSwapEvent({ event, swap, reason }) {
  const { requester_id, target_id, requester, target, swap_date, requester_shift, target_shift, manager_emp_id } = swap || {}
  const dateLabel = swap_date || ''
  const swapLabel = `${dateLabel}（${requester || '申請人'} ${requester_shift || ''} ↔ ${target || '對方'} ${target_shift || ''}）`

  if (event === 'requested') {
    const target_emp = target_id || swap?.target_emp_id
    const tgt = await getLineTarget(target_emp)
    if (!tgt.line_user_id) return
    const bubble = buildBubble({
      headerColor: '#8b5cf6',
      headerText: '🔁 換班申請',
      title: `${requester || '同事'} 想跟你換 ${dateLabel} 班`,
      subtitle: `對方原班：${requester_shift || '—'} · 你原班：${target_shift || '—'}`,
      footnote: '請到「簽核中心 > 排班」確認',
      btnLabel: '前往確認',
      btnPath: approveLink('shift_swap'),
    })
    await pushFlex(tgt.line_user_id, '換班申請', bubble, tgt.channel_code)
    return
  }

  if (event === 'peer_agreed') {
    if (!manager_emp_id) return
    const tgt = await getLineTarget(manager_emp_id)
    if (!tgt.line_user_id) return
    const bubble = buildBubble({
      headerColor: '#8b5cf6',
      headerText: '🔁 換班待核准',
      title: `${swapLabel}`,
      subtitle: '雙方已同意，等你核准',
      btnLabel: '前往核准',
      btnPath: approveLink('shift_swap'),
    })
    await pushFlex(tgt.line_user_id, '換班待核准', bubble, tgt.channel_code)
    // 同步通知申請人「對方已同意，進入主管關」
    if (requester_id) {
      const reqTgt = await getLineTarget(requester_id)
      if (reqTgt.line_user_id) {
        const reqBubble = buildBubble({
          headerColor: '#06b6d4',
          headerText: '🔔 換班進度',
          title: `${target || '對方'} 已同意你的換班`,
          subtitle: `${swapLabel} · 等主管核准`,
          btnLabel: '查看進度',
          btnPath: '/approval-status',
          btnColor: '#06b6d4',
        })
        await pushFlex(reqTgt.line_user_id, '換班進度', reqBubble, reqTgt.channel_code)
      }
    }
    return
  }

  if (event === 'peer_rejected') {
    if (!requester_id) return
    const tgt = await getLineTarget(requester_id)
    if (!tgt.line_user_id) return
    const bubble = buildBubble({
      headerColor: '#ef4444',
      headerText: '❌ 換班被拒絕',
      title: `${target || '對方'} 拒絕了你的換班`,
      subtitle: swapLabel,
      footnote: reason ? `理由：${reason}` : null,
      btnLabel: '查看詳情',
      btnPath: '/approval-status',
      btnColor: '#ef4444',
    })
    await pushFlex(tgt.line_user_id, '換班被拒絕', bubble, tgt.channel_code)
    return
  }

  if (event === 'approved') {
    for (const empId of [requester_id, target_id]) {
      if (!empId) continue
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#10b981',
        headerText: '✅ 換班已成立',
        title: `${swapLabel} 已核准`,
        subtitle: '班表已自動更新',
        btnLabel: '查看班表',
        btnPath: '/my-schedule',
        btnColor: '#10b981',
      })
      await pushFlex(tgt.line_user_id, '換班已成立', bubble, tgt.channel_code)
    }
    return
  }

  if (event === 'manager_rejected') {
    for (const empId of [requester_id, target_id]) {
      if (!empId) continue
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#ef4444',
        headerText: '❌ 換班駁回',
        title: `${swapLabel} 被主管駁回`,
        subtitle: reason ? `理由：${reason}` : '請聯絡主管確認',
        btnLabel: '查看詳情',
        btnPath: '/approval-status',
        btnColor: '#ef4444',
      })
      await pushFlex(tgt.line_user_id, '換班駁回', bubble, tgt.channel_code)
    }
    return
  }
}

// 代班 邀請式事件通知
//   event = 'invited'   → 推給所有候選人「有代班可接」
//   event = 'claimed'   → 推給主管「X 接單了」+ 推給其他候選人「已成立」
//   event = 'cancelled' → 推給所有候選人「已取消」
export async function notifyCoverEvent({ event, payload }) {
  const { invited_emp_ids, shift_date, shift_label, absent_emp_name, requester_emp_id, claimer_name, requester_name, reason } = payload || {}

  if (event === 'invited') {
    // 用 buildApprovalCardBubble 組 rich card（type='cover'），footer 加自定 [🙋 我搶單] postback
    const requestId = payload?.request_id
    let richBubble = null
    if (requestId) {
      try { richBubble = await buildApprovalCardBubble('cover', requestId, null) } catch (err) { console.warn('rich card build failed', err) }
    }

    // 替換 footer 為 [🙋 我搶單] (postback claim:cover) + [📋 詳情→LIFF]
    if (richBubble) {
      const liffDetailUri = LIFF_ID ? `https://liff.line.me/${LIFF_ID}?to=${encodeURIComponent('/cover-invitations')}` : null
      richBubble.footer = {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'primary', color: '#f59e0b', height: 'sm',
            action: { type: 'postback', label: '🙋 我搶單', data: `action=claim&type=cover&id=${requestId}` },
          },
          ...(liffDetailUri ? [{
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'uri', label: '📋 看詳情', uri: liffDetailUri },
          }] : []),
        ],
      }
      richBubble.altText = `🆘 代班邀請：${shift_date} ${shift_label}`
    }

    for (const empId of invited_emp_ids || []) {
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = richBubble || buildBubble({
        headerColor: '#f59e0b',
        headerText: '🆘 代班邀請',
        title: `${shift_date} ${shift_label}`,
        subtitle: `代 ${absent_emp_name || '同事'} 的班`,
        footnote: '先搶先贏！到「待認領代班」確認',
        btnLabel: '我可以接',
        btnPath: '/cover-invitations',
        btnColor: '#f59e0b',
      })
      await pushFlex(tgt.line_user_id, `🆘 代班邀請 ${shift_date}`, bubble, tgt.channel_code)
    }
    return
  }

  if (event === 'claimed') {
    // 通知主管
    if (requester_emp_id) {
      const tgt = await getLineTarget(requester_emp_id)
      if (tgt.line_user_id) {
        const bubble = buildBubble({
          headerColor: '#10b981',
          headerText: '✅ 代班成立',
          title: `${claimer_name || '有人'} 接了 ${shift_date} ${shift_label}`,
          subtitle: `代 ${absent_emp_name || '同事'} 的班 · 班表已自動更新`,
          btnLabel: '查看班表',
          btnPath: '/my-schedule',
          btnColor: '#10b981',
        })
        await pushFlex(tgt.line_user_id, '代班成立', bubble, tgt.channel_code)
      }
    }
    // 通知其他候選人
    for (const empId of invited_emp_ids || []) {
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#8b8b8b',
        headerText: '— 代班已成立',
        title: `${shift_date} ${shift_label}`,
        subtitle: `${claimer_name || '其他同事'} 已接單`,
        btnLabel: '查看其他代班',
        btnPath: '/cover-invitations',
      })
      await pushFlex(tgt.line_user_id, '代班已成立', bubble, tgt.channel_code)
    }
    return
  }

  if (event === 'cancelled') {
    for (const empId of invited_emp_ids || []) {
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#8b8b8b',
        headerText: '— 代班已取消',
        title: `${shift_date} ${shift_label}`,
        subtitle: `${requester_name || '主管'} 取消了代班需求`,
        footnote: reason || null,
        btnLabel: '查看其他代班',
        btnPath: '/cover-invitations',
      })
      await pushFlex(tgt.line_user_id, '代班取消', bubble, tgt.channel_code)
    }
    return
  }
}

// 希望休 簽核事件通知
//   event = 'requested' → 推給主管「員工 X 提交希望休」
//   event = 'approved'  → 推給員工「希望休已核准」
//   event = 'rejected'  → 推給員工「希望休被駁回 + 理由」
export async function notifyOffRequestEvent({ event, applicantEmpId, applicantName, date, reason, requestId }) {
  if (event === 'requested') {
    // 找 HR-style 簽核者
    const { data } = await supabase.rpc('liff_resolve_hr_approvers', { p_applicant_emp_id: applicantEmpId })
    const approvers = data || []
    if (approvers.length === 0) return

    // build rich card（type='off_request'），含 [✅核准][❌駁回] postback
    let richBubble = null
    if (requestId) {
      try { richBubble = await buildApprovalCardBubble('off_request', requestId, applicantEmpId) }
      catch (err) { console.warn('rich card build failed', err) }
    }

    for (const ap of approvers) {
      const tgt = await getLineTarget(ap.emp_id)
      if (!tgt.line_user_id) continue
      const bubble = richBubble || buildBubble({
        headerColor: '#8b5cf6',
        headerText: '🗓️ 希望休申請',
        title: `${applicantName || '員工'} 想休 ${date}`,
        subtitle: reason || '請到「簽核中心 > 排班」核准',
        btnLabel: '前往核准',
        btnPath: approveLink('off_request'),
      })
      await pushFlex(tgt.line_user_id, `🌴 希望休申請 ${date}`, bubble, tgt.channel_code)
    }
    return
  }

  if (event === 'approved' || event === 'rejected') {
    const tgt = await getLineTarget(applicantEmpId)
    if (!tgt.line_user_id) return
    const isApproved = event === 'approved'
    const bubble = buildBubble({
      headerColor: isApproved ? '#10b981' : '#ef4444',
      headerText: isApproved ? '✅ 希望休核准' : '❌ 希望休被駁回',
      title: `${date} ${isApproved ? '已核准' : '被駁回'}`,
      subtitle: isApproved
        ? '排班時會優先考慮你這天希望休'
        : (reason ? `理由：${reason}` : '請聯絡主管確認'),
      btnLabel: '查看詳情',
      btnPath: '/off-request',
      btnColor: isApproved ? '#10b981' : '#ef4444',
    })
    await pushFlex(tgt.line_user_id, isApproved ? '希望休核准' : '希望休駁回', bubble, tgt.channel_code)
    return
  }
}

// 任務確認結果通知執行人
export async function notifyTaskConfirmation({ action, taskTitle, executorEmpId, notes }) {
  const target = await getLineTarget(executorEmpId)
  if (!target.line_user_id) return
  const isApproved = action === 'approve'
  const bubble = buildBubble({
    headerColor: isApproved ? '#10b981' : '#ef4444',
    headerText: isApproved ? '✅ 任務通過' : '🔄 任務退回',
    title: `任務「${taskTitle}」${isApproved ? '已通過審核' : '被退回'}`,
    subtitle: isApproved ? null : `原因：${notes || '（未填）'}`,
    btnLabel: '查看任務',
    btnPath: '/tasks',
    btnColor: isApproved ? '#10b981' : '#ef4444',
  })
  await pushFlex(target.line_user_id, `任務${isApproved ? '通過' : '退回'}`, bubble, target.channel_code)
}

// ── Rich approval card (跟 LINE BOT 端 flexApprovalRequest 對齊) ─────────────
// 七種申請類型統一的簽核卡：含申請人/部門、欄位列、原因、附件、postback 按鈕。
// 按 [✅ 核准] / [❌ 駁回] 會送 postback 到 webhook 的 approve:request / reject:request handler。

const REQUEST_TYPE_PALETTE = {
  leave:           { header: '#10b981', subtitle: '#A7F3D0', emoji: '🏖', label: '請假申請' },
  overtime:        { header: '#f59e0b', subtitle: '#FDE68A', emoji: '⏰', label: '加班申請' },
  trip:            { header: '#3b82f6', subtitle: '#BFDBFE', emoji: '✈️', label: '出差申請' },
  expense:         { header: '#ec4899', subtitle: '#FBCFE8', emoji: '💰', label: '報帳申請' },
  expense_request: { header: '#ec4899', subtitle: '#FBCFE8', emoji: '💳', label: '經費申請' },
  correction:      { header: '#8b5cf6', subtitle: '#E9D5FF', emoji: '🔧', label: '補打卡申請' },
  cover:           { header: '#06b6d4', subtitle: '#CFFAFE', emoji: '🔄', label: '代班邀請' },
  off_request:     { header: '#84cc16', subtitle: '#D9F99D', emoji: '🌴', label: '希望休申請' },
}

const TABLE_MAP = {
  leave: 'leave_requests',
  overtime: 'overtime_requests',
  trip: 'business_trips',
  expense: 'expenses',
  expense_request: 'expense_requests',
  correction: 'clock_corrections',
  cover: 'shift_cover_requests',
  off_request: 'off_requests',
}

const REASON_FIELD = {
  leave: 'reason', overtime: 'reason', trip: 'purpose',
  expense: 'description', expense_request: 'description',
  correction: 'reason', cover: 'reason', off_request: 'reason',
}

function fmtDate(d) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  const wd = ['日','一','二','三','四','五','六'][date.getDay()]
  return `${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} (${wd})`
}
function fmtMoney(v) { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? `$ ${n.toLocaleString('zh-TW')}` : null }
function fmtRange(s, e) { if (!s) return null; const sd = fmtDate(s); if (!e || e === s) return sd; return `${sd} – ${fmtDate(e)}` }
function statusColor(s) { if (s === '已核准' || s === '已核銷') return '#16a34a'; if (s === '已退回' || s === '已駁回') return '#dc2626'; return '#4A4A4A' }

function rowsForType(type, rec) {
  const rows = []
  const push = (label, value, color) => { if (value && value !== '—') rows.push({ label, value, color }) }

  if (type === 'leave') {
    push('假別', rec.type)
    if (rec.start_time && rec.end_time) {
      push('日期', fmtDate(rec.start_date)); push('時段', `${rec.start_time}–${rec.end_time}`)
    } else { push('期間', fmtRange(rec.start_date, rec.end_date)) }
    // 時數為單位(整天假已讀班表淨時數);_disp_hours 由 buildApprovalCardBubble 算好
    const dispH = rec._disp_hours != null ? rec._disp_hours : (rec.hours != null ? rec.hours : (rec.days != null ? rec.days * 8 : null))
    push('時數', dispH != null ? `${dispH} 小時` : null)
  } else if (type === 'overtime') {
    push('日期', fmtDate(rec.date)); push('時數', rec.hours != null ? `${rec.hours} 小時` : null)
  } else if (type === 'trip') {
    push('目的地', rec.destination); push('期間', fmtRange(rec.start_date, rec.end_date)); push('預算', fmtMoney(rec.budget))
  } else if (type === 'expense') {
    push('會計科目', rec.category); push('金額', fmtMoney(rec.amount)); push('日期', fmtDate(rec.date))
    if (rec.receipt) push('收據', '✓ 已附')
  } else if (type === 'expense_request') {
    push('用途', rec.title); push('預估金額', fmtMoney(rec.estimated_amount))
    if (rec.actual_amount != null) push('實際金額', fmtMoney(rec.actual_amount))
    push('科目', rec.account_name)
  } else if (type === 'correction') {
    push('日期', fmtDate(rec.date)); push('類型', rec.type); push('補登時間', rec.correction_time)
  } else if (type === 'cover') {
    push('代班日', fmtDate(rec.shift_date)); push('班別', rec.shift_label)
    if (rec.actual_start && rec.actual_end) push('時段', `${rec.actual_start}–${rec.actual_end}`)
    push('工時', rec.actual_hours != null ? `${rec.actual_hours} 小時` : null)
    push('缺勤者', rec.absent_emp_name); push('發起人', rec.requester_name)
  } else if (type === 'off_request') {
    push('希望休日', fmtDate(rec.date))
  }
  push('申請日', fmtDate(rec.created_at))
  push('狀態', rec.status, statusColor(rec.status))
  return rows
}

function rowKv(label, value, color) {
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
    contents: [
      { type: 'text', text: label, color: '#9CA3AF', size: 'xs', flex: 3 },
      { type: 'text', text: value, color: color || '#333333', size: 'xs', flex: 6, weight: 'bold', wrap: true },
    ],
  }
}

async function fetchAttachmentsFor(type, requestId, rec) {
  if (type === 'expense_request') {
    // 走 SECURITY DEFINER RPC（窄唯讀 3 欄），不再 anon 直查整張 expense_request_attachments
    const { data } = await supabase.rpc('liff_list_request_attachments_for_card', { p_request_id: requestId })
    if (!data) return []
    return data.map(r => {
      const { data: u } = supabase.storage.from('attachments').getPublicUrl(r.storage_path)
      return { name: r.file_name, url: u?.publicUrl, fileType: r.file_type }
    })
  }
  if ((type === 'expense' || type === 'leave') && Array.isArray(rec?.attachments)) {
    return rec.attachments.filter(u => typeof u === 'string').map((url, i) => ({
      name: deriveFileName(url, i + 1),
      url,
      fileType: /\.(jpe?g|png|gif|webp|heic)/i.test(url) ? 'image/*' : null,
    }))
  }
  return []
}
function deriveFileName(url, idx) {
  try { const u = new URL(url); const last = u.pathname.split('/').filter(Boolean).pop(); if (last) return decodeURIComponent(last) }
  catch { /* not URL */ }
  return `附件 ${idx}`
}

// 主 builder：抓 record + 申請人 + 附件，組成完整 rich approval card bubble
async function buildApprovalCardBubble(type, requestId, applicantEmpId) {
  const palette = REQUEST_TYPE_PALETTE[type] || REQUEST_TYPE_PALETTE.leave
  const table = TABLE_MAP[type]
  if (!table) return null

  const { data: rec } = await supabase.from(table).select('*').eq('id', requestId).maybeSingle()
  if (!rec) return null

  // 請假：算顯示時數(整天假讀班表淨時數,與計薪/LIFF/LINE 卡一致) → 卡片以小時為單位
  if (type === 'leave') {
    const { data: dh } = await supabase.rpc('leave_display_hours', { p_leave_id: requestId })
    if (dh != null) rec._disp_hours = Number(dh)
  }

  // 申請人 + 部門/門市（走 SECURITY DEFINER RPC，避免 anon 被 RLS 擋）
  let applicantName = rec.employee || '員工'
  let applicantDept = null
  const empId = rec.employee_id || applicantEmpId
  if (empId) {
    const { data: meta } = await supabase.rpc('liff_get_applicant_meta', { p_emp_id: empId })
    if (meta) {
      applicantName = meta.name || applicantName
      const parts = []
      if (meta.store_name) parts.push(meta.store_name)
      if (meta.department_name) parts.push(meta.department_name)
      if (parts.length) applicantDept = parts.join(' / ')
    }
  }

  const rows = rowsForType(type, rec)
  const reason = rec[REASON_FIELD[type]] || null
  const attachments = await fetchAttachmentsFor(type, requestId, rec)
  const rejectReason = rec.reject_reason || rec.rejection_reason
  const alerts = (rejectReason && rec.status === '已退回') ? [`⚠️ 上次駁回原因：${rejectReason}`] : []

  // ── Body contents ──
  const body = []
  body.push({
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [
      { type: 'text', text: '👤', size: 'lg', flex: 0 },
      {
        type: 'box', layout: 'vertical', flex: 7,
        contents: [
          { type: 'text', text: applicantName, weight: 'bold', size: 'md', color: '#111827' },
          ...(applicantDept ? [{ type: 'text', text: applicantDept, size: 'xs', color: '#666666' }] : []),
        ],
      },
    ],
  })
  body.push({ type: 'separator', margin: 'md' })
  rows.forEach(r => body.push(rowKv(r.label, r.value, r.color)))

  if (reason) {
    body.push({ type: 'separator', margin: 'md' })
    body.push({
      type: 'box', layout: 'vertical', margin: 'sm', paddingAll: '10px',
      backgroundColor: '#F9FAFB', cornerRadius: '8px',
      contents: [
        { type: 'text', text: '📝 申請原因', size: 'xxs', color: '#9CA3AF', weight: 'bold' },
        { type: 'text', text: reason, size: 'sm', color: '#333333', wrap: true, margin: 'sm' },
      ],
    })
  }

  if (attachments.length > 0) {
    body.push({ type: 'separator', margin: 'md' })
    const firstImg = attachments.find(a => a.url && (a.fileType?.startsWith('image')))
    const blocks = [{ type: 'text', text: `📎 附件（${attachments.length}）`, size: 'xxs', color: '#9CA3AF', weight: 'bold' }]
    if (firstImg) {
      blocks.push({
        type: 'image', url: firstImg.url, size: 'full', aspectMode: 'cover', aspectRatio: '20:13', margin: 'sm',
        action: { type: 'uri', label: firstImg.name, uri: firstImg.url },
      })
    }
    attachments.slice(0, 6).forEach(a => blocks.push({
      type: 'text', text: `• ${a.name}`, size: 'xs',
      color: a.url ? '#0891b2' : '#666666', wrap: true, margin: 'xs',
      ...(a.url ? { action: { type: 'uri', label: a.name, uri: a.url } } : {}),
    }))
    body.push({ type: 'box', layout: 'vertical', spacing: 'xs', margin: 'sm', contents: blocks })
  }

  if (alerts.length > 0) {
    body.push({ type: 'separator', margin: 'md' })
    alerts.forEach(a => body.push({ type: 'text', text: a, size: 'xs', color: '#f97316', wrap: true, margin: 'xs' }))
  }

  // ── Footer: postback approve/reject + LIFF detail ──
  const liffDetailUri = LIFF_ID ? `https://liff.line.me/${LIFF_ID}?to=${encodeURIComponent(approveLink(type))}` : null
  const footer = {
    type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px',
    contents: [
      {
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#16a34a', height: 'sm', flex: 1,
            action: { type: 'postback', label: '✅ 核准', data: `action=approve&type=request&rt=${type}&id=${requestId}` } },
          { type: 'button', style: 'primary', color: '#dc2626', height: 'sm', flex: 1,
            action: { type: 'postback', label: '❌ 駁回', data: `action=reject&type=request&rt=${type}&id=${requestId}` } },
        ],
      },
      ...(liffDetailUri ? [{
        type: 'button', style: 'secondary', height: 'sm',
        action: { type: 'uri', label: '📋 看完整詳情', uri: liffDetailUri },
      }] : []),
    ],
  }

  return {
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical', paddingAll: '16px', backgroundColor: palette.header,
      contents: [
        {
          type: 'box', layout: 'horizontal',
          contents: [
            { type: 'text', text: `${palette.emoji} ${palette.label}`, color: '#FFFFFF', weight: 'bold', size: 'lg', flex: 5 },
            { type: 'text', text: '待你審核', color: '#FFFFFFAA', size: 'xs', align: 'end', gravity: 'center', flex: 3 },
          ],
        },
        { type: 'text', text: `#${requestId}`, color: palette.subtitle, size: 'xs', margin: 'xs' },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: body },
    footer,
  }
}

// 新單送出時通知第一關（升級為 rich approval card with postback buttons）
export async function notifyNewSubmission({ type, applicantEmpId, requestId, briefText }) {
  const typeLabel = TYPE_LABEL[type] || type
  let approvers = []

  if (type === 'expense_request') {
    const { data } = await supabase.rpc('liff_resolve_chain_first_approvers', { p_request_id: requestId })
    approvers = data || []
  } else {
    const { data } = await supabase.rpc('liff_resolve_hr_approvers', { p_applicant_emp_id: applicantEmpId })
    approvers = data || []
  }

  if (approvers.length === 0) return

  // 預先 build 一張 rich card（同一張會推給所有簽核者）
  let bubble = null
  try {
    bubble = await buildApprovalCardBubble(type, requestId, applicantEmpId)
  } catch (err) {
    console.warn('buildApprovalCardBubble failed, fallback to simple bubble', err)
  }
  if (!bubble) {
    // fallback：抓不到資料 → 退回舊版簡單 bubble
    bubble = buildBubble({
      headerColor: '#8b5cf6',
      headerText: '📝 簽核請求',
      title: `「${typeLabel}」等待你簽核`,
      subtitle: briefText || null,
      btnLabel: '前往審核',
      btnPath: approveLink(type),
    })
  }

  const palette = REQUEST_TYPE_PALETTE[type]
  const altText = palette ? `${palette.emoji} ${palette.label} 等待你簽核` : `${typeLabel} 簽核請求`

  for (const ap of approvers) {
    const target = await getLineTarget(ap.emp_id)
    if (!target.line_user_id) continue
    await pushFlex(target.line_user_id, altText, bubble, target.channel_code)
  }
}
