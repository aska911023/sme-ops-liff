import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY = []

// 估算匯率（TWD 為基準）
const RATES = { TWD: 1, USD: 32, JPY: 0.21, CNY: 4.4, EUR: 35 }
const RATE_NOTE = 'USD×32、JPY×0.21、CNY×4.4、EUR×35'

const toTWD  = (amt, cur) => Math.round((amt || 0) * (RATES[cur] || 1))
const fmtTWD = (n) => 'NT$' + Math.round(n).toLocaleString('zh-TW')
const fmtAmt = (n, cur) =>
  (cur === 'TWD' ? 'NT$' : cur + ' ') + (n || 0).toLocaleString('zh-TW')

const APPROVED_GROUP = ['已核准', '待核銷', '已核銷', '核銷已退回']

const STATUS_COLOR = {
  // expense_requests 共用
  '申請中':      '#3b82f6',
  '已核准':      '#10b981',
  '已駁回':      '#ef4444',
  '未送核銷':    '#f59e0b',
  '待核銷':      '#6366f1',
  '已核銷':      '#06b6d4',
  '核銷被駁回':  '#ef4444',
  // expenses（經常性費用）
  '待審核':      '#3b82f6',
  // store_repair_requests
  '待處理':      '#f59e0b',
  '處理中':      '#6366f1',
  '已關閉':      '#94a3b8',
  // goods_transfer_requests
  '草稿':        '#94a3b8',
  '申請審核中':  '#3b82f6',
  '待驗收':      '#f59e0b',
  '驗收審核中':  '#6366f1',
  '已完成':      '#10b981',
  '已撤回':      '#ef4444',
  // store_audits
  '待確認':      '#f59e0b',
  '已退回':      '#ef4444',
  // work_orders（跨部門工單）
  '待受理':      '#3b82f6',
  '已結案':      '#06b6d4',
}

// expense_requests 申請桶
function bucketApply(rows) {
  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (r.count || 0), 0)
  return {
    '申請中': sum(r => r.status === '申請中'),
    '已核准': sum(r => APPROVED_GROUP.includes(r.status)),
    '已駁回': sum(r => r.status === '已駁回'),
  }
}
// expense_requests 核銷桶
function bucketSettle(rows) {
  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (r.count || 0), 0)
  return {
    '未送核銷':   sum(r => r.status === '已核准'),
    '待核銷':     sum(r => r.status === '待核銷'),
    '已核銷':     sum(r => r.status === '已核銷'),
    '核銷被駁回': sum(r => r.status === '核銷已退回'),
  }
}
// 其他表：status → count 直接對映
function bucketRaw(rows) {
  const out = {}
  rows.forEach(r => { out[r.status] = (out[r.status] || 0) + (r.count || 0) })
  return out
}

// rows by currency → amount breakdown
function sumByCurrency(rows, field, statusPred) {
  const out = {}
  rows.filter(statusPred).forEach(r => {
    const c = r.currency || 'TWD'
    out[c] = (out[c] || 0) + Number(r[field] || 0)
  })
  return out
}

// ── ProgressBar ──────────────────────────────────────────────────────────────
function ProgressBar({ segments }) {
  return (
    <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%`, height: '100%', background: s.color, transition: 'width 0.5s' }} />
      ))}
    </div>
  )
}

function StatusRow({ label, count, pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginLeft: 'auto' }}>{count}</span>
      <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function AmountBreakdown({ amounts, isActual }) {
  const entries = Object.entries(amounts).filter(([, v]) => v > 0)
  if (!entries.length) return <div style={{ fontSize: 11, color: 'var(--t3)' }}>—</div>
  const totalTWD = entries.reduce((s, [c, v]) => s + toTWD(v, c), 0)
  const hasForeign = entries.some(([c]) => c !== 'TWD')
  return (
    <div>
      {entries.map(([c, v]) => (
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t2)', marginBottom: 2 }}>
          <span>{c}</span>
          <span>
            {fmtAmt(v, c)}
            {c !== 'TWD' && <span style={{ color: 'var(--t3)', marginLeft: 3 }}>≈{fmtTWD(toTWD(v, c))}</span>}
          </span>
        </div>
      ))}
      {entries.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--t1)', borderTop: '1px solid var(--border)', paddingTop: 3, marginTop: 3 }}>
          <span>合計</span><span>{fmtTWD(totalTWD)}</span>
        </div>
      )}
      {!isActual && hasForeign && (
        <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>＊{RATE_NOTE}（估算）</div>
      )}
    </div>
  )
}

// ── Block：一個狀態區塊 ──────────────────────────────────────────────────────
function Block({ title, buckets, statuses, amounts, amountLabel, isActual, labelSuffix = '' }) {
  const total = statuses.reduce((s, k) => s + (buckets[k] || 0), 0)
  const segments = statuses
    .filter(s => (buckets[s] || 0) > 0)
    .map(s => ({ color: STATUS_COLOR[s] || '#94a3b8', pct: total > 0 ? (buckets[s] / total * 100) : 0 }))
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: '13px 12px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{title}</div>
      <ProgressBar segments={segments} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {statuses.map(s => {
          const cnt = buckets[s] || 0
          const pct = total > 0 ? Math.round(cnt / total * 100) : 0
          return <StatusRow key={s} label={s + labelSuffix} count={cnt} pct={pct} color={STATUS_COLOR[s] || '#94a3b8'} />
        })}
      </div>
      {amounts && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>{amountLabel}</div>
          <AmountBreakdown amounts={amounts} isActual={isActual} />
        </div>
      )}
    </div>
  )
}

// ── SectionTitle：分類標題分隔線 ─────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 2px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

// ── DateFilter ───────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function YmdSelect({ value, onChange }) {
  const [y, m, d] = value ? value.split('-') : ['', '', '']
  const thisYear = new Date().getFullYear()
  const years = []
  for (let i = thisYear; i >= thisYear - 4; i--) years.push(i)
  const sel = { padding: '7px 6px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 12, outline: 'none' }

  const emit = (ny, nm, nd) => {
    if (ny && nm && nd) onChange(`${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`)
    else onChange('')
  }
  return (
    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
      <select value={y} onChange={e => emit(e.target.value, m, d)} style={{ ...sel, flex: 1.3 }}>
        <option value="">年</option>
        {years.map(yy => <option key={yy} value={yy}>{yy}</option>)}
      </select>
      <select value={m ? String(Number(m)) : ''} onChange={e => emit(y, e.target.value, d)} style={{ ...sel, flex: 1 }}>
        <option value="">月</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(mm => <option key={mm} value={mm}>{mm}</option>)}
      </select>
      <select value={d ? String(Number(d)) : ''} onChange={e => emit(y, m, e.target.value)} style={{ ...sel, flex: 1 }}>
        <option value="">日</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(dd => <option key={dd} value={dd}>{dd}</option>)}
      </select>
    </div>
  )
}

function DateFilter({ from, to, onSet }) {
  const [custom, setCustom] = useState(false)

  const presets = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const t = fmtDate(today)
    const minus = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmtDate(d) }
    const monthStart = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1))
    return [
      { key: 'all',   label: '全部',  from: '', to: '' },
      { key: 'today', label: '今天',  from: t, to: t },
      { key: '7d',    label: '近7天', from: minus(6),  to: t },
      { key: '30d',   label: '近30天', from: minus(29), to: t },
      { key: 'month', label: '本月',  from: monthStart, to: t },
    ]
  }, [])

  const activeKey = presets.find(p => p.from === from && p.to === to)?.key
    || ((from || to) ? 'custom' : 'all')

  const chipStyle = (active) => ({
    padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--cyan)' : 'var(--border)'}`,
    background: active ? 'var(--cyan)' : 'var(--card)',
    color: active ? '#fff' : 'var(--t2)',
    fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {presets.map(p => (
          <button key={p.key} onClick={() => { onSet(p.from, p.to); setCustom(false) }} style={chipStyle(activeKey === p.key)}>
            {p.label}
          </button>
        ))}
        <button onClick={() => setCustom(c => !c)} style={chipStyle(activeKey === 'custom')}>
          自訂{activeKey === 'custom' ? `（${from || '…'}~${to || '…'}）` : ''}
        </button>
      </div>
      {custom && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', width: 28, flexShrink: 0 }}>起</span>
            <YmdSelect value={from} onChange={v => onSet(v, to)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', width: 28, flexShrink: 0 }}>迄</span>
            <YmdSelect value={to} onChange={v => onSet(from, v)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── MultiSelect ──────────────────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const label = selected.length === 0 ? placeholder
    : selected.length === options.length ? '全部' : `${selected.length} 項`
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 12, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span><span style={{ color: 'var(--t3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginTop: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cyan)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
            onClick={() => onChange(selected.length === options.length ? [] : options.map(o => o.value))}>
            {selected.length === options.length ? '取消全選' : '全選'}
          </div>
          {options.map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.includes(opt.value)}
                onChange={e => onChange(e.target.checked ? [...selected, opt.value] : selected.filter(v => v !== opt.value))} />
              <span style={{ fontSize: 12, color: 'var(--t1)' }}>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 共用 hook ─────────────────────────────────────────────────────────────────
function useDashboard(lineUserId, dateFrom, dateTo, selAccounts) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const fetch = useCallback(async () => {
    if (!lineUserId) return
    setLoading(true)
    const params = { p_line_user_id: lineUserId }
    if (dateFrom) params.p_date_from = dateFrom
    if (dateTo)   params.p_date_to   = dateTo
    if (selAccounts?.length > 0) params.p_account_codes = selAccounts.join(',')
    const { data: resp, error } = await supabase.rpc('liff_expense_dashboard', params)
    setLoading(false)
    if (error) { setData({ ok: false, error: error.message }); return }
    setData(resp)
  }, [lineUserId, dateFrom, dateTo, selAccounts])
  useEffect(() => { fetch() }, [fetch])
  return { data, loading }
}

// 頂部摘要列（老闆一眼看重點）
function SummaryBar({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
      {items.map((it, i) => (
        <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 6px', textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontSize: it.small ? 14 : 20, fontWeight: 800, color: it.color || 'var(--t1)', lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.value}</div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

// 一組 rows(含 status/count) 的統計 helper
const PENDING_STATUSES = ['申請中', '待審核', '未送核銷', '待核銷', '待處理', '處理中', '待受理', '待驗收', '驗收審核中', '申請審核中', '待確認', '草稿']
const DONE_STATUSES    = ['已核准', '已核銷', '已完成', '已關閉', '已結案']
function tallyRows(...rowLists) {
  const rows = rowLists.flat()
  const cnt = (pred) => rows.filter(pred).reduce((s, r) => s + (r.count || 0), 0)
  const total = cnt(() => true)
  return {
    total,
    pending: cnt(r => PENDING_STATUSES.includes(r.status)),
    donePct: total ? Math.round(cnt(r => DONE_STATUSES.includes(r.status)) / total * 100) : 0,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 費用 tab：費用申請 / 叫貨 / 門市報修 / 經常性費用
export function ExpenseDashboardTab({ lineUserId }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selAccounts, setSelAccounts] = useState([])
  const { data, loading } = useDashboard(lineUserId, dateFrom, dateTo, selAccounts)

  const accountOptions = useMemo(() =>
    (data?.accounts || []).map(a => ({ value: a.code, label: a.name || a.code })), [data])

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>{data?.error || '無法載入費用資料'}</div>

  // 費用申請
  const expRows        = data.exp_rows || []
  const expApplyBkts   = bucketApply(expRows)
  const expSettleBkts  = bucketSettle(expRows)
  const expApplyAmts   = sumByCurrency(expRows, 'estimated_sum', r => r.status !== '已駁回')
  const expSettleAmts  = sumByCurrency(expRows, 'actual_sum',    r => r.status === '已核銷')

  // 叫貨申請
  const orderRows      = data.order_rows || []
  const orderApplyBkts = bucketApply(orderRows)
  const orderSettleBkts = bucketSettle(orderRows)

  // 門市報修
  const repairRows     = data.repair_rows || []
  const repairBkts     = bucketRaw(repairRows)

  // 經常性費用
  const regExpRows     = data.regular_expense_rows || []
  const regExpBkts     = bucketRaw(regExpRows)
  const regExpAmts     = { TWD: regExpRows.filter(r => r.status !== '已駁回').reduce((s, r) => s + Number(r.amount_sum || 0), 0) }

  // 頂部摘要（總申請 / 待處理 / 核准率 / 本期費用估算 TWD）
  const expTally   = tallyRows(expRows, orderRows, repairRows, regExpRows)
  const expenseTWD = Object.entries(expApplyAmts).reduce((s, [c, v]) => s + toTWD(v, c), 0)
                   + Object.entries(regExpAmts).reduce((s, [c, v]) => s + toTWD(v, c), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <DateFilter from={dateFrom} to={dateTo} onSet={(f, t) => { setDateFrom(f); setDateTo(t) }} />
        </div>
        {accountOptions.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <MultiSelect options={accountOptions} selected={selAccounts} onChange={setSelAccounts} placeholder="全部科目" />
          </div>
        )}
      </div>

      <SummaryBar items={[
        { label: '總申請', value: expTally.total },
        { label: '待處理', value: expTally.pending, color: 'var(--orange)' },
        { label: '核准率', value: `${expTally.donePct}%`, color: 'var(--green)' },
        { label: '本期費用', value: `≈${fmtTWD(expenseTWD)}`, color: 'var(--cyan)', small: true },
      ]} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <SectionTitle>💰 費用申請（非經常性）</SectionTitle>
        <Block title="申請狀態" buckets={expApplyBkts}
          statuses={['申請中', '已核准', '已駁回']}
          amounts={expApplyAmts} amountLabel="預估金額（估算匯率）" isActual={false} />
        <Block title="核銷狀態" buckets={expSettleBkts}
          statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']}
          labelSuffix="(核銷)"
          amounts={expSettleAmts} amountLabel="實際金額" isActual={true} />

        <SectionTitle>🛒 叫貨申請</SectionTitle>
        <Block title="申請狀態" buckets={orderApplyBkts}
          statuses={['申請中', '已核准', '已駁回']} />
        <Block title="驗收狀態" buckets={orderSettleBkts}
          statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']}
          labelSuffix="(驗收)" />

        <SectionTitle>🔧 門市報修</SectionTitle>
        <Block title="報修狀態" buckets={repairBkts}
          statuses={['待處理', '處理中', '已完成', '已關閉']} />

        <SectionTitle>💸 經常性費用</SectionTitle>
        <Block title="費用狀態" buckets={regExpBkts}
          statuses={['待審核', '已核准', '已駁回']}
          amounts={regExpAmts} amountLabel="費用金額（TWD）" isActual={true} />

      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 非費用 tab：非費用申請 / 商品調撥 / 門市稽核
export function NonExpenseDashboardTab({ lineUserId }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { data, loading } = useDashboard(lineUserId, dateFrom, dateTo, EMPTY)

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>{data?.error || '無法載入資料'}</div>

  // 非費用申請
  const nonexpRows      = data.nonexp_rows || []
  const nonexpApplyBkts = bucketApply(nonexpRows)
  const nonexpSettleBkts = bucketSettle(nonexpRows)

  // 商品調撥
  const transferRows    = data.transfer_rows || []
  const transferBkts    = bucketRaw(transferRows)

  // 門市稽核
  const auditRows       = data.audit_rows || []
  const auditBkts       = bucketRaw(auditRows)

  // 跨部門工單
  const workOrderRows   = data.work_order_rows || []
  const workOrderBkts   = bucketRaw(workOrderRows)

  const nonTally = tallyRows(nonexpRows, transferRows, auditRows, workOrderRows)

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <DateFilter from={dateFrom} to={dateTo} onSet={(f, t) => { setDateFrom(f); setDateTo(t) }} />
      </div>

      <SummaryBar items={[
        { label: '總申請', value: nonTally.total },
        { label: '待處理', value: nonTally.pending, color: 'var(--orange)' },
        { label: '已完成率', value: `${nonTally.donePct}%`, color: 'var(--green)' },
      ]} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <SectionTitle>📋 非費用申請</SectionTitle>
        <Block title="申請狀態" buckets={nonexpApplyBkts}
          statuses={['申請中', '已核准', '已駁回']} />
        <Block title="驗收狀態" buckets={nonexpSettleBkts}
          statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']}
          labelSuffix="(驗收)" />

        <SectionTitle>📦 商品調撥</SectionTitle>
        <Block title="調撥狀態" buckets={transferBkts}
          statuses={['草稿', '申請審核中', '待驗收', '驗收審核中', '已完成', '已駁回', '已撤回']} />

        <SectionTitle>🏪 門市稽核</SectionTitle>
        <Block title="稽核狀態" buckets={auditBkts}
          statuses={['草稿', '待確認', '申請中', '已核准', '已退回']} />

        <SectionTitle>🏢 跨部門工單</SectionTitle>
        <Block title="工單狀態" buckets={workOrderBkts}
          statuses={['待受理', '處理中', '已完成', '已結案', '已退回']} />

      </div>
    </div>
  )
}
