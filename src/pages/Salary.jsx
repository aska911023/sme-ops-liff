import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronDown, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const SS_KEY = 'salary_unlocked'   // 本次 LIFF 開啟期間記住已解鎖

export default function Salary() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()

  // ── PIN 閘門 ──
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SS_KEY) === '1')
  const [gateLoading, setGateLoading] = useState(true)
  const [hasPin, setHasPin] = useState(false)
  const [usingDefault, setUsingDefault] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')          // 設定時的確認欄
  const [pinErr, setPinErr] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  // ── 薪資資料 ──
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [leaveDeductions, setLeaveDeductions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [payrollRecords, setPayrollRecords] = useState([])
  const [bonusRecords, setBonusRecords] = useState([])   // 門市業績獎金（已發布）

  // 閘門：查 has_pin（未解鎖時）
  useEffect(() => {
    if (!lineProfile?.lineUserId || unlocked) { setGateLoading(false); return }
    supabase.rpc('liff_card_my_salary_brief', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        setHasPin(!!data?.has_pin)
        setUsingDefault(!!data?.using_default_pin)
        setGateLoading(false)
      })
  }, [lineProfile, unlocked])

  // 解鎖後才抓薪資資料
  useEffect(() => {
    if (!lineProfile?.lineUserId || !unlocked) return
    Promise.all([
      supabase.rpc('liff_list_my_salary', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_leave_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_expenses', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_get_my_payroll_records', { p_line_user_id: lineProfile.lineUserId, p_limit: 12 }),
      supabase.rpc('liff_get_my_store_bonus', { p_line_user_id: lineProfile.lineUserId, p_limit: 12 }),
    ]).then(([s, l, e, p, b]) => {
      const sal = Array.isArray(s.data) ? s.data : []
      setRecords(sal)
      setLeaveDeductions((Array.isArray(l.data) ? l.data : []).filter(x => x.status === '已核准'))
      setExpenses(Array.isArray(e.data) ? e.data : [])
      if (p.data?.ok) setPayrollRecords(p.data.records || [])
      if (b.data?.ok) setBonusRecords(b.data.records || [])
      if (sal.length) setSelectedMonth(sal[0].month)
      setLoading(false)
    })
  }, [lineProfile, unlocked])

  const doUnlock = async () => {
    if (pinBusy) return
    setPinErr(''); setPinBusy(true)
    const { data } = await supabase.rpc('liff_card_my_salary_unlock', {
      p_line_user_id: lineProfile.lineUserId, p_pin: pin,
    })
    setPinBusy(false)
    if (data?.ok) {
      sessionStorage.setItem(SS_KEY, '1'); setUnlocked(true)
    } else {
      setPinErr(data?.error === 'WRONG_PIN' ? '密碼錯誤，請再試一次' : '驗證失敗')
      setPin('')
    }
  }

  const doSetPin = async () => {
    if (pinBusy) return
    if (!/^[0-9]{4,6}$/.test(pin)) { setPinErr('請輸入 4~6 位數字'); return }
    if (pin !== pin2) { setPinErr('兩次輸入不一致'); return }
    setPinErr(''); setPinBusy(true)
    const { data } = await supabase.rpc('liff_card_set_line_pin', {
      p_line_user_id: lineProfile.lineUserId, p_pin: pin,
    })
    setPinBusy(false)
    if (data?.ok) {
      sessionStorage.setItem(SS_KEY, '1'); setUnlocked(true)
    } else {
      setPinErr(data?.error === 'INVALID_PIN_FORMAT' ? '密碼格式錯誤（4~6 位數字）' : '設定失敗')
    }
  }

  // ─────────────────────────── PIN 閘門畫面 ───────────────────────────
  if (!unlocked) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="header"><div className="header-title">💰 薪資查詢</div></div>

        {gateLoading ? (
          <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '32px 22px', marginTop: 8 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
              background: 'rgba(34,211,238,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Lock size={30} style={{ color: 'var(--cyan)' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
              {hasPin ? '輸入薪資密碼' : '設定薪資密碼'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: usingDefault ? 8 : 20, lineHeight: 1.6 }}>
              {hasPin
                ? '薪資為個人機密，請輸入你的 4~6 位密碼解鎖。'
                : '第一次查看，請設定一組 4~6 位數字密碼，之後每次查薪資都要輸入。'}
            </div>
            {usingDefault && (
              <div style={{ fontSize: 12, color: 'var(--cyan)', background: 'rgba(34,211,238,0.08)', borderRadius: 8, padding: '6px 12px', marginBottom: 20 }}>
                預設密碼為身分證末 4 碼
              </div>
            )}

            <input
              type="password" inputMode="numeric" maxLength={6} value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="密碼"
              className="form-input"
              style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22, fontWeight: 700, marginBottom: 12 }}
              onKeyDown={e => { if (e.key === 'Enter' && hasPin) doUnlock() }}
            />
            {!hasPin && (
              <input
                type="password" inputMode="numeric" maxLength={6} value={pin2}
                onChange={e => setPin2(e.target.value.replace(/\D/g, ''))}
                placeholder="再次輸入密碼"
                className="form-input"
                style={{ textAlign: 'center', letterSpacing: 8, fontSize: 22, fontWeight: 700, marginBottom: 12 }}
              />
            )}

            {pinErr && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{pinErr}</div>}

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, opacity: pinBusy ? 0.6 : 1 }}
              disabled={pinBusy}
              onClick={hasPin ? doUnlock : doSetPin}
            >
              {pinBusy ? '處理中…' : (hasPin ? '解鎖' : '設定並解鎖')}
            </button>
            {hasPin && !usingDefault && (
              <button
                style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--t3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                disabled={pinBusy}
                onClick={async () => {
                  if (!window.confirm('重設後將改用身分證末 4 碼作為密碼，確定嗎？')) return
                  setPinBusy(true)
                  const { data } = await supabase.rpc('liff_reset_my_salary_pin', { p_line_user_id: lineProfile.lineUserId })
                  setPinBusy(false)
                  if (data?.ok) {
                    setUsingDefault(true)
                    setPinErr('已重設！請使用身分證末 4 碼解鎖。')
                  } else {
                    setPinErr(data?.error === 'NO_DEFAULT_PIN' ? '員工資料尚未填身分證號，請聯絡管理員' : '重設失敗，請再試')
                  }
                }}
              >
                忘記密碼？重設為預設（身分證末 4 碼）
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────── 已解鎖：薪資內容 ───────────────────────────
  const officialRecord = payrollRecords.find(r => r.pay_period === selectedMonth)
  const current = records.find(r => r.month === selectedMonth)
  const monthBonus = bonusRecords.find(b => b.year_month === selectedMonth)
  const monthLeaves = leaveDeductions.filter(l => l.start_date?.startsWith(selectedMonth) && ['事假', '病假'].includes(l.type))
  const monthExpenses = expenses.filter(e => e.date?.startsWith(selectedMonth) && e.status === '已核准')
  const expenseTotal = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0)

  const num = v => Number(v || 0)
  const money = v => `NT$ ${num(v).toLocaleString()}`

  // 收入/扣項列（金額 0 的非主要欄位自動隱藏）
  const incomeRows = officialRecord ? [
    { label: '底薪', value: officialRecord.base_salary, always: true },
    { label: '職務津貼', value: officialRecord.role_allowance },
    { label: '伙食津貼', value: officialRecord.meal_allowance },
    { label: '交通津貼', value: officialRecord.transport_allowance },
    { label: '全勤獎金', value: officialRecord.attendance_bonus_earned },
    { label: '加班費', value: officialRecord.overtime_pay },
  ].filter(r => r.always || num(r.value) !== 0) : []

  const dedRows = officialRecord ? [
    { label: '請假扣款', value: officialRecord.leave_deduction },
    { label: '遲到扣款', value: officialRecord.late_deduction },
    { label: '勞保', value: officialRecord.labor_ins_employee },
    { label: '健保', value: officialRecord.health_ins_employee },
  ].filter(r => num(r.value) !== 0) : []

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header"><div className="header-title">💰 薪資查詢</div></div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無薪資紀錄</div>
      ) : (
        <>
          {/* 月份選擇 */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <select
              className="form-input"
              value={selectedMonth || ''}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                width: '100%', padding: '12px 40px 12px 16px', borderRadius: 12,
                fontSize: 15, fontWeight: 700, color: 'var(--cyan)',
                background: 'var(--card)', border: '1.5px solid rgba(34,211,238,0.3)',
                appearance: 'none', cursor: 'pointer',
              }}
            >
              {records.map(r => {
                const [y, m] = r.month.split('-')
                return <option key={r.month} value={r.month}>{y} 年 {parseInt(m)} 月</option>
              })}
            </select>
            <ChevronDown size={18} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cyan)', pointerEvents: 'none' }} />
          </div>

          {current && (
            <>
              {/* 實發大數字 */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(34,211,238,0.08))',
                border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>實發薪資</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)' }}>
                  {money(officialRecord?.net_salary ?? current.net_salary)}
                </div>
                {officialRecord && (
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>（依 HR 結算版正式薪資單）</div>
                )}
              </div>

              {/* 簡版明細（沒有結算版時） */}
              {!officialRecord && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>薪資明細</div>
                  {[
                    { label: '底薪', value: current.base_salary, color: 'var(--t1)' },
                    { label: '津貼', value: current.allowance, color: 'var(--green)', sign: '+' },
                    { label: '加班費', value: current.overtime, color: 'var(--cyan)', sign: '+' },
                    { label: '績效獎金', value: current.bonus, color: 'var(--purple)', sign: '+' },
                    { label: '事假扣薪', value: current.absence_deduction, color: 'var(--red)', sign: '-' },
                    { label: '遲到扣薪', value: current.late_deduction, color: 'var(--red)', sign: '-' },
                    { label: `其他扣款${current.deduction_note ? `（${current.deduction_note}）` : ''}`, value: current.other_deduction, color: 'var(--red)', sign: '-' },
                    { label: '勞健保', value: current.insurance, color: 'var(--orange)', sign: '-' },
                    { label: '報帳退款', value: expenseTotal, color: 'var(--cyan)', sign: '+' },
                  ].map((item, i) => (
                    <div key={i} className="info-row">
                      <span className="info-label">{item.label}</span>
                      <span style={{ fontWeight: 600, color: num(item.value) === 0 ? 'var(--t3)' : item.color }}>
                        {num(item.value) === 0 ? '—' : `${item.sign || ''}${money(item.value)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 📊 正式薪資單：完整明細 */}
              {officialRecord && (
                <div className="card" style={{ borderColor: 'rgba(167,139,250,0.25)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    📊 正式薪資單
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(167,139,250,0.15)', color: 'var(--purple)' }}>HR 結算版</span>
                  </div>

                  {/* 收入 */}
                  <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, marginBottom: 6 }}>+ 收入</div>
                  {incomeRows.map((r, i) => (
                    <div key={i} className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">{r.label}</span>
                      <span style={{ fontWeight: 600 }}>{money(r.value)}</span>
                    </div>
                  ))}
                  {Array.isArray(officialRecord.custom_allowances_breakdown) && officialRecord.custom_allowances_breakdown.map((c, i) => (
                    <div key={`ca${i}`} className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">{c.name}</span>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>+{money(c.amount)}</span>
                    </div>
                  ))}
                  <div className="info-row" style={{ paddingTop: 4, borderTop: '1px dashed var(--border)' }}>
                    <span className="info-label" style={{ fontWeight: 700 }}>應發合計</span>
                    <span style={{ fontWeight: 700, color: 'var(--green)' }}>{money(officialRecord.gross_salary)}</span>
                  </div>

                  {/* 扣項 */}
                  <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, margin: '14px 0 6px' }}>- 扣項</div>
                  {dedRows.map((r, i) => (
                    <div key={i} className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">{r.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--red)' }}>-{money(r.value)}</span>
                    </div>
                  ))}
                  {Array.isArray(officialRecord.legal_deduction_breakdown) && officialRecord.legal_deduction_breakdown.map((d, i) => (
                    <div key={`ld${i}`} className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">
                        {d.title}
                        {d.shortfall > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--orange)' }}>⚠️ 餘額不足</span>}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--red)' }}>-{money(d.amount)}</span>
                    </div>
                  ))}
                  <div className="info-row" style={{ paddingTop: 4, borderTop: '1px dashed var(--border)' }}>
                    <span className="info-label" style={{ fontWeight: 700 }}>扣除合計</span>
                    <span style={{ fontWeight: 700, color: 'var(--red)' }}>-{money(officialRecord.total_deductions)}</span>
                  </div>

                  {officialRecord.legal_deduction_breakdown?.some(d => d.shortfall > 0) && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(251,146,60,0.1)', color: 'var(--orange)', fontSize: 11 }}>
                      ⚠️ 部分法扣金額本月薪水不夠扣，未扣部分將自動延後到下月
                    </div>
                  )}

                  {/* 實發 */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>實發薪資</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{money(officialRecord.net_salary)}</span>
                  </div>
                </div>
              )}

              {/* 🏆 門市業績獎金（已發布） */}
              {monthBonus && (
                <div className="card" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🏆 門市業績獎金
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--orange)' }}>已發布</span>
                  </div>
                  {[
                    { label: '損益獎金', value: monthBonus.profit_bonus, sign: '+' },
                    { label: '達標獎金', value: monthBonus.target_bonus, sign: '+' },
                    { label: '記功獎金', value: monthBonus.merit_bonus, sign: '+' },
                    { label: '前月補發', value: monthBonus.prev_month_supplement, sign: '+' },
                    { label: '稽核扣項', value: monthBonus.audit_deduction, sign: '-', neg: true },
                    { label: '補卡扣項', value: monthBonus.punch_deduction, sign: '-', neg: true },
                  ].filter(r => num(r.value) !== 0).map((r, i) => (
                    <div key={i} className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">{r.label}</span>
                      <span style={{ fontWeight: 600, color: r.neg ? 'var(--red)' : 'var(--green)' }}>
                        {r.sign}{money(Math.abs(num(r.value)))}
                      </span>
                    </div>
                  ))}
                  {num(monthBonus.custom_adjust) !== 0 && (
                    <div className="info-row" style={{ paddingLeft: 12 }}>
                      <span className="info-label">其他調整</span>
                      <span style={{ fontWeight: 600, color: num(monthBonus.custom_adjust) < 0 ? 'var(--red)' : 'var(--green)' }}>
                        {num(monthBonus.custom_adjust) < 0 ? '-' : '+'}{money(Math.abs(num(monthBonus.custom_adjust)))}
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>獎金應發</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--orange)' }}>{money(monthBonus.net_bonus)}</span>
                  </div>
                  {monthBonus.notes && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 8 }}>{monthBonus.notes}</div>}
                </div>
              )}

              {/* 📋 請假扣款明細 */}
              {monthLeaves.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>📋 請假扣款明細</div>
                  {monthLeaves.map(l => (
                    <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span><span className="badge badge-cyan" style={{ marginRight: 6 }}>{l.type}</span>{l.start_date}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 600 }}>{l.hours ? `${l.hours}h` : `${l.days || 1}天`}</span>
                      </div>
                      {l.reason && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{l.reason}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* 🧾 報帳退款明細 */}
              {monthExpenses.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>🧾 報帳退款明細</div>
                  {monthExpenses.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--t2)' }}>{e.description || e.category || '報帳'}</span>
                      <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>+{money(e.amount)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700 }}>
                    <span>合計</span>
                    <span style={{ color: 'var(--cyan)' }}>+{money(expenseTotal)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
