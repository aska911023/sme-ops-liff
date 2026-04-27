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

async function getLineTarget(empId) {
  if (!empId) return { line_user_id: null, channel_code: null }
  const { data } = await supabase.from('employee_line_accounts')
    .select('line_user_id, channel_id, line_channels(code, is_default, status)')
    .eq('employee_id', empId)
    .order('is_primary', { ascending: false })
  if (!data?.length) return { line_user_id: null, channel_code: null }
  // 優先 is_default 的 channel
  const sorted = [...data].sort((a, b) => {
    const aDef = a.line_channels?.is_default ? 1 : 0
    const bDef = b.line_channels?.is_default ? 1 : 0
    return bDef - aDef
  })
  const target = sorted.find(d => d.line_channels?.status === 'active') || sorted[0]
  return {
    line_user_id: target?.line_user_id || null,
    channel_code: target?.line_channels?.code || null,
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
export async function notifyApprovalEvent({ type, result }) {
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

  // (2) 推進下一關
  if (event === 'advanced' && Array.isArray(result.next_approvers)) {
    const totalAtStep = result.advanced_to_step + 1
    for (const ap of result.next_approvers) {
      const target = await getLineTarget(ap.emp_id)
      if (!target.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#8b5cf6',
        headerText: '📝 簽核請求',
        title: `「${typeLabel}」等待你簽核`,
        subtitle: `第 ${totalAtStep} 關 · ${result.applicant?.name || '申請人'}`,
        btnLabel: '前往審核',
        btnPath: '/approve',
      })
      await pushFlex(target.line_user_id, `${typeLabel} 簽核請求`, bubble, target.channel_code)
    }
    // 通知申請人進度
    const applicantId = result.applicant?.emp_id
    if (applicantId) {
      const target = await getLineTarget(applicantId)
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
      btnPath: '/approve',
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
      btnPath: '/approve',
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
    for (const empId of invited_emp_ids || []) {
      const tgt = await getLineTarget(empId)
      if (!tgt.line_user_id) continue
      const bubble = buildBubble({
        headerColor: '#f59e0b',
        headerText: '🆘 代班邀請',
        title: `${shift_date} ${shift_label}`,
        subtitle: `代 ${absent_emp_name || '同事'} 的班`,
        footnote: '先搶先贏！到「待認領代班」確認',
        btnLabel: '我可以接',
        btnPath: '/cover-invitations',
        btnColor: '#f59e0b',
      })
      await pushFlex(tgt.line_user_id, '代班邀請', bubble, tgt.channel_code)
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

// 新單送出時通知第一關
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

  for (const ap of approvers) {
    const target = await getLineTarget(ap.emp_id)
    if (!target.line_user_id) continue
    const bubble = buildBubble({
      headerColor: '#8b5cf6',
      headerText: '📝 簽核請求',
      title: `「${typeLabel}」等待你簽核`,
      subtitle: briefText || null,
      btnLabel: '前往審核',
      btnPath: '/approve',
    })
    await pushFlex(target.line_user_id, `${typeLabel} 簽核請求`, bubble, target.channel_code)
  }
}
