import { createClient } from '@supabase/supabase-js'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const LIFF_ID = process.env.VITE_LIFF_ID

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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
function infoRow(label, value, valueColor = '#333333') {
  return {
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: label, color: '#888888', size: 'sm', flex: 2 },
      { type: 'text', text: String(value || '-'), color: valueColor, size: 'sm', flex: 3, weight: 'bold' },
    ],
  }
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
    // Clock in
    const status = now <= '09:00' ? '正常' : '遲到'
    await supabase.from('attendance_records').insert({ employee: emp.name, date: today, clock_in: now, status })
    title = '上班打卡成功 ✓'
    statusText = status
    statusColor = status === '正常' ? '#4CAF50' : '#FF9800'
    detail = `上班時間：${now}`
  } else if (!existing.clock_out) {
    // Clock out
    const clockIn = (existing.clock_in || '09:00').slice(0, 5)
    const hours = Math.max(0, Math.round((new Date(`2000-01-01T${now}`) - new Date(`2000-01-01T${clockIn}`)) / 3600000 * 10) / 10)
    await supabase.from('attendance_records').update({ clock_out: now, hours }).eq('id', existing.id)
    title = '下班打卡成功 ✓'
    statusText = `工時 ${hours}h`
    statusColor = '#2196F3'
    detail = `${clockIn} → ${now}`
  } else {
    title = '今日已完成打卡'
    statusText = `${existing.clock_in?.slice(0,5)} → ${existing.clock_out?.slice(0,5)}`
    statusColor = '#4CAF50'
    detail = `工時 ${existing.hours}h`
  }

  await reply(replyToken, {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1B5E20', paddingAll: '16px',
        contents: [
          { type: 'text', text: '⏰ 打卡', color: '#ffffff', size: 'sm' },
          { type: 'text', text: title, color: '#ffffff', size: 'lg', weight: 'bold', margin: 'sm' },
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

  const totalDeduct = (data.absence_deduction || 0) + (data.late_deduction || 0) + (data.other_deduction || 0) + (data.insurance || 0)

  await reply(replyToken, {
    type: 'flex', altText: `${month} 薪資明細`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#1565C0', paddingAll: '16px',
        contents: [
          { type: 'text', text: `💰 ${month} 薪資`, color: '#ffffff', size: 'sm' },
          { type: 'text', text: `NT$ ${(data.net_salary || 0).toLocaleString()}`, color: '#ffffff', size: 'xxl', weight: 'bold', margin: 'sm' },
          { type: 'text', text: '實發薪資', color: '#90CAF9', size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          { type: 'text', text: '▲ 加項', color: '#4CAF50', size: 'xs', weight: 'bold' },
          infoRow('底薪', `NT$ ${(data.base_salary || 0).toLocaleString()}`),
          infoRow('津貼', `+${(data.allowance || 0).toLocaleString()}`, '#4CAF50'),
          infoRow('加班費', `+${(data.overtime || 0).toLocaleString()}`, '#2196F3'),
          infoRow('獎金', `+${(data.bonus || 0).toLocaleString()}`, '#9C27B0'),
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '▼ 扣項', color: '#F44336', size: 'xs', weight: 'bold', margin: 'lg' },
          infoRow('事假扣薪', data.absence_deduction ? `-${data.absence_deduction.toLocaleString()}` : '-', '#F44336'),
          infoRow('遲到扣薪', data.late_deduction ? `-${data.late_deduction.toLocaleString()}` : '-', '#F44336'),
          infoRow('其他扣款', data.other_deduction ? `-${data.other_deduction.toLocaleString()}` : '-', '#F44336'),
          infoRow('勞健保', `-${(data.insurance || 0).toLocaleString()}`, '#FF9800'),
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
        type: 'box', layout: 'vertical', backgroundColor: '#00695C', paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 假期餘額', color: '#ffffff', size: 'lg', weight: 'bold' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px',
        contents: [
          infoRow('員工', emp.name),
          infoRow('年度', `${year}`),
          infoRow('已使用', `${used} 天`, '#F44336'),
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: '詳細請至 LIFF 查看', size: 'xs', color: '#888888', margin: 'lg', align: 'center' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [
          { type: 'button', action: { type: 'uri', label: '申請請假', uri: `https://liff.line.me/${LIFF_ID}/leave` }, style: 'primary', color: '#00695C', height: 'sm' },
        ],
      },
    },
  })
}

// 查流程任務
async function handleTasks(replyToken, emp) {
  const { data: tasks } = await supabase.from('tasks').select('*').eq('assignee', emp.name).order('id', { ascending: false }).limit(10)

  if (!tasks?.length) {
    await reply(replyToken, { type: 'text', text: '✅ 目前沒有指派給您的任務' })
    return
  }

  const priColor = (p) => p === '高' ? '#F44336' : p === '中' ? '#FF9800' : '#2196F3'
  const statusColor = (s) => s === '已完成' ? '#4CAF50' : s === '進行中' ? '#2196F3' : '#9E9E9E'

  const bubbles = tasks.slice(0, 8).map(t => ({
    type: 'bubble', size: 'kilo',
    header: {
      type: 'box', layout: 'vertical',
      backgroundColor: t.status === '已完成' ? '#388E3C' : '#E65100',
      paddingAll: '14px',
      contents: [
        { type: 'text', text: t.workflow || '任務', color: '#ffffff', size: 'xs' },
        { type: 'text', text: t.title, color: '#ffffff', size: 'lg', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'sm',
      contents: [
        infoRow('狀態', t.status, statusColor(t.status)),
        infoRow('負責人', t.assignee || '-'),
        infoRow('截止日', t.due_date || '無截止日'),
        infoRow('優先', t.priority || '中', priColor(t.priority)),
      ],
    },
    footer: t.status !== '已完成' ? {
      type: 'box', layout: 'horizontal', paddingAll: '10px', spacing: 'sm',
      contents: [
        { type: 'button', action: { type: 'postback', label: '✏️ 進行中', data: `task_update_${t.id}_進行中` }, style: 'secondary', height: 'sm', flex: 1 },
        { type: 'button', action: { type: 'postback', label: '✅ 完成', data: `task_update_${t.id}_已完成` }, style: 'primary', color: '#4CAF50', height: 'sm', flex: 1 },
      ],
    } : undefined,
  }))

  await reply(replyToken, {
    type: 'flex', altText: `你有 ${tasks.length} 個任務`,
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
      backgroundColor: (s.quantity || 0) <= (s.min_qty || 10) ? '#B71C1C' : '#1B5E20',
      paddingAll: '14px',
      contents: [
        { type: 'text', text: s.sku_code || '', color: '#ffffff', size: 'xs' },
        { type: 'text', text: s.sku_name, color: '#ffffff', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '14px',
      contents: [
        { type: 'text', text: String(s.quantity || 0), size: '3xl', weight: 'bold', align: 'center', color: (s.quantity || 0) <= (s.min_qty || 10) ? '#F44336' : '#4CAF50' },
        { type: 'text', text: s.unit || '個', size: 'sm', align: 'center', color: '#888888' },
        ...(s.quantity <= (s.min_qty || 10) ? [{ type: 'text', text: '⚠ 低庫存警示', size: 'xs', color: '#F44336', align: 'center', margin: 'md' }] : []),
      ],
    },
  }))

  await reply(replyToken, {
    type: 'flex', altText: `庫存查詢: ${keyword}`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  })
}

// Postback: 更新任務狀態
async function handlePostback(replyToken, data, emp) {
  const match = data.match(/^task_update_(\d+)_(.+)$/)
  if (match) {
    const [, id, status] = match
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
              { type: 'text', text: `已更新為 ${status}`, size: 'sm', color: '#888888', align: 'center', margin: 'sm' },
            ],
          },
        },
      })
    }
  }
}

// ── Main menu ──
async function handleMenu(replyToken) {
  await reply(replyToken, {
    type: 'flex', altText: '功能選單',
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#0D47A1', paddingAll: '20px',
        contents: [
          { type: 'text', text: 'SME OPS', color: '#ffffff', size: 'xl', weight: 'bold' },
          { type: 'text', text: '員工服務選單', color: '#90CAF9', size: 'sm', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'md',
        contents: [
          { type: 'button', action: { type: 'message', label: '⏰ 打卡', text: '打卡' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '💰 查薪資', text: '薪資' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📋 假期餘額', text: '假期' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '⚙️ 我的任務', text: '任務' }, style: 'secondary', height: 'sm' },
          { type: 'button', action: { type: 'message', label: '📅 排休申請', text: '排休' }, style: 'secondary', height: 'sm' },
          { type: 'separator', margin: 'lg' },
          { type: 'button', action: { type: 'uri', label: '📱 開啟完整平台', uri: `https://liff.line.me/${LIFF_ID}` }, style: 'primary', color: '#0D47A1', height: 'sm', margin: 'md' },
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
      await reply(replyToken, { type: 'text', text: `❌ 尚未綁定帳號\n\n你的 LINE ID:\n${lineUserId}\n\n請將此 ID 提供給管理員進行綁定。` })
      continue
    }

    // Route commands
    if (text === '打卡' || text === '/打卡') {
      await handleClock(replyToken, emp)
    } else if (text === '薪資' || text === '/薪資' || text === '查薪水' || text === '/薪水') {
      await handleSalary(replyToken, emp)
    } else if (text === '假期' || text === '/假期' || text === '假期餘額' || text === '/假期餘額') {
      await handleLeaveBalance(replyToken, emp)
    } else if (text === '任務' || text === '/任務' || text === '流程' || text === '/流程') {
      await handleTasks(replyToken, emp)
    } else if (text.startsWith('庫存') || text.startsWith('/庫存')) {
      const keyword = text.replace(/^[\/]?庫存\s*/, '')
      if (keyword) {
        await handleInventory(replyToken, keyword)
      } else {
        await reply(replyToken, { type: 'text', text: '📦 請輸入品名\n例：庫存 螺絲' })
      }
    } else if (text === '排休' || text === '/排休' || text === '排班' || text === '/排班') {
      await reply(replyToken, {
        type: 'flex', altText: '排休申請',
        contents: {
          type: 'bubble', size: 'kilo',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: '#E65100', paddingAll: '16px',
            contents: [
              { type: 'text', text: '📅 排休申請', color: '#ffffff', size: 'lg', weight: 'bold' },
              { type: 'text', text: '選擇希望休假的日期', color: '#FFCC80', size: 'xs', margin: 'sm' },
            ],
          },
          footer: {
            type: 'box', layout: 'vertical', paddingAll: '12px',
            contents: [
              { type: 'button', action: { type: 'uri', label: '開啟排休頁面', uri: `https://liff.line.me/${LIFF_ID}/off-request` }, style: 'primary', color: '#E65100', height: 'sm' },
            ],
          },
        },
      })
    } else if (text === '選單' || text === '功能' || text === 'menu' || text === '/menu') {
      await handleMenu(replyToken)
    } else {
      // Default: show menu
      await handleMenu(replyToken)
    }
  }

  res.status(200).end()
}
