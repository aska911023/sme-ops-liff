// 全站日期/時間 helper — 一律走台北時區（Asia/Taipei）
//
// 跟主系統 sme-ops-system/src/lib/datetime.js 同步維護。
//
// 為什麼需要：
//   原本 `new Date().toISOString().slice(0, 10)` 是 UTC 日期。
//   台灣凌晨 0~8am 之間呼叫會回**前一天**（UTC 跟台北差 8 小時），
//   造成「今日打卡」、「申請日 default」、「日期 filter」會錯一天。
//
// 新 code 一律 import 這個 lib，不要再用：
//   ❌ new Date().toISOString().slice(0, 10)
//   ❌ d.toLocaleString() / toLocaleDateString() (沒指定 timeZone)

const TW = 'Asia/Taipei'

export function todayTW() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TW })
}

export function toTWDate(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-CA', { timeZone: TW })
}

export function fmtDateTW(d) {
  const iso = toTWDate(d)
  return iso ? iso.replace(/-/g, '/') : ''
}

export function fmtDateTimeTW(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  const dateStr = fmtDateTW(date)
  const timeStr = date.toLocaleTimeString('zh-TW', {
    timeZone: TW,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${dateStr} ${timeStr}`
}

export function fmtTimeTW(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-TW', {
    timeZone: TW,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function nowTimeTW() {
  return fmtTimeTW(new Date())
}

export function nDaysAgoTW(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toTWDate(d)
}

export function monthStartTW(d = new Date()) {
  const iso = toTWDate(d)
  return iso ? iso.slice(0, 7) + '-01' : ''
}
