import { createClient } from '@supabase/supabase-js'

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const LIFF_ID = process.env.VITE_LIFF_ID
const PUSH_SECRET = process.env.PUSH_SECRET || 'sme-ops-push-key'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Brand colors (matching Rich Menu light theme)
const C = {
  clock:  { bg: '#EFF9FB', accent: '#0891B2', text: '#0E7490', sub: '#67B2C4' },
  salary: { bg: '#ECFDF5', accent: '#059669', text: '#047857', sub: '#6EBF9E' },
  inventory: { bg: '#FFF7ED', accent: '#EA580C', text: '#C2410C', sub: '#F5A366' },
}

async function pushMessage(to, messages) {
  if (!Array.isArray(messages)) messages = [messages]
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages }),
  })
}

// ── Schedule Reminder: notify employees of tomorrow's shift ──
async function sendScheduleReminder() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  const dayLabel = tomorrow.toLocaleDateString('zh-TW', { weekday: 'long', month: 'long', day: 'numeric' })

  const { data: schedules } = await supabase
    .from('schedules').select('*').eq('date', tomorrowStr)

  if (!schedules?.length) return { sent: 0 }

  let sent = 0
  for (const s of schedules) {
    const { data: emp } = await supabase
      .from('employees').select('line_user_id').eq('name', s.employee).maybeSingle()

    if (!emp?.line_user_id) continue

    await pushMessage(emp.line_user_id, {
      type: 'flex', altText: `明日班表提醒：${s.shift}`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: C.clock.bg, paddingAll: '16px',
          contents: [
            { type: 'text', text: '📅 班表提醒', color: C.clock.text, size: 'lg', weight: 'bold' },
            { type: 'text', text: dayLabel, color: C.clock.sub, size: 'xs', margin: 'sm' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          contents: [
            { type: 'box', layout: 'horizontal', margin: 'md', contents: [
              { type: 'text', text: '員工', color: '#94A3B8', size: 'sm', flex: 2 },
              { type: 'text', text: s.employee, color: '#334155', size: 'sm', flex: 3, weight: 'bold' },
            ]},
            { type: 'box', layout: 'horizontal', margin: 'md', contents: [
              { type: 'text', text: '班別', color: '#94A3B8', size: 'sm', flex: 2 },
              { type: 'text', text: s.shift || '-', color: C.clock.accent, size: 'sm', flex: 3, weight: 'bold' },
            ]},
          ],
        },
      },
    })
    sent++
  }
  return { sent }
}

// ── Low Inventory Alert: notify managers of low stock ──
async function sendLowInventoryAlert() {
  const { data: stocks } = await supabase.from('stock_levels').select('*')
  const lowItems = (stocks || []).filter(s => (s.quantity || 0) <= (s.min_qty || 10))

  if (!lowItems.length) return { sent: 0, items: 0 }

  // Get all store managers' LINE IDs
  const { data: stores } = await supabase.from('stores').select('manager')
  const managerNames = [...new Set((stores || []).map(s => s.manager).filter(Boolean))]

  let sent = 0
  for (const name of managerNames) {
    const { data: emp } = await supabase
      .from('employees').select('line_user_id').eq('name', name).maybeSingle()

    if (!emp?.line_user_id) continue

    const itemList = lowItems.slice(0, 5).map(s =>
      `• ${s.sku_name}: ${s.quantity} ${s.unit || '個'}`
    ).join('\n')

    await pushMessage(emp.line_user_id, {
      type: 'flex', altText: `低庫存警示: ${lowItems.length} 項`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: C.inventory.bg, paddingAll: '16px',
          contents: [
            { type: 'text', text: '📦 低庫存警示', color: C.inventory.text, size: 'lg', weight: 'bold' },
            { type: 'text', text: `${lowItems.length} 項商品低於安全庫存`, color: C.inventory.sub, size: 'xs', margin: 'sm' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          contents: [
            { type: 'text', text: itemList, size: 'sm', color: '#334155', wrap: true },
            ...(lowItems.length > 5 ? [{ type: 'text', text: `...還有 ${lowItems.length - 5} 項`, size: 'xs', color: '#94A3B8', margin: 'md' }] : []),
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [
            { type: 'button', action: { type: 'uri', label: '查看庫存', uri: `https://liff.line.me/${LIFF_ID}/inventory` }, style: 'primary', color: C.inventory.accent, height: 'sm' },
          ],
        },
      },
    })
    sent++
  }
  return { sent, items: lowItems.length }
}

// ── Salary Released: notify all employees ──
async function sendSalaryReleased() {
  const month = new Date().toISOString().slice(0, 7)

  const { data: employees } = await supabase
    .from('employees').select('name, line_user_id').eq('status', '在職').not('line_user_id', 'is', null)

  if (!employees?.length) return { sent: 0 }

  let sent = 0
  for (const emp of employees) {
    if (!emp.line_user_id) continue

    await pushMessage(emp.line_user_id, {
      type: 'flex', altText: `${month} 薪資已發放`,
      contents: {
        type: 'bubble', size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: C.salary.bg, paddingAll: '16px',
          contents: [
            { type: 'text', text: '💰 薪資發放通知', color: C.salary.text, size: 'lg', weight: 'bold' },
            { type: 'text', text: `${month} 薪資已入帳`, color: C.salary.sub, size: 'xs', margin: 'sm' },
          ],
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: '16px',
          contents: [
            { type: 'text', text: `${emp.name} 您好，本月薪資已發放完畢。`, size: 'sm', color: '#334155', wrap: true },
            { type: 'text', text: '點擊下方按鈕查看薪資明細', size: 'xs', color: '#94A3B8', margin: 'md' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', paddingAll: '10px',
          contents: [
            { type: 'button', action: { type: 'uri', label: '查看薪資明細', uri: `https://liff.line.me/${LIFF_ID}/salary` }, style: 'primary', color: C.salary.accent, height: 'sm' },
          ],
        },
      },
    })
    sent++
  }
  return { sent }
}

// ── API Handler ──
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', endpoints: ['schedule_reminder', 'low_inventory', 'salary_released'] })
  }

  if (req.method !== 'POST') return res.status(405).end()

  // Simple auth
  const secret = req.headers['x-push-secret'] || req.body?.secret
  if (secret !== PUSH_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { type } = req.body || {}

  try {
    let result
    switch (type) {
      case 'schedule_reminder':
        result = await sendScheduleReminder()
        break
      case 'low_inventory':
        result = await sendLowInventoryAlert()
        break
      case 'salary_released':
        result = await sendSalaryReleased()
        break
      default:
        return res.status(400).json({ error: `Unknown type: ${type}` })
    }
    return res.status(200).json({ ok: true, type, ...result })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
