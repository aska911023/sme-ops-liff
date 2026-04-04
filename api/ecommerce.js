import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Shopee API v2 helpers ──

function shopeeSign(partnerId, partnerKey, path, timestamp, accessToken, shopId) {
  const baseStr = `${partnerId}${path}${timestamp}${accessToken}${shopId}`
  return crypto.createHmac('sha256', partnerKey).update(baseStr).digest('hex')
}

async function shopeeRequest(connection, path, params = {}) {
  const partnerId = parseInt(connection.api_key)
  const partnerKey = connection.api_secret
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = shopeeSign(partnerId, partnerKey, path, timestamp, connection.access_token || '', connection.shop_id || '')

  const url = new URL(`https://partner.shopeemobile.com${path}`)
  url.searchParams.set('partner_id', partnerId)
  url.searchParams.set('timestamp', timestamp)
  url.searchParams.set('sign', sign)
  if (connection.access_token) url.searchParams.set('access_token', connection.access_token)
  if (connection.shop_id) url.searchParams.set('shop_id', connection.shop_id)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  return res.json()
}

// ── API Handlers ──

// 測試連線：驗證 API key 是否有效
async function testConnection(platform, apiKey, apiSecret, shopId) {
  if (platform === 'shopee') {
    try {
      const conn = { api_key: apiKey, api_secret: apiSecret, shop_id: shopId }
      const result = await shopeeRequest(conn, '/api/v2/shop/get_shop_info')
      if (result.error) return { ok: false, error: `蝦皮 API 錯誤：${result.message || result.error}` }
      return { ok: true, shopName: result.response?.shop_name || shopId }
    } catch (e) {
      return { ok: false, error: `連線失敗：${e.message}` }
    }
  }

  // 其他平台：驗證 key 格式
  if (!apiKey || !apiSecret) {
    return { ok: false, error: '請填寫完整的 API 金鑰與密鑰' }
  }
  if (apiKey.length < 8 || apiSecret.length < 8) {
    return { ok: false, error: 'API 金鑰格式不正確（長度不足）' }
  }
  return { ok: true, shopName: shopId || '已驗證' }
}

// 儲存連線設定
async function saveConnection(platform, apiKey, apiSecret, shopId, syncOptions) {
  // 檢查是否已有此平台的連線
  const { data: existing } = await supabase
    .from('ecommerce_connections')
    .select('id')
    .eq('platform', platform)
    .maybeSingle()

  const payload = {
    platform,
    api_key: apiKey,
    api_secret: apiSecret,
    shop_id: shopId,
    sync_options: syncOptions || {},
    status: '已連接',
    last_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { data } = await supabase
      .from('ecommerce_connections')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    return data
  } else {
    const { data } = await supabase
      .from('ecommerce_connections')
      .insert(payload)
      .select()
      .single()
    return data
  }
}

// 取得所有連線狀態
async function getConnections() {
  const { data } = await supabase
    .from('ecommerce_connections')
    .select('*')
    .order('id')
  return data || []
}

// 中斷連線
async function disconnectPlatform(platform) {
  await supabase
    .from('ecommerce_connections')
    .update({ status: '未連接', access_token: null, refresh_token: null, updated_at: new Date().toISOString() })
    .eq('platform', platform)
  return { ok: true }
}

// 同步訂單（蝦皮示範）
async function syncOrders(connection) {
  if (connection.platform === 'shopee' && connection.access_token) {
    try {
      const now = Math.floor(Date.now() / 1000)
      const result = await shopeeRequest(connection, '/api/v2/order/get_order_list', {
        time_range_field: 'create_time',
        time_from: now - 86400 * 7, // 最近7天
        time_to: now,
        page_size: 20,
      })

      const orders = result.response?.order_list || []
      // 記錄同步日誌
      await supabase.from('ecommerce_sync_logs').insert({
        connection_id: connection.id,
        platform: connection.platform,
        sync_type: '訂單同步',
        records_synced: orders.length,
        status: '成功',
      })

      // 更新最後同步時間
      await supabase
        .from('ecommerce_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', connection.id)

      return { ok: true, synced: orders.length, orders }
    } catch (e) {
      await supabase.from('ecommerce_sync_logs').insert({
        connection_id: connection.id,
        platform: connection.platform,
        sync_type: '訂單同步',
        status: '失敗',
        error_message: e.message,
      })
      return { ok: false, error: e.message }
    }
  }

  // 其他平台模擬同步
  await supabase.from('ecommerce_sync_logs').insert({
    connection_id: connection.id,
    platform: connection.platform,
    sync_type: '訂單同步',
    records_synced: 0,
    status: '成功',
  })
  await supabase
    .from('ecommerce_connections')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', connection.id)
  return { ok: true, synced: 0 }
}

// ── Main Handler ──
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const connections = await getConnections()
    return res.status(200).json({ connections })
  }

  if (req.method !== 'POST') return res.status(405).end()

  const { action, platform, api_key, api_secret, shop_id, sync_options } = req.body || {}

  try {
    switch (action) {
      case 'test': {
        const result = await testConnection(platform, api_key, api_secret, shop_id)
        return res.status(200).json(result)
      }
      case 'connect': {
        // 先測試連線
        const test = await testConnection(platform, api_key, api_secret, shop_id)
        if (!test.ok) return res.status(200).json(test)
        // 儲存連線
        const conn = await saveConnection(platform, api_key, api_secret, shop_id, sync_options)
        return res.status(200).json({ ok: true, connection: conn })
      }
      case 'disconnect': {
        await disconnectPlatform(platform)
        return res.status(200).json({ ok: true })
      }
      case 'sync': {
        const { data: conn } = await supabase
          .from('ecommerce_connections')
          .select('*')
          .eq('platform', platform)
          .eq('status', '已連接')
          .maybeSingle()
        if (!conn) return res.status(200).json({ ok: false, error: '此平台尚未連接' })
        const result = await syncOrders(conn)
        return res.status(200).json(result)
      }
      default:
        return res.status(400).json({ error: `未知操作：${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
