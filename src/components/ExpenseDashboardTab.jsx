import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// 估算匯率（TWD 為基準）
const RATES = { TWD: 1, USD: 32, JPY: 0.21, CNY: 4.4, EUR: 35 }
const RATE_NOTE = 'USD×32、JPY×0.21、CNY×4.4、EUR×35'
const CURRENCIES = ['TWD', 'USD', 'JPY', 'CNY', 'EUR']

const toTWD = (amount, currency) =>
  Math.round((amount || 0) * (RATES[currency] || 1))

const fmtTWD = (n) =>
  'NT$' + Math.round(n).toLocaleString('zh-TW')

const fmtAmt = (n, currency) =>
  (currency === 'TWD' ? 'NT$' : currency + ' ') +
  (n || 0).toLocaleString('zh-TW', { minimumFractionDigits: currency === 'JPY' ? 0 : 0 })

// ── ProgressBar ──────────────────────────────────────────────────────────────
function ProgressBar({ segments }) {
  // segments: [{ color, pct, label }]
  return (
    <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', display: 'flex' }}>
      {segments.map((s, i) => (
        <div key={i} style={{
          width: `${s.pct}%`, height: '100%',
          background: s.color,
          transition: 'width 0.5s',
        }} />
      ))}
    </div>
  )
}

// ── StatusChip ────────────────────────────────────────────────────────────────
function StatusChip({ label, count, pct, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginLeft: 'auto' }}>
        {count}筆
      </span>
      <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 36, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

// ── CurrencyBreakdown ─────────────────────────────────────────────────────────
function CurrencyBreakdown({ rows, field, isActual = false }) {
  const byC = {}
  rows.forEach(r => {
    const key = r.currency || 'TWD'
    byC[key] = (byC[key] || 0) + (r[field] || 0)
  })
  const entries = Object.entries(byC).filter(([, v]) => v > 0)
  if (!entries.length) return null
  const totalTWD = entries.reduce((s, [c, v]) => s + toTWD(v, c), 0)
  return (
    <div style={{ marginTop: 8 }}>
      {entries.map(([c, v]) => (
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t2)', marginBottom: 2 }}>
          <span>{c}</span>
          <span>{fmtAmt(v, c)}{c !== 'TWD' ? <span style={{ color: 'var(--t3)', marginLeft: 4 }}>≈{fmtTWD(toTWD(v, c))}</span> : ''}</span>
        </div>
      ))}
      {entries.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--t1)', borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
          <span>合計（TWD）</span>
          <span>{fmtTWD(totalTWD)}</span>
        </div>
      )}
      {!isActual && entries.some(([c]) => c !== 'TWD') && (
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
          ＊{RATE_NOTE}（估算）
        </div>
      )}
    </div>
  )
}

// ── Block ─────────────────────────────────────────────────────────────────────
function Block({ title, statuses, rows, amountField, isActual, showAmount }) {
  const STATUS_CONFIG = {
    '申請中':   { color: '#3b82f6' },
    '已核准':   { color: '#10b981' },
    '已駁回':   { color: '#ef4444' },
    '未送核銷': { color: '#f59e0b' },
    '待核銷':   { color: '#6366f1' },
    '已核銷':   { color: '#10b981' },
    '核銷被駁回': { color: '#ef4444' },
  }

  const countByStatus = {}
  statuses.forEach(s => {
    const key = rows[0]?.settle_label !== undefined ? 'settle_label' : 'status'
    countByStatus[s] = rows.filter(r => r[key] === s).reduce((acc, r) => acc + (r.count || 0), 0)
  })
  const total = statuses.reduce((s, k) => s + (countByStatus[k] || 0), 0)

  const segments = statuses.map(s => ({
    color: STATUS_CONFIG[s]?.color || '#888',
    pct: total > 0 ? Math.round((countByStatus[s] || 0) / total * 100) : 0,
  }))

  const field = amountField

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12,
      border: '1px solid var(--border)', padding: '14px 14px 12px', marginBottom: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>{title}</div>
      <ProgressBar segments={segments} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {statuses.map(s => {
          const cnt = countByStatus[s] || 0
          const pct = total > 0 ? Math.round(cnt / total * 100) : 0
          return (
            <StatusChip
              key={s}
              label={s}
              count={cnt}
              pct={pct}
              color={STATUS_CONFIG[s]?.color || '#888'}
            />
          )
        })}
      </div>
      {showAmount && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>
            {isActual ? '實際金額' : '預估金額（估算匯率）'}
          </div>
          <CurrencyBreakdown rows={rows} field={field} isActual={isActual} />
        </div>
      )}
    </div>
  )
}

// ── DateFilter ────────────────────────────────────────────────────────────────
function DateFilter({ from, to, onChange }) {
  const inputStyle = {
    padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--card)',
    color: 'var(--t1)', fontSize: 12, flex: 1, outline: 'none',
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="date" value={from} onChange={e => onChange('from', e.target.value)} style={inputStyle} />
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>—</span>
      <input type="date" value={to} onChange={e => onChange('to', e.target.value)} style={inputStyle} />
    </div>
  )
}

// ── MultiSelect ───────────────────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const label = selected.length === 0
    ? placeholder
    : selected.length === options.length
      ? '全部'
      : `${selected.length} 項`
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '7px 10px',
          borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--card)', color: 'var(--t1)', fontSize: 12,
          textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--t3)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, maxHeight: 180, overflowY: 'auto', marginTop: 2,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          <div
            style={{ padding: '8px 12px', fontSize: 12, color: 'var(--cyan)', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
            onClick={() => onChange(selected.length === options.length ? [] : options.map(o => o.value))}
          >
            {selected.length === options.length ? '取消全選' : '全選'}
          </div>
          {options.map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={e => onChange(e.target.checked
                  ? [...selected, opt.value]
                  : selected.filter(v => v !== opt.value)
                )}
              />
              <span style={{ fontSize: 12, color: 'var(--t1)' }}>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ExpenseDashboardTab
// ════════════════════════════════════════════════════════════════════════════
export function ExpenseDashboardTab({ lineUserId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selAccounts, setSelAccounts] = useState([])

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: resp } = await supabase.rpc('liff_expense_dashboard', {
      p_line_user_id: lineUserId,
      p_date_from: dateFrom || null,
      p_date_to:   dateTo   || null,
      p_account_codes: selAccounts.length > 0 ? selAccounts : null,
      p_template_ids: null,
    })
    setLoading(false)
    setData(resp)
  }, [lineUserId, dateFrom, dateTo, selAccounts])

  useEffect(() => { fetch() }, [fetch])

  const accountOptions = useMemo(() =>
    (data?.accounts || []).map(a => ({ value: a.code, label: a.name || a.code })),
    [data]
  )

  const expenseRows = data?.expense_rows || []
  const settleRows  = data?.settle_rows  || []

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>無法載入費用資料</div>

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <DateFilter
          from={dateFrom} to={dateTo}
          onChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        />
        {accountOptions.length > 0 && (
          <MultiSelect
            options={accountOptions}
            selected={selAccounts}
            onChange={setSelAccounts}
            placeholder="全部科目"
          />
        )}
      </div>

      {/* 申請狀態 block */}
      <Block
        title="💰 申請狀態"
        statuses={['申請中', '已核准', '已駁回']}
        rows={expenseRows}
        amountField="estimated_sum"
        isActual={false}
        showAmount={true}
      />

      {/* 核銷狀態 block */}
      <Block
        title="🧾 核銷狀態"
        statuses={['未送核銷', '待核銷', '已核銷', '核銷被駁回']}
        rows={settleRows.map(r => ({ ...r, status: r.settle_label }))}
        amountField="actual_sum"
        isActual={true}
        showAmount={true}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// NonExpenseDashboardTab
// ════════════════════════════════════════════════════════════════════════════
export function NonExpenseDashboardTab({ lineUserId }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [selTemplates, setSelTemplates] = useState([])

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: resp } = await supabase.rpc('liff_expense_dashboard', {
      p_line_user_id: lineUserId,
      p_date_from:    dateFrom || null,
      p_date_to:      dateTo   || null,
      p_account_codes: null,
      p_template_ids: selTemplates.length > 0 ? selTemplates : null,
    })
    setLoading(false)
    setData(resp)
  }, [lineUserId, dateFrom, dateTo, selTemplates])

  useEffect(() => { fetch() }, [fetch])

  const templateOptions = useMemo(() =>
    (data?.non_exp_templates || []).map(t => ({ value: t.id, label: t.name })),
    [data]
  )

  const rows = data?.non_exp_rows || []
  const templates = selTemplates.length > 0
    ? [...new Set(rows.filter(r => selTemplates.includes(r.template_id)).map(r => r.template_name))]
    : [...new Set(rows.map(r => r.template_name))]

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
  if (!data?.ok) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--red)', fontSize: 13 }}>無法載入資料</div>

  const STATUS_CONFIG = {
    '申請中': { color: '#3b82f6' },
    '已核准': { color: '#10b981' },
    '已駁回': { color: '#ef4444' },
  }
  const STATUSES = ['申請中', '已核准', '已駁回']

  const countByStatus = {}
  STATUSES.forEach(s => {
    countByStatus[s] = rows.filter(r => r.status === s && (templates.length === 0 || templates.includes(r.template_name))).reduce((acc, r) => acc + (r.count || 0), 0)
  })
  const total = STATUSES.reduce((s, k) => s + (countByStatus[k] || 0), 0)
  const segments = STATUSES.map(s => ({
    color: STATUS_CONFIG[s].color,
    pct: total > 0 ? Math.round((countByStatus[s] || 0) / total * 100) : 0,
  }))

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <DateFilter
          from={dateFrom} to={dateTo}
          onChange={(k, v) => k === 'from' ? setDateFrom(v) : setDateTo(v)}
        />
        {templateOptions.length > 0 && (
          <MultiSelect
            options={templateOptions}
            selected={selTemplates}
            onChange={setSelTemplates}
            placeholder="全部表單類型"
          />
        )}
      </div>

      {/* 申請狀態 block */}
      <div style={{
        background: 'var(--card)', borderRadius: 12,
        border: '1px solid var(--border)', padding: '14px 14px 12px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', marginBottom: 10 }}>📋 申請狀態</div>
        <ProgressBar segments={segments} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {STATUSES.map(s => {
            const cnt = countByStatus[s] || 0
            const pct = total > 0 ? Math.round(cnt / total * 100) : 0
            return <StatusChip key={s} label={s} count={cnt} pct={pct} color={STATUS_CONFIG[s].color} />
          })}
        </div>
        {/* Per-template breakdown */}
        {rows.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {[...new Set(rows.map(r => r.template_name))].map(tn => {
              const tnRows = rows.filter(r => r.template_name === tn)
              const tnTotal = tnRows.reduce((s, r) => s + r.count, 0)
              return (
                <div key={tn} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>{tn}</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {STATUSES.map(s => {
                      const r = tnRows.find(r => r.status === s)
                      return r ? (
                        <span key={s} style={{ fontSize: 11, color: STATUS_CONFIG[s].color }}>
                          {s} {r.count}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
