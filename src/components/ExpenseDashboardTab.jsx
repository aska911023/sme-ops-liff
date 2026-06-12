import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// 估算匯率（TWD 為基準）
const RATES = { TWD: 1, USD: 32, JPY: 0.21, CNY: 4.4, EUR: 35 }
const RATE_NOTE = 'USD×32、JPY×0.21、CNY×4.4、EUR×35'

const toTWD  = (amt, cur) => Math.round((amt || 0) * (RATES[cur] || 1))
const fmtTWD = (n) => 'NT$' + Math.round(n).toLocaleString('zh-TW')
const fmtAmt = (n, cur) =>
  (cur === 'TWD' ? 'NT$' : cur + ' ') + (n || 0).toLocaleString('zh-TW')

// 系統狀態分桶邏輯（對齊主系統 ExpenseRequests）
const APPROVED_GROUP = ['已核准', '待核銷', '已核銷', '核銷已退回']

const STATUS_COLOR = {
  '申請中':   '#3b82f6',
  '已核准':   '#10b981',
  '已駁回':   '#ef4444',
  '未送核銷': '#f59e0b',
  '待核銷':   '#6366f1',
  '已核銷':   '#06b6d4',
  '核銷被駁回': '#ef4444',
}

// rows: [{ status, currency?, count, estimated_sum?, actual_sum? }]
// 把原始 status 彙總成「申請桶」count
function bucketApply(rows) {
  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (r.count || 0), 0)
  return {
    '申請中': sum(r => r.status === '申請中'),
    '已核准': sum(r => APPROVED_GROUP.includes(r.status)),
    '已駁回': sum(r => r.status === '已駁回'),
  }
}
// 核銷桶 count
function bucketSettle(rows) {
  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + (r.count || 0), 0)
  return {
    '未送核銷':  sum(r => r.status === '已核准'),
    '待核銷':    sum(r => r.status === '待核銷'),
    '已核銷':    sum(r => r.status === '已核銷'),
    '核銷被駁回': sum(r => r.status === '核銷已退回'),
  }
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

// rows by currency → amount breakdown
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

// ── Block：一個區塊（申請 或 核銷）──────────────────────────────────────────
function Block({ title, buckets, statuses, amounts, amountLabel, isActual }) {
  const total = statuses.reduce((s, k) => s + (buckets[k] || 0), 0)
  const segments = statuses
    .filter(s => (buckets[s] || 0) > 0)
    .map(s => ({ color: STATUS_COLOR[s], pct: total > 0 ? (buckets[s] / total * 100) : 0 }))
  return (
    <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: '13px 12px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{title}</div>
      <ProgressBar segments={segments} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {statuses.map(s => {
          const cnt = buckets[s] || 0
          const pct = total > 0 ? Math.round(cnt / total * 100) : 0
          return <StatusRow key={s} label={s} count={cnt} pct={pct} color={STATUS_COLOR[s]} />
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

// ── DateFilter ───────────────────────────────────────────────────────────────
function DateFilter({ from, to, onChange }) {
  const st = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 12, flex: 1, outline: 'none' }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="date" value={from} onChange={e => onChange('from', e.target.value)} style={st} />
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>—</span>
      <input type="date" value={to} onChange={e => onChange('to', e.target.value)} style={st} />
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
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', marginTop: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
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

// 把 rows 依幣別加總某金額欄位（只取符合 statusPred 的）
function sumByCurrency(rows, field, statusPred) {
  const out = {}
  rows.filter(statusPred).forEach(r => {
    const c = r.currency || 'TWD'
    out[c] = (out[c] || 0) + Number(r[field] || 0)
  })
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// 共用 hook：抓 dashboard 資料
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

// ════════════════════════════════════════════════════════════════════════════
// 費用 tab
export function ExpenseDashboardTab({ lineUserId }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selAccounts, setSelAccounts] = useState([])
  const { data, loading } = useDashboard(lineUserId, dateFrom, dateTo, selAccounts)

  const accountOptions = useMemo(() =>
    (data?.accounts || []).map(a => ({ value: a.code, label: a.name || a.code })), [data])

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>{data?.error || '無法載入費用資料'}</div>

  const rows = data.exp_rows || []
  const applyBuckets  = bucketApply(rows)
  const settleBuckets = bucketSettle(rows)
  // 申請金額：所有未駁回的預估（各幣別）
  const applyAmounts  = sumByCurrency(rows, 'estimated_sum', r => r.status !== '已駁回')
  // 核銷金額：已核銷的實際（各幣別）
  const settleAmounts = sumByCurrency(rows, 'actual_sum', r => r.status === '已核銷')

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <DateFilter from={dateFrom} to={dateTo} onChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)} />
        </div>
        {accountOptions.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <MultiSelect options={accountOptions} selected={selAccounts} onChange={setSelAccounts} placeholder="全部科目" />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Block title="💰 申請狀態" buckets={applyBuckets}
          statuses={['申請中', '已核准', '已駁回']}
          amounts={applyAmounts} amountLabel="預估金額（估算匯率）" isActual={false} />
        <Block title="🧾 核銷狀態" buckets={settleBuckets}
          statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']}
          amounts={settleAmounts} amountLabel="實際金額" isActual={true} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// 非費用 tab（同結構，無金額）
export function NonExpenseDashboardTab({ lineUserId }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { data, loading } = useDashboard(lineUserId, dateFrom, dateTo, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>{data?.error || '無法載入資料'}</div>

  const rows = data.nonexp_rows || []
  const applyBuckets  = bucketApply(rows)
  const settleBuckets = bucketSettle(rows)

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <DateFilter from={dateFrom} to={dateTo} onChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Block title="📋 申請狀態" buckets={applyBuckets}
          statuses={['申請中', '已核准', '已駁回']} />
        <Block title="✅ 驗收狀態" buckets={settleBuckets}
          statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']} />
      </div>
    </div>
  )
}
