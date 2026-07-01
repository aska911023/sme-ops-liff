// 假期餘額計算（LIFF 端，client-side 算）
// Leave.jsx 跟 LeaveBalance.jsx 共用，避免兩邊邏輯不一致

export function calcAnnualLeave(joinDate) {
  if (!joinDate) return 0
  const years = (new Date() - new Date(joinDate)) / (365.25 * 86400000)
  if (years < 0.5) return 0
  if (years < 1) return 3
  if (years < 2) return 7
  if (years < 3) return 10
  if (years < 5) return 14
  if (years < 10) return 15
  return Math.min(30, 15 + (Math.floor(years) - 10))
}

export function calcPTAnnualLeaveHours(joinDate, weeklyHours) {
  const days = calcAnnualLeave(joinDate)
  const ratio = Math.min(1, (Number(weeklyHours) || 0) / 40)
  return { hours: Math.round(days * 8 * ratio * 10) / 10, days, ratio }
}

// 各假別年度上限 + 說明（曆年制：1/1 ~ 12/31）
export const LEAVE_INFO = {
  '特休':     { max: null, paid: '有薪',  law: '勞基法 §38',     note: '依年資計算，未休完應折算工資' },
  '事假':     { max: 14,   paid: '無薪',  law: '勞工請假規則 §7', note: '因事必須親自處理' },
  '病假':     { max: 30,   paid: '半薪',  law: '勞工請假規則 §4', note: '未住院30天/年，2026新制10天內不得不利處分' },
  '心理假':   { max: 3,    paid: '有薪',  law: '2025新制',       note: '不需診斷證明，不列入考績' },
  '家庭照顧假': { max: 7,  paid: '無薪',  law: '性平法 §20',     note: '2026起可以小時為單位，不扣全勤' },
  '生理假':   { max: 12,   paid: '半薪',  law: '性平法 §14',     note: '每月1天，女性員工適用' },
  '婚假':     { max: 8,    paid: '有薪',  law: '勞工請假規則 §2', note: '登記日前10日起3個月內請畢' },
  '喪假':     { max: 8,    paid: '有薪',  law: '勞工請假規則 §3', note: '父母/配偶8天、祖父母/子女6天、兄弟姊妹3天' },
  '陪產假':   { max: 7,    paid: '有薪',  law: '性平法 §15',     note: '配偶分娩前後15日內請畢', onDemand: true },
  '產檢假':   { max: 7,    paid: '有薪',  law: '性平法 §15',     note: '可以小時為單位，女性適用', onDemand: true },
  '公假':     { max: null, paid: '有薪',  law: '勞工請假規則 §3', note: '選舉、教召、作證等' },
  '產假':     { max: 56,   paid: '有薪',  law: '勞基法 §50',     note: '分娩8週，女性適用', onDemand: true },
  '育嬰假':   { max: 730,  paid: '津貼80%', law: '性平法 §16',   note: '子女滿3歲前，2026可按日申請', onDemand: true },
  '公傷病假': { max: null, paid: '有薪',  law: '勞基法 §43',     note: '職業災害，工資照給' },
}

export const LEAVE_LIMITS = Object.fromEntries(
  Object.entries(LEAVE_INFO).filter(([, v]) => v.max).map(([k, v]) => [k, v.max])
)

// benefit_policies code → LIFF 假別名稱
export const LEAVE_CODE_MAP = {
  annual: '特休', sick: '病假', personal: '事假', official: '公假',
  maternity: '產假', paternity: '陪產假', parental: '育嬰假',
  menstrual: '生理假', marriage: '婚假', bereavement: '喪假',
  family_care: '家庭照顧假', mental_health: '心理假',
  occupational: '公傷病假', nursing: '哺乳時間', prenatal: '產檢假',
}

// 特休年度區間（到職週年制）
export function getAnnualLeaveRange(joinDate) {
  const join = new Date(joinDate)
  const now = new Date()
  const thisAnniv = new Date(now.getFullYear(), join.getMonth(), join.getDate())
  if (thisAnniv > now) {
    const lastAnniv = new Date(now.getFullYear() - 1, join.getMonth(), join.getDate())
    return { start: lastAnniv, end: thisAnniv }
  }
  const nextAnniv = new Date(now.getFullYear() + 1, join.getMonth(), join.getDate())
  return { start: thisAnniv, end: nextAnniv }
}

// 曆年區間
export function getCalendarYearRange(year) {
  const y = year || new Date().getFullYear()
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) }
}

/**
 * 一次算出某員工所有假別的餘額
 * @param {object} args
 *   - joinDate: '2024-01-15'
 *   - leaveRequests: 員工已提交的請假單（filter 'status !== 已拒絕'）
 *   - benefitExtras: { 特休: { extra_days: 2 }, 病假: { extra_days: 5 }, ... }
 *   - calendarYear: 計算「其他假別」的曆年（預設今年）
 *   - dbBalances: liff_get_my_leave_balances 回的陣列 [{leave_type, total_days, carry_over_days}]
 *                 有 DB 記錄時 total = Math.max(dbTotal, 法定+加給) + carry_over
 * @returns Array<{ label, total, used, extra }>
 */
export function computeAllBalances({ joinDate, leaveRequests = [], benefitExtras = {}, calendarYear, isPartTime = false, weeklyHours = 0, dbBalances = [] }) {
  const approved = leaveRequests.filter(r => r.status !== '已拒絕')

  // DB 餘額 map（leave_type 中文 → {total_days, carry_over_days}）
  const dbMap = {}
  for (const b of dbBalances) {
    dbMap[b.leave_type] = { total: Number(b.total_days || 0), carry: Number(b.carry_over_days || 0) }
  }

  // 特休：到職週年制
  const annualRange = joinDate ? getAnnualLeaveRange(joinDate) : null
  const annualLegal = calcAnnualLeave(joinDate)
  const annualExtra = benefitExtras['特休']?.extra_days || 0
  const annualDB = dbMap['特休']

  let annualTotal, annualUsed, annualExtraDisplay, annualIsHours
  if (isPartTime) {
    const ptInfo = calcPTAnnualLeaveHours(joinDate, weeklyHours)
    const dailyHours = (Number(weeklyHours) || 0) / 5 || 8
    const ptExtraHours = Math.round(annualExtra * 8 * Math.min(1, (Number(weeklyHours) || 0) / 40) * 10) / 10
    const ptLegalTotal = Math.round((ptInfo.hours + ptExtraHours) * 10) / 10
    annualTotal = annualDB && annualDB.total > 0
      ? Math.max(annualDB.total * 8, ptLegalTotal) + annualDB.carry * 8
      : ptLegalTotal
    annualUsed = annualRange
      ? approved
          .filter(r => r.type === '特休' && new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => s + (r.hours != null ? r.hours : (r.days || 0) * dailyHours), 0)
      : 0
    annualExtraDisplay = ptExtraHours
    annualIsHours = true
  } else {
    const legalTotal = annualLegal + annualExtra
    annualTotal = annualDB && annualDB.total > 0
      ? Math.max(annualDB.total, legalTotal) + annualDB.carry
      : legalTotal
    annualUsed = annualRange
      ? approved
          .filter(r => r.type === '特休' && new Date(r.start_date) >= annualRange.start && new Date(r.start_date) < annualRange.end)
          .reduce((s, r) => s + (r.days || 0), 0)
      : 0
    annualExtraDisplay = annualExtra
    annualIsHours = false
  }

  // 其他假別：曆年制
  const calRange = getCalendarYearRange(calendarYear)
  const usedByType = (type) =>
    approved
      .filter(r => r.type === type && new Date(r.start_date) >= calRange.start && new Date(r.start_date) < calRange.end)
      .reduce((s, r) => s + (r.days || 0), 0)

  return [
    { label: '特休', total: annualTotal, used: annualUsed, extra: annualExtraDisplay, isHours: annualIsHours },
    // onDemand 假別（產假/陪產/產檢/育嬰）不灌進預設額度 — 不是每人每年固定有
    // 員工真要申請時 Leave.jsx 的下拉選單仍可選到，LEAVE_INFO 上限仍可驗證
    ...Object.entries(LEAVE_LIMITS)
      .filter(([type]) => !LEAVE_INFO[type]?.onDemand)
      .map(([type, legalMax]) => {
        const extra = benefitExtras[type]?.extra_days || 0
        const db = dbMap[type]
        const effectiveTotal = db && db.total > 0
          ? Math.max(db.total, legalMax + extra) + db.carry
          : legalMax + extra
        return { label: type, total: effectiveTotal, used: usedByType(type), extra }
      }),
  ]
}

/**
 * 從 benefit_policies RPC 結果整理出 benefit extras
 * （benefit_policies 的 leave_code → 用 LEAVE_CODE_MAP 對到中文名）
 */
export function parseBenefitExtras(benefitPolicies) {
  const extras = {}
  ;(benefitPolicies || []).forEach(b => {
    const label = LEAVE_CODE_MAP[b.leave_code] || b.leave_code
    if (b.extra_days > 0) {
      extras[label] = { extra_days: b.extra_days, ...b }
    }
  })
  return extras
}
