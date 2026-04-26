// ============================================================
// 簽核事件 → LINE 推播
//
// approve 後依事件推訊息：
//   advanced  → 通知下一關簽核者
//   approved  → 通知申請人通過
//   rejected  → 通知申請人退回 + 帶原因
// ============================================================

import { supabase } from './supabase'

const TYPE_LABEL = {
  leave: '請假',
  overtime: '加班',
  trip: '出差',
  correction: '補打卡',
  expense: '報帳',
  expense_request: '申請',
}

async function getLineUserId(empId) {
  if (!empId) return null
  const { data } = await supabase.from('employees').select('line_user_id').eq('id', empId).maybeSingle()
  if (data?.line_user_id) return data.line_user_id
  // fallback: employee_line_accounts (multi-channel)
  const { data: acc } = await supabase.from('employee_line_accounts')
    .select('line_user_id').eq('employee_id', empId).order('is_primary', { ascending: false }).limit(1).maybeSingle()
  return acc?.line_user_id || null
}

async function pushLine(lineUserId, text) {
  if (!lineUserId) return
  try {
    await supabase.functions.invoke('line-push', {
      body: { to: lineUserId, messages: [{ type: 'text', text }] },
    })
  } catch (err) {
    console.warn('line-push failed', err)
  }
}

export async function notifyApprovalEvent({ type, action, result }) {
  if (!result?.ok) return
  const typeLabel = TYPE_LABEL[type] || type
  const event = result.event

  // (1) 通知申請人狀態變化
  if (event === 'approved' || event === 'rejected') {
    const applicantId = result.applicant?.emp_id
    const lineId = await getLineUserId(applicantId)
    const text = event === 'approved'
      ? `✅ 你的「${typeLabel}」申請已${result.status}`
      : `🔄 你的「${typeLabel}」申請被退回\n可在 LIFF「我的簽核進度」修改後重送`
    await pushLine(lineId, text)
    return
  }

  // (2) 推進到下一關 → 通知下一關簽核者 + 同步通知申請人「進度推進中」
  if (event === 'advanced' && Array.isArray(result.next_approvers)) {
    const totalAtStep = result.advanced_to_step + 1
    for (const ap of result.next_approvers) {
      const lineId = await getLineUserId(ap.emp_id)
      await pushLine(lineId,
        `📋 有新的「${typeLabel}」需要你簽核（第 ${totalAtStep} 關）\n請至 LIFF「簽核中心」處理`)
    }
    const applicantId = result.applicant?.emp_id
    if (applicantId) {
      const lineId = await getLineUserId(applicantId)
      await pushLine(lineId,
        `🔔 你的「${typeLabel}」已通過第 ${result.advanced_to_step} 關，進入第 ${totalAtStep} 關`)
    }
  }
}

// 執行人完成任務時，推 LINE 給審批人「請審核」
// approvers 已含 line_user_id（v2 RPC 直接回傳）
export async function pushTaskApprovalRequest({ taskTitle, approvers }) {
  for (const ap of approvers || []) {
    if (!ap.line_user_id) continue
    await pushLine(ap.line_user_id,
      `📋 任務「${taskTitle}」需要你審核\n請至 LIFF「任務確認」處理`)
  }
}

// 任務確認 (在 Tasks 頁用)
export async function notifyTaskConfirmation({ action, taskTitle, executorEmpId, notes }) {
  const lineId = await getLineUserId(executorEmpId)
  if (!lineId) return
  const text = action === 'approve'
    ? `✅ 你的任務「${taskTitle}」已通過審核`
    : `🔄 你的任務「${taskTitle}」被退回\n原因：${notes || '（未填）'}`
  await pushLine(lineId, text)
}

// 提交新單時通知第一關（HR 直接通知簽核者；申請通知 chain 第 1 關）
export async function notifyNewSubmission({ type, applicantEmpId, requestId, briefText }) {
  const typeLabel = TYPE_LABEL[type] || type

  if (type === 'expense_request') {
    const { data: approvers } = await supabase.rpc('liff_resolve_chain_first_approvers', {
      p_request_id: requestId,
    })
    for (const ap of approvers || []) {
      const lineId = await getLineUserId(ap.emp_id)
      await pushLine(lineId,
        `📋 新的「${typeLabel}」需要你簽核\n${briefText || ''}\n請至 LIFF「簽核中心」處理`)
    }
    return
  }

  // HR 類
  const { data: approvers } = await supabase.rpc('liff_resolve_hr_approvers', {
    p_applicant_emp_id: applicantEmpId,
  })
  for (const ap of approvers || []) {
    const lineId = await getLineUserId(ap.emp_id)
    await pushLine(lineId,
      `📋 新的「${typeLabel}」需要你簽核\n${briefText || ''}\n請至 LIFF「簽核中心」處理`)
  }
}
