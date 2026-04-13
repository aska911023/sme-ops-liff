import { createClient } from '@supabase/supabase-js'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const LIFF_ID = process.env.VITE_LIFF_ID

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Brand Colors (matching Rich Menu) ──
const C = {
  clock:     { bg: '#EFF9FB', accent: '#0891B2', text: '#0E7490', sub: '#67B2C4' },
  leave:     { bg: '#EEF2FF', accent: '#2563EB', text: '#1E40AF', sub: '#7C9CF5' },
  salary:    { bg: '#ECFDF5', accent: '#059669', text: '#047857', sub: '#6EBF9E' },
  inventory: { bg: '#FFF7ED', accent: '#EA580C', text: '#C2410C', sub: '#F5A366' },
  task:      { bg: '#F5F3FF', accent: '#7C3AED', text: '#6D28D9', sub: '#B49AFA' },
  expense:   { bg: '#F5F3FF', accent: '#7C3AED', text: '#6D28D9', sub: '#B49AFA' },
  more:      { bg: '#FDF2F8', accent: '#DB2777', text: '#BE185D', sub: '#F09DC4' },
  brand:     { bg: '#EFF9FB', accent: '#0891B2', text: '#0E7490', sub: '#67B2C4' },
}

// ── Reply helper ──
async function reply(replyToken, messages) {
  if (!Array.isArray(messages)) messages = [messages]
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  })
}

// ── Get LINE profile ──
async function getLineProfile(userId) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    })
    if (res.ok) return await res.json()
  } catch (e) { /* ignore */ }
  return null
}

// ── Find employee by LINE userId ──
async function getEmployee(lineUserId) {
  const { data } = await supabase.from('employees').select('*').eq('line_user_id', lineUserId).eq('status', '在職').maybeSingle()
  return data
}

// ── Flex: info row ──
function infoRow(label, value, valueColor = '#334155') {
  return {
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: label, color: '#94A3B8', size: 'sm', flex: 2 },
      { type: 'text', text: String(value || '-'), color: valueColor, size: 'sm', flex: 3, weight: 'bold' },
    ],
  }
}

// ── Flex: progress bar ──
function progressBar(percent, color = C.salary.accent) {
  const p = Math.max(1, Math.min(100, Math.round(percent)))
  return {
    type: 'box', layout: 'horizontal', height: '6px',
    backgroundColor: '#E2E8F0', cornerRadius: '3px', margin: 'lg',
    contents: [
      { type: 'box', layout: 'vertical', width: `${p}%`, backgroundColor: color, height: '6px', cornerRadius: '3px', contents: [{ type: 'filler' }] },
    ],
  }
}

// ── Flex: checklist row ──
function checklistRow(item) {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'md', paddingAll: '4px',
    action: { type: 'postback', label: (item.title || '').slice(0, 20), data: `wfcl_toggle_${item.id}` },
    contents: [
      { type: 'text', text: item.checked ? '✅' : '⬜', size: 'sm', flex: 0 },
      { type: 'text', text: item.title || '-', size: 'sm', flex: 5, wrap: true, color: item.checked ? '#94A3B8' : '#334155', decoration: item.checked ? 'line-through' : 'none' },
    ],
  }
}

// ── Flex: status badge color ──
function statusColor(s) {
  if (s === '已完成') return C.salary.accent
  if (s === '進行中') return C.leave.accent
  if (s === '已擱置') return C.inventory.accent
  return '#94A3B8'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WORKFLOW CASCADE & NOTIFICATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 完成步驟 → 自動推進依賴 → 檢查流程完成
async function cascadeOnStepComplete(completedStepId, instanceId) {
  const result = { progressedSteps: [], instanceCompleted: false, instance: null }

  // 1. 查 instance 全部 steps（batch query 避免 N+1）
  const { data: allSteps } = await supabase.from('workflow_steps')
    .select('*').eq('instance_id', instanceId).order('step_order')
  if (!allSteps?.length) return result

  // 2. 查所有相關的 dependencies
  const stepIds = allSteps.map(s => s.id)
  const { data: allDeps } = await supabase.from('workflow_step_dependencies')
    .select('*').in('step_id', stepIds).eq('dep_type', 'prerequisite')

  // 3. 找出依賴被完成步驟的 steps
  const dependents = (allDeps || []).filter(d => d.depends_on_step_id === completedStepId)

  for (const dep of dependents) {
    const targetStep = allSteps.find(s => s.id === dep.step_id)
    if (!targetStep || targetStep.status !== '待處理') continue

    // 檢查該 step 的所有 prerequisites 是否都已完成
    const targetPrereqs = (allDeps || []).filter(d => d.step_id === dep.step_id)
    const allMet = targetPrereqs.every(p => {
      const prereqStep = allSteps.find(s => s.id === p.depends_on_step_id)
      return prereqStep?.status === '已完成'
    })

    if (allMet) {
      const { data: started } = await supabase.from('workflow_steps')
        .update({ status: '進行中' }).eq('id', dep.step_id).select().single()
      if (started) {
        result.progressedSteps.push(started)
        // 同步更新本地 array
        const idx = allSteps.findIndex(s => s.id === dep.step_id)
        if (idx >= 0) allSteps[idx].status = '進行中'
      }
    }
  }

  // 4. 檢查 instance 是否全部完成
  const { data: inst } = await supabase.from('workflow_instances')
    .select('*').eq('id', instanceId).maybeSingle()
  result.instance = inst

  if (allSteps.every(s => s.status === '已完成')) {
    await supabase.from('workflow_instances')
      .update({ status: '已完成', completed_at: new Date().toISOString() })
      .eq('id', instanceId)
    result.instanceCompleted = true
  }

  return result
}

// 推播：步驟自動啟動
async function notifyStepAutoStarted(step, instanceName) {
  if (!step.assignee) return
  const { data: emp } = await supabase.from('employees')
    .select('line_user_id').eq('name', step.assignee).maybeSingle()
  if (!emp?.line_user_id) return

  await pushToUser(emp.line_user_id, {
    type: 'flex', altText: `任務自動啟動：${step.title}`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.task.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: '⚡ 任務自動啟動', color: C.task.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: step.title, color: C.task.text, size: 'lg', weight: 'bold', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('流程', instanceName || '-'),
          infoRow('負責人', step.assignee),
          infoRow('截止日', step.due_date || '無'),
          { type: 'text', text: '前置任務已完成，此步驟已自動開始', size: 'xs', color: '#94A3B8', margin: 'lg', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'postback', label: '📋 詳情', data: `wfstep_detail_${step.id}` }, style: 'secondary', height: 'sm', flex: 1 },
          { type: 'button', action: { type: 'postback', label: '✅ 完成', data: `wfstep_update_${step.id}_已完成` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 },
        ],
      },
    },
  })
}

// 推播：流程全部完成
async function notifyWorkflowCompleted(instance) {
  if (!instance?.started_by && !instance?.assignee) return
  const notifyName = instance.started_by || instance.assignee
  const { data: emp } = await supabase.from('employees')
    .select('line_user_id').eq('name', notifyName).maybeSingle()
  if (!emp?.line_user_id) return

  await pushToUser(emp.line_user_id, {
    type: 'flex', altText: `流程已完成：${instance.template_name}`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.salary.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: '🎉 流程已完成', color: C.salary.text, size: 'lg', weight: 'bold' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('流程', instance.template_name),
          infoRow('門市', instance.store || '-'),
          infoRow('完成時間', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'button', action: { type: 'uri', label: '開啟流程頁面', uri: `https://liff.line.me/${LIFF_ID}/tasks` }, style: 'primary', color: C.salary.accent, height: 'sm' },
        ],
      },
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  WORKFLOW QUERY HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 流程總覽 — 活動流程 carousel
async function handleWorkflows(replyToken, emp) {
  const { data: instances } = await supabase.from('workflow_instances')
    .select('*').eq('status', '進行中').order('started_at', { ascending: false }).limit(8)

  if (!instances?.length) {
    await reply(replyToken, { type: 'text', text: '📋 目前沒有進行中的流程' })
    return
  }

  // Batch 查所有 steps
  const instIds = instances.map(i => i.id)
  const { data: allSteps } = await supabase.from('workflow_steps')
    .select('id, instance_id, status').in('instance_id', instIds)

  const bubbles = instances.map(inst => {
    const steps = (allSteps || []).filter(s => s.instance_id === inst.id)
    const done = steps.filter(s => s.status === '已完成').length
    const total = steps.length
    const pct = total > 0 ? Math.round(done / total * 100) : 0

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.task.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: inst.store || '全店', color: C.task.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: inst.template_name, color: C.task.text, size: 'lg', weight: 'bold', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('負責人', inst.assignee || inst.started_by || '-'),
          infoRow('截止日', inst.due_date || '無'),
          infoRow('進度', `${done}/${total} 步驟 (${pct}%)`, pct === 100 ? C.salary.accent : C.leave.accent),
          progressBar(pct),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '10px',
        contents: [
          { type: 'button', action: { type: 'postback', label: '查看步驟', data: `wfinst_steps_${inst.id}` }, style: 'primary', color: C.task.accent, height: 'sm' },
        ],
      },
    }
  })

  await reply(replyToken, {
    type: 'flex', altText: `${instances.length} 個進行中流程`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  })
}

// Instance 步驟列表
async function handleInstanceSteps(replyToken, instanceId) {
  const { data: inst } = await supabase.from('workflow_instances')
    .select('*').eq('id', instanceId).single()
  const { data: steps } = await supabase.from('workflow_steps')
    .select('*').eq('instance_id', instanceId).order('step_order')

  if (!steps?.length) {
    await reply(replyToken, { type: 'text', text: '找不到此流程的步驟' })
    return
  }

  const bubbles = steps.slice(0, 10).map(s => {
    const statusIcon = s.status === '已完成' ? '✅' : s.status === '進行中' ? '🔵' : s.status === '已擱置' ? '⏸️' : '⬜'
    const footerBtns = []

    if (s.status === '進行中') {
      footerBtns.push(
        { type: 'button', action: { type: 'postback', label: '📋 詳情', data: `wfstep_detail_${s.id}` }, style: 'secondary', height: 'sm', flex: 1 },
        { type: 'button', action: { type: 'postback', label: '✅ 完成', data: `wfstep_update_${s.id}_已完成` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 },
      )
    } else if (s.status === '待處理') {
      footerBtns.push(
        { type: 'button', action: { type: 'postback', label: '📋 詳情', data: `wfstep_detail_${s.id}` }, style: 'secondary', height: 'sm' },
      )
    } else {
      footerBtns.push(
        { type: 'button', action: { type: 'postback', label: '📋 詳情', data: `wfstep_detail_${s.id}` }, style: 'secondary', height: 'sm' },
      )
    }

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: s.status === '已完成' ? C.salary.bg : s.status === '進行中' ? C.leave.bg : '#F8FAFC', paddingAll: '14px',
        contents: [
          { type: 'text', text: `${statusIcon} 步驟 ${s.step_order}`, color: '#94A3B8', size: 'xs', weight: 'bold' },
          { type: 'text', text: s.title, color: '#1E293B', size: 'md', weight: 'bold', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px',
        contents: [
          infoRow('狀態', s.status, statusColor(s.status)),
          infoRow('負責人', s.assignee || '-'),
          infoRow('截止日', s.due_date || '無'),
          ...(s.confirmed ? [infoRow('確認', `✅ ${s.confirmed_by || ''}`, C.salary.accent)] : []),
        ],
      },
      ...(footerBtns.length > 0 ? {
        footer: {
          type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
          contents: footerBtns,
        },
      } : {}),
    }
  })

  await reply(replyToken, {
    type: 'flex', altText: `${inst?.template_name || '流程'} — ${steps.length} 個步驟`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  })
}

// 步驟詳情 + Checklist
async function handleStepDetail(replyToken, stepId) {
  const { data: step } = await supabase.from('workflow_steps')
    .select('*, workflow_instances(template_name, store)').eq('id', stepId).single()
  if (!step) {
    await reply(replyToken, { type: 'text', text: '找不到此步驟' })
    return
  }

  const { data: clItems } = await supabase.from('workflow_step_checklist_items')
    .select('*').eq('step_id', stepId).order('sort_order')

  const inst = step.workflow_instances || {}
  const checkedCount = (clItems || []).filter(i => i.checked).length
  const totalCl = (clItems || []).length

  const bodyContents = [
    infoRow('流程', inst?.template_name || '-'),
    infoRow('門市', inst?.store || '-'),
    infoRow('狀態', step.status, statusColor(step.status)),
    infoRow('負責人', step.assignee || '-'),
    infoRow('截止日', step.due_date || '無'),
    ...(step.notes ? [{ type: 'text', text: `📝 ${step.notes}`, size: 'xs', color: '#64748B', wrap: true, margin: 'lg' }] : []),
    ...(step.confirmed ? [infoRow('確認', `✅ ${step.confirmed_by || ''} (${step.confirmed_at?.slice(0, 10) || ''})`, C.salary.accent)] : []),
  ]

  // Checklist section
  if (totalCl > 0) {
    bodyContents.push({ type: 'separator', margin: 'lg' })
    bodyContents.push({ type: 'text', text: `📋 查核清單 (${checkedCount}/${totalCl})`, size: 'sm', weight: 'bold', color: C.task.text, margin: 'lg' })
    const displayItems = (clItems || []).slice(0, 8)
    for (const item of displayItems) {
      bodyContents.push(checklistRow(item))
    }
    if (totalCl > 8) {
      bodyContents.push({ type: 'text', text: `...還有 ${totalCl - 8} 項`, size: 'xs', color: '#94A3B8', margin: 'sm' })
    }
  }

  // Footer buttons based on status
  const footerBtns = []
  if (step.status === '進行中') {
    if (!step.confirmed) {
      footerBtns.push({ type: 'button', action: { type: 'postback', label: '🔏 請求確認', data: `wfstep_reqconfirm_${step.id}` }, style: 'secondary', height: 'sm', flex: 1 })
    }
    footerBtns.push({ type: 'button', action: { type: 'postback', label: '✅ 完成', data: `wfstep_update_${step.id}_已完成` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 })
  } else if (step.status === '待處理') {
    footerBtns.push({ type: 'button', action: { type: 'postback', label: '▶️ 開始', data: `wfstep_update_${step.id}_進行中` }, style: 'primary', color: C.leave.accent, height: 'sm' })
  }

  await reply(replyToken, {
    type: 'flex', altText: `步驟詳情：${step.title}`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.task.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: `步驟 ${step.step_order}`, color: C.task.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: step.title, color: C.task.text, size: 'lg', weight: 'bold', wrap: true, margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: bodyContents,
      },
      ...(footerBtns.length > 0 ? {
        footer: {
          type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
          contents: footerBtns,
        },
      } : {}),
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CHECKLIST TOGGLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function handleChecklistToggle(replyToken, itemId) {
  // 讀取 → toggle → 更新
  const { data: item } = await supabase.from('workflow_step_checklist_items')
    .select('*').eq('id', itemId).single()
  if (!item) {
    await reply(replyToken, { type: 'text', text: '找不到此清單項目' })
    return
  }

  await supabase.from('workflow_step_checklist_items')
    .update({ checked: !item.checked }).eq('id', itemId)

  // Re-render 完整 step detail
  await handleStepDetail(replyToken, item.step_id)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONFIRMATION / APPROVAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 員工請求主管確認
async function handleRequestConfirmation(replyToken, stepId, requesterEmp) {
  const { data: step } = await supabase.from('workflow_steps')
    .select('*, workflow_instances(template_name, store)').eq('id', stepId).single()
  if (!step) {
    await reply(replyToken, { type: 'text', text: '找不到此步驟' })
    return
  }

  // 找直屬主管
  const { data: reqEmp } = await supabase.from('employees')
    .select('supervisor').eq('name', requesterEmp.name).maybeSingle()
  if (!reqEmp?.supervisor) {
    await reply(replyToken, { type: 'text', text: '找不到您的直屬主管，無法送出確認請求' })
    return
  }

  const { data: supervisor } = await supabase.from('employees')
    .select('name, line_user_id').eq('name', reqEmp.supervisor).maybeSingle()
  if (!supervisor?.line_user_id) {
    await reply(replyToken, { type: 'text', text: `主管（${reqEmp.supervisor}）尚未綁定 LINE，無法推播` })
    return
  }

  const inst = step.workflow_instances || {}

  // Push 給主管
  await pushToUser(supervisor.line_user_id, {
    type: 'flex', altText: `🔏 任務確認請求：${step.title}`,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.task.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: '🔏 任務確認請求', color: C.task.text, size: 'lg', weight: 'bold' },
          { type: 'text', text: '員工請求您確認以下任務', color: C.task.sub, size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('任務', step.title),
          infoRow('流程', inst?.template_name || '-'),
          infoRow('門市', inst?.store || '-'),
          infoRow('請求人', requesterEmp.name),
          infoRow('負責人', step.assignee || '-'),
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'postback', label: '✅ 確認', data: `wfstep_confirm_${step.id}` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 },
          { type: 'button', action: { type: 'postback', label: '❌ 退回', data: `wfstep_reject_${step.id}` }, style: 'secondary', height: 'sm', flex: 1 },
        ],
      },
    },
  })

  // Reply 給請求者
  await reply(replyToken, {
    type: 'flex', altText: '已送出確認請求',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px', justifyContent: 'center', alignItems: 'center',
        contents: [
          { type: 'text', text: '📨', size: '3xl', align: 'center' },
          { type: 'text', text: '確認請求已送出', size: 'md', weight: 'bold', align: 'center', margin: 'lg' },
          { type: 'text', text: `已推播給 ${supervisor.name}`, size: 'xs', color: '#94A3B8', align: 'center', margin: 'sm' },
        ],
      },
    },
  })
}

// 主管確認/退回步驟
async function handleStepConfirmation(replyToken, stepId, action, approverEmp) {
  const isApprove = action === 'confirm'
  const { data: step } = await supabase.from('workflow_steps')
    .select('*, workflow_instances(template_name, store)').eq('id', stepId).single()
  if (!step) {
    await reply(replyToken, { type: 'text', text: '找不到此步驟' })
    return
  }

  // 更新 step
  await supabase.from('workflow_steps').update({
    confirmed: isApprove,
    confirmed_by: approverEmp.name,
    confirmed_at: new Date().toISOString(),
  }).eq('id', stepId)

  // 寫入 comment 作為 audit trail
  await supabase.from('workflow_step_comments').insert({
    step_id: stepId,
    author: approverEmp.name,
    text: isApprove ? '✅ 已確認' : '❌ 已退回',
  })

  // 通知 assignee
  if (step.assignee) {
    const { data: assigneeEmp } = await supabase.from('employees')
      .select('line_user_id').eq('name', step.assignee).maybeSingle()
    if (assigneeEmp?.line_user_id) {
      const inst = step.workflow_instances || {}
      await pushToUser(assigneeEmp.line_user_id, {
        type: 'flex', altText: `任務${isApprove ? '已確認' : '已退回'}：${step.title}`,
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: isApprove ? C.salary.bg : '#FEF2F2', paddingAll: '16px',
            contents: [
              { type: 'text', text: isApprove ? '✅ 任務已確認' : '❌ 任務已退回', color: isApprove ? C.salary.text : '#991B1B', size: 'lg', weight: 'bold' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            contents: [
              infoRow('任務', step.title),
              infoRow('流程', inst?.template_name || '-'),
              infoRow('審核者', approverEmp.name),
            ],
          },
          ...(step.status === '進行中' ? {
            footer: {
              type: 'box', layout: 'vertical', paddingAll: '10px',
              contents: [
                { type: 'button', action: { type: 'postback', label: '📋 查看詳情', data: `wfstep_detail_${step.id}` }, style: 'secondary', height: 'sm' },
              ],
            },
          } : {}),
        },
      })
    }
  }

  // Reply 給審核者
  await reply(replyToken, {
    type: 'flex', altText: isApprove ? '已確認' : '已退回',
    contents: {
      type: 'bubble', size: 'kilo',
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px', justifyContent: 'center', alignItems: 'center',
        contents: [
          { type: 'text', text: isApprove ? '✅' : '❌', size: '3xl', align: 'center' },
          { type: 'text', text: `「${step.title}」${isApprove ? '已確認' : '已退回'}`, size: 'md', weight: 'bold', align: 'center', margin: 'lg', wrap: true },
        ],
      },
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━
//  HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━

// 打卡
async function handleClock(replyToken, emp) {
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' })

  const { data: existing } = await supabase.from('attendance_records').select('*').eq('employee', emp.name).eq('date', today).maybeSingle()

  let title, statusText, statusColor, detail

  if (!existing) {
    const status = now <= '09:00' ? '正常' : '遲到'
    await supabase.from('attendance_records').insert({ employee: emp.name, date: today, clock_in: now, status })
    title = '上班打卡成功'
    statusText = status
    statusColor = status === '正常' ? C.salary.accent : C.inventory.accent
    detail = `上班時間：${now}`
  } else if (!existing.clock_out) {
    const clockIn = (existing.clock_in || '09:00').slice(0, 5)
    const hours = Math.max(0, Math.round((new Date(`2000-01-01T${now}`) - new Date(`2000-01-01T${clockIn}`)) / 3600000 * 10) / 10)
    await supabase.from('attendance_records').update({ clock_out: now, hours }).eq('id', existing.id)
    title = '下班打卡成功'
    statusText = `工時 ${hours}h`
    statusColor = C.leave.accent
    detail = `${clockIn} → ${now}`
  } else {
    title = '今日已完成打卡'
    statusText = `${existing.clock_in?.slice(0,5)} → ${existing.clock_out?.slice(0,5)}`
    statusColor = C.salary.accent
    detail = `工時 ${existing.hours}h`
  }

  await reply(replyToken, {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.clock.bg, paddingAll: '18px',
        contents: [
          { type: 'text', text: '⏰ 打卡', color: C.clock.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: title, color: C.clock.text, size: 'lg', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('員工', emp.name),
          infoRow('日期', today),
          infoRow('狀態', statusText, statusColor),
          infoRow('時間', detail),
        ],
      },
    },
  })
}

// 查薪資
async function handleSalary(replyToken, emp) {
  const month = new Date().toISOString().slice(0, 7)
  const { data } = await supabase.from('salary_records').select('*').eq('employee', emp.name).eq('month', month).maybeSingle()

  if (!data) {
    await reply(replyToken, { type: 'text', text: `📋 ${month} 尚無薪資紀錄` })
    return
  }

  await reply(replyToken, {
    type: 'flex', altText: `${month} 薪資明細`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.salary.bg, paddingAll: '18px',
        contents: [
          { type: 'text', text: `💰 ${month} 薪資`, color: C.salary.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: `NT$ ${(data.net_salary || 0).toLocaleString()}`, color: C.salary.text, size: 'xxl', weight: 'bold', margin: 'sm' },
          { type: 'text', text: '實發薪資', color: C.salary.sub, size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: '加項', color: C.salary.accent, size: 'xs', weight: 'bold' },
          infoRow('底薪', `NT$ ${(data.base_salary || 0).toLocaleString()}`),
          infoRow('津貼', `+${(data.allowance || 0).toLocaleString()}`, C.salary.accent),
          infoRow('加班費', `+${(data.overtime || 0).toLocaleString()}`, C.leave.accent),
          infoRow('獎金', `+${(data.bonus || 0).toLocaleString()}`, C.task.accent),
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '扣項', color: '#DC2626', size: 'xs', weight: 'bold', margin: 'lg' },
          infoRow('事假扣薪', data.absence_deduction ? `-${data.absence_deduction.toLocaleString()}` : '-', '#DC2626'),
          infoRow('遲到扣薪', data.late_deduction ? `-${data.late_deduction.toLocaleString()}` : '-', '#DC2626'),
          infoRow('其他扣款', data.other_deduction ? `-${data.other_deduction.toLocaleString()}` : '-', '#DC2626'),
          infoRow('勞健保', `-${(data.insurance || 0).toLocaleString()}`, C.inventory.accent),
        ],
      },
    },
  })
}

// 查假期餘額
async function handleLeaveBalance(replyToken, emp) {
  const year = new Date().getFullYear()
  const { data: leaves } = await supabase.from('leave_requests').select('*').eq('employee', emp.name).eq('status', '已核准')
  const used = (leaves || []).filter(l => l.start_date?.startsWith(String(year))).reduce((s, l) => s + (l.days || 0), 0)

  await reply(replyToken, {
    type: 'flex', altText: '假期餘額',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.leave.bg, paddingAll: '18px',
        contents: [
          { type: 'text', text: '📋 假期餘額', color: C.leave.text, size: 'lg', weight: 'bold' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('員工', emp.name),
          infoRow('年度', `${year}`),
          infoRow('已使用', `${used} 天`, '#DC2626'),
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '詳細請至 LIFF 查看', size: 'xs', color: '#94A3B8', margin: 'lg', align: 'center' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'uri', label: '申請請假', uri: `https://liff.line.me/${LIFF_ID}/leave` }, style: 'primary', color: C.leave.accent, height: 'sm' },
        ],
      },
    },
  })
}

// 查流程任務 (workflow_steps + legacy tasks)
async function handleTasks(replyToken, emp) {
  // First check workflow_steps
  const { data: wfSteps } = await supabase.from('workflow_steps')
    .select('*, workflow_instances(template_name, store)')
    .eq('assignee', emp.name).in('status', ['待處理', '進行中'])
    .order('due_date', { ascending: true, nullsFirst: false }).limit(8)

  // Fallback to legacy tasks if no workflow steps
  const { data: tasks } = await supabase.from('tasks').select('*')
    .eq('assignee', emp.name).neq('status', '已完成')
    .order('id', { ascending: false }).limit(8)

  const allItems = [
    ...(wfSteps || []).map(s => ({ type: 'wf', ...s })),
    ...(tasks || []).map(t => ({ type: 'legacy', ...t })),
  ]

  if (!allItems.length) {
    await reply(replyToken, { type: 'text', text: '✅ 目前沒有指派給您的任務' })
    return
  }

  const statusColor = (s) => s === '已完成' ? C.salary.accent : s === '進行中' ? C.leave.accent : '#94A3B8'

  const bubbles = allItems.slice(0, 8).map(item => {
    const isWf = item.type === 'wf'
    const title = item.title
    const label = isWf ? (item.workflow_instances?.store || item.workflow_instances?.template_name || '流程') : (item.workflow || '任務')
    const postbackPrefix = isWf ? 'wfstep' : 'task'
    const dueDate = item.due_date || '無截止日'

    return {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.task.bg, paddingAll: '16px',
        contents: [
          { type: 'text', text: label, color: C.task.sub, size: 'xs', weight: 'bold' },
          { type: 'text', text: title, color: C.task.text, size: 'lg', weight: 'bold', wrap: true },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
        contents: [
          infoRow('狀態', item.status, statusColor(item.status)),
          infoRow('負責人', item.assignee || '-'),
          infoRow('截止日', dueDate),
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
        contents: [
          { type: 'button', action: { type: 'postback', label: '進行中', data: `${postbackPrefix}_update_${item.id}_進行中` }, style: 'secondary', height: 'sm', flex: 1 },
          { type: 'button', action: { type: 'postback', label: '✅ 完成', data: `${postbackPrefix}_update_${item.id}_已完成` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 },
        ],
      },
    }
  })

  // Add LIFF button at the end
  bubbles.push({
    type: 'bubble', size: 'kilo',
    body: {
      type: 'box', layout: 'vertical', paddingAll: '20px', justifyContent: 'center', alignItems: 'center',
      contents: [
        { type: 'text', text: '📋', size: '3xl', align: 'center' },
        { type: 'text', text: '查看完整任務列表', size: 'md', weight: 'bold', align: 'center', margin: 'lg' },
        { type: 'text', text: '包含清單勾選、備註回報', size: 'xs', color: '#94A3B8', align: 'center', margin: 'sm' },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', paddingAll: '10px',
      contents: [
        { type: 'button', action: { type: 'uri', label: '開啟任務頁面', uri: `https://liff.line.me/${LIFF_ID}/tasks` }, style: 'primary', color: C.task.accent, height: 'sm' },
      ],
    },
  })

  await reply(replyToken, {
    type: 'flex', altText: `你有 ${allItems.length} 個任務`,
    contents: { type: 'carousel', contents: bubbles },
  })
}

// 查庫存
async function handleInventory(replyToken, keyword) {
  const { data } = await supabase.from('stock_levels').select('*').ilike('sku_name', `%${keyword}%`).limit(5)

  if (!data?.length) {
    await reply(replyToken, { type: 'text', text: `🔍 找不到「${keyword}」的庫存資料` })
    return
  }

  const bubbles = data.map(s => ({
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: (s.quantity || 0) <= (s.min_qty || 10) ? '#FEF2F2' : C.inventory.bg,
      paddingAll: '16px',
      contents: [
        { type: 'text', text: s.sku_code || '', color: (s.quantity || 0) <= (s.min_qty || 10) ? '#F87171' : C.inventory.sub, size: 'xs', weight: 'bold' },
        { type: 'text', text: s.sku_name, color: (s.quantity || 0) <= (s.min_qty || 10) ? '#991B1B' : C.inventory.text, size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: [
        { type: 'text', text: String(s.quantity || 0), size: '3xl', weight: 'bold', align: 'center', color: (s.quantity || 0) <= (s.min_qty || 10) ? '#DC2626' : C.salary.accent },
        { type: 'text', text: s.unit || '個', size: 'sm', align: 'center', color: '#94A3B8' },
        ...(s.quantity <= (s.min_qty || 10) ? [{ type: 'text', text: '低庫存警示', size: 'xs', color: '#DC2626', align: 'center', margin: 'md' }] : []),
      ],
    },
  }))

  await reply(replyToken, {
    type: 'flex', altText: `庫存查詢: ${keyword}`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  })
}

// Postback handler: workflow steps, tasks, leave approval, PR approval
async function handlePostback(replyToken, data, emp) {

  // ── Workflow step update (with cascade) ──
  const wfMatch = data.match(/^wfstep_update_(\d+)_(.+)$/)
  if (wfMatch) {
    const [, id, newStatus] = wfMatch
    const completedAt = newStatus === '已完成' ? new Date().toISOString() : null
    const { data: updated } = await supabase.from('workflow_steps')
      .update({ status: newStatus, completed_at: completedAt }).eq('id', Number(id)).select().single()
    if (!updated) return

    // 先 reply（避免 token 過期）
    await reply(replyToken, {
      type: 'flex', altText: '流程任務已更新',
      contents: {
        type: 'bubble', size: 'kilo',
        body: {
          type: 'box', layout: 'vertical', paddingAll: '20px', justifyContent: 'center', alignItems: 'center',
          contents: [
            { type: 'text', text: newStatus === '已完成' ? '✅' : '📝', size: '3xl', align: 'center' },
            { type: 'text', text: `「${updated.title}」`, size: 'md', weight: 'bold', align: 'center', margin: 'lg', wrap: true },
            { type: 'text', text: `已更新為 ${newStatus}`, size: 'sm', color: '#94A3B8', align: 'center', margin: 'sm' },
          ],
        },
      },
    })

    // Cascade：完成時自動推進依賴步驟
    if (newStatus === '已完成' && updated.instance_id) {
      try {
        const result = await cascadeOnStepComplete(Number(id), updated.instance_id)
        const instName = result.instance?.store || result.instance?.template_name || ''

        // 推播給自動啟動的步驟 assignee
        for (const step of result.progressedSteps) {
          await notifyStepAutoStarted(step, instName)
        }

        // 流程全部完成 → 通知發起者
        if (result.instanceCompleted && result.instance) {
          await notifyWorkflowCompleted(result.instance)
        }
      } catch (e) { /* cascade 失敗不影響主回覆 */ }
    }
    return
  }

  // ── Instance 步驟列表 ──
  const instStepsMatch = data.match(/^wfinst_steps_(\d+)$/)
  if (instStepsMatch) {
    await handleInstanceSteps(replyToken, Number(instStepsMatch[1]))
    return
  }

  // ── 步驟詳情 ──
  const stepDetailMatch = data.match(/^wfstep_detail_(\d+)$/)
  if (stepDetailMatch) {
    await handleStepDetail(replyToken, Number(stepDetailMatch[1]))
    return
  }

  // ── Checklist toggle ──
  const clToggleMatch = data.match(/^wfcl_toggle_(\d+)$/)
  if (clToggleMatch) {
    await handleChecklistToggle(replyToken, Number(clToggleMatch[1]))
    return
  }

  // ── 請求確認 ──
  const reqConfirmMatch = data.match(/^wfstep_reqconfirm_(\d+)$/)
  if (reqConfirmMatch) {
    await handleRequestConfirmation(replyToken, Number(reqConfirmMatch[1]), emp)
    return
  }

  // ── 確認/退回 ──
  const confirmMatch = data.match(/^wfstep_(confirm|reject)_(\d+)$/)
  if (confirmMatch) {
    await handleStepConfirmation(replyToken, Number(confirmMatch[2]), confirmMatch[1], emp)
    return
  }

  // ── Legacy task update ──
  const taskMatch = data.match(/^task_update_(\d+)_(.+)$/)
  if (taskMatch) {
    const [, id, status] = taskMatch
    const { data: updated } = await supabase.from('tasks').update({ status }).eq('id', Number(id)).select().single()
    if (updated) {
      await reply(replyToken, {
        type: 'flex', altText: '任務已更新',
        contents: {
          type: 'bubble', size: 'kilo',
          body: {
            type: 'box', layout: 'vertical', paddingAll: '20px', justifyContent: 'center', alignItems: 'center',
            contents: [
              { type: 'text', text: status === '已完成' ? '✅' : '📝', size: '3xl', align: 'center' },
              { type: 'text', text: `「${updated.title}」`, size: 'md', weight: 'bold', align: 'center', margin: 'lg', wrap: true },
              { type: 'text', text: `已更新為 ${status}`, size: 'sm', color: '#94A3B8', align: 'center', margin: 'sm' },
            ],
          },
        },
      })
    }
    return
  }

  // Leave approval: leave_approve_{id} / leave_reject_{id}
  const leaveMatch = data.match(/^leave_(approve|reject)_(\d+)$/)
  if (leaveMatch) {
    const [, action, id] = leaveMatch
    const newStatus = action === 'approve' ? '已核准' : '已駁回'
    const { data: updated } = await supabase.from('leave_requests').update({ status: newStatus }).eq('id', Number(id)).select().single()
    if (updated) {
      await reply(replyToken, {
        type: 'flex', altText: `假單${newStatus}`,
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: action === 'approve' ? C.salary.bg : '#FEF2F2', paddingAll: '16px',
            contents: [
              { type: 'text', text: action === 'approve' ? '✅ 假單已核准' : '❌ 假單已駁回', color: action === 'approve' ? C.salary.text : '#991B1B', size: 'lg', weight: 'bold' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            contents: [
              infoRow('員工', updated.employee),
              infoRow('類型', updated.type || '-'),
              infoRow('日期', updated.start_date || '-'),
              infoRow('天數', `${updated.days || 1} 天`),
              infoRow('審核者', emp.name),
            ],
          },
        },
      })
    }
    return
  }

  // PR approval: pr_approve_{id} / pr_reject_{id}
  const prMatch = data.match(/^pr_(approve|reject)_(\d+)$/)
  if (prMatch) {
    const [, action, id] = prMatch
    const newStatus = action === 'approve' ? '已核准' : '已駁回'
    const { data: updated } = await supabase.from('purchase_requests').update({ status: newStatus, approved_by: emp.name }).eq('id', Number(id)).select().single()
    if (updated) {
      await reply(replyToken, {
        type: 'flex', altText: `採購申請${newStatus}`,
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: action === 'approve' ? C.salary.bg : '#FEF2F2', paddingAll: '16px',
            contents: [
              { type: 'text', text: action === 'approve' ? '✅ 採購申請已核准' : '❌ 採購申請已駁回', color: action === 'approve' ? C.salary.text : '#991B1B', size: 'lg', weight: 'bold' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            contents: [
              infoRow('PR 編號', updated.pr_number),
              infoRow('申請人', updated.requester),
              infoRow('金額', `NT$ ${(updated.total_amount || 0).toLocaleString()}`),
              infoRow('審核者', emp.name),
            ],
          },
        },
      })
    }
    return
  }
}

// ── 簽核通知：根據組織架構找直屬主管 ──
async function sendApprovalNotification(type, record) {
  // 動態簽核：找到申請人的直屬主管
  const { data: emp } = await supabase
    .from('employees').select('supervisor')
    .eq('name', record.employee || record.requester)
    .maybeSingle()

  if (!emp?.supervisor) return

  const { data: supervisor } = await supabase
    .from('employees').select('name, line_user_id')
    .eq('name', emp.supervisor)
    .maybeSingle()

  if (!supervisor?.line_user_id) return

  const managers = [supervisor]

  for (const mgr of managers) {
    if (!mgr.line_user_id) continue

    if (type === 'leave') {
      await pushToUser(mgr.line_user_id, {
        type: 'flex', altText: '待簽核假單',
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: C.leave.bg, paddingAll: '16px',
            contents: [
              { type: 'text', text: '📋 待簽核假單', color: C.leave.text, size: 'lg', weight: 'bold' },
              { type: 'text', text: '請審核以下請假申請', color: C.leave.sub, size: 'xs', margin: 'sm' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            contents: [
              infoRow('員工', record.employee),
              infoRow('類型', record.type || '-'),
              infoRow('日期', record.start_date || '-'),
              infoRow('天數', `${record.days || 1} 天`),
              infoRow('原因', record.reason || '-'),
            ],
          },
          footer: {
            type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'postback', label: '✅ 核准', data: `leave_approve_${record.id}` }, style: 'primary', color: C.salary.accent, height: 'sm', flex: 1 },
              { type: 'button', action: { type: 'postback', label: '❌ 駁回', data: `leave_reject_${record.id}` }, style: 'secondary', height: 'sm', flex: 1 },
            ],
          },
        },
      })
    }

    if (type === 'pr') {
      await pushToUser(mgr.line_user_id, {
        type: 'flex', altText: '待簽核採購申請',
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: C.clock.bg, paddingAll: '16px',
            contents: [
              { type: 'text', text: '🛒 待簽核採購申請', color: C.clock.text, size: 'lg', weight: 'bold' },
            ],
          },
          body: {
            type: 'box', layout: 'vertical', paddingAll: '16px',
            contents: [
              infoRow('PR 編號', record.pr_number),
              infoRow('申請人', record.requester),
              infoRow('部門', record.department),
              infoRow('金額', `NT$ ${(record.total_amount || 0).toLocaleString()}`),
              infoRow('原因', record.reason || '-'),
            ],
          },
          footer: {
            type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
            contents: [
              { type: 'button', action: { type: 'postback', label: '✅ 核准', data: `pr_approve_${record.id}` }, style: 'primary', color: C.clock.accent, height: 'sm', flex: 1 },
              { type: 'button', action: { type: 'postback', label: '❌ 駁回', data: `pr_reject_${record.id}` }, style: 'secondary', height: 'sm', flex: 1 },
            ],
          },
        },
      })
    }
  }
}

async function pushToUser(to, message) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ to, messages: [message] }),
  })
}

// ── 排休 ──
function buildOffRequestFlex() {
  return {
    type: 'flex', altText: '排休申請',
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.clock.bg, paddingAll: '18px',
        contents: [
          { type: 'text', text: '📅 排休申請', color: C.clock.text, size: 'lg', weight: 'bold' },
          { type: 'text', text: '選擇希望休假的日期', color: C.clock.sub, size: 'xs', margin: 'sm' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'uri', label: '開啟排休頁面', uri: `https://liff.line.me/${LIFF_ID}/off-request` }, style: 'primary', color: C.clock.accent, height: 'sm' },
        ],
      },
    },
  }
}

// ── Main menu ──
async function handleMenu(replyToken) {
  await reply(replyToken, {
    type: 'flex', altText: '功能選單',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: C.brand.bg, paddingAll: '20px',
        contents: [
          { type: 'text', text: 'SME OPS', color: C.brand.text, size: 'xl', weight: 'bold' },
          { type: 'text', text: '員工服務選單', color: C.brand.sub, size: 'sm', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'button', action: { type: 'message', label: '⏰ 打卡', text: '打卡' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '💰 查薪資', text: '薪資' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📋 假期餘額', text: '假期' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '⚙️ 我的任務', text: '任務' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📊 流程進度', text: '流程' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📅 排休申請', text: '排休' }, style: 'secondary', height: 'sm' },
          { type: 'separator', margin: 'lg' },
          { type: 'button', action: { type: 'uri', label: '📱 開啟完整平台', uri: `https://liff.line.me/${LIFF_ID}` }, style: 'primary', color: C.brand.accent, height: 'sm', margin: 'md' },
        ],
      },
    },
  })
}

// ━━━━━━━━━━━━━━━━━━━━━
//  WEBHOOK ENTRY
// ━━━━━━━━━━━━━━━━━━━━━
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' })
  }

  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { events } = req.body || {}
  if (!events?.length) return res.status(200).end()

  for (const event of events) {
    const { replyToken, source } = event
    const lineUserId = source?.userId

    if (!lineUserId || !replyToken) continue

    // Auto-log LINE user (upsert to line_users table)
    try {
      const profile = await getLineProfile(lineUserId)
      if (profile) {
        await supabase.from('line_users').upsert({
          line_user_id: lineUserId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl || null,
          last_active: new Date().toISOString(),
        }, { onConflict: 'line_user_id' })
      }
    } catch (e) { /* ignore logging errors */ }

    const emp = await getEmployee(lineUserId)

    // Postback (button clicks)
    if (event.type === 'postback') {
      if (emp) await handlePostback(replyToken, event.postback.data, emp)
      continue
    }

    // Message
    if (event.type !== 'message' || event.message.type !== 'text') continue

    const text = event.message.text.trim()

    // Not bound yet
    if (!emp) {
      await reply(replyToken, { type: 'text', text: `尚未綁定帳號\n\n你的 LINE ID:\n${lineUserId}\n\n請將此 ID 提供給管理員進行綁定。` })
      continue
    }

    // Route commands
    if (text === '打卡' || text === '/打卡') {
      await handleClock(replyToken, emp)
    } else if (text === '薪資' || text === '/薪資' || text === '查薪水' || text === '/薪水') {
      await handleSalary(replyToken, emp)
    } else if (text === '假期' || text === '/假期' || text === '假期餘額' || text === '/假期餘額') {
      await handleLeaveBalance(replyToken, emp)
    } else if (text === '任務' || text === '/任務') {
      await handleTasks(replyToken, emp)
    } else if (text === '流程' || text === '/流程') {
      await handleWorkflows(replyToken, emp)
    } else if (text.startsWith('庫存') || text.startsWith('/庫存')) {
      const keyword = text.replace(/^[\/]?庫存\s*/, '')
      if (keyword) {
        await handleInventory(replyToken, keyword)
      } else {
        await reply(replyToken, { type: 'text', text: '📦 請輸入品名\n例：庫存 螺絲' })
      }
    } else if (text === '排休' || text === '/排休' || text === '排班' || text === '/排班') {
      await reply(replyToken, buildOffRequestFlex())
    } else if (text === '選單' || text === '功能' || text === 'menu' || text === '/menu') {
      await handleMenu(replyToken)
    } else {
      await handleMenu(replyToken)
    }
  }

  res.status(200).end()
}
