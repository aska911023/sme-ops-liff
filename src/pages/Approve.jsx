import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Check, X, Lock, Users, Wallet, ChevronDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyApprovalEvent } from '../lib/approvalNotify'

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料，請重新綁定 LINE',
  APPLICANT_NOT_FOUND: '找不到申請人',
  ORG_MISMATCH: '不在同一組織',
  NOT_YOUR_TURN: '目前不是輪到你簽',
  NO_CHAIN_ATTACHED: '此申請沒掛簽核鏈，請通知管理員設定',
  CHAIN_STEP_NOT_FOUND: '簽核鏈步驟不存在',
  INVALID_TYPE: '單據類型錯誤',
  INVALID_ACTION: '動作無效',
  REASON_REQUIRED: '請填寫退回原因',
  NOT_FOUND_OR_ALREADY_PROCESSED: '單據不存在或已被審過',
}

// 兩大分組
const GROUPS = {
  hr: {
    label: '人事',
    icon: Users,
    color: 'cyan',
    tabs: [
      { key: 'leave',      label: '請假',   pendingStatus: '待審核' },
      { key: 'overtime',   label: '加班',   pendingStatus: '待審核' },
      { key: 'trip',       label: '出差',   pendingStatus: '待審核' },
      { key: 'correction', label: '補打卡', pendingStatus: '待審核' },
    ],
  },
  finance: {
    label: '金費',
    icon: Wallet,
    color: 'green',
    tabs: [
      { key: 'expense',         label: '報帳', pendingStatus: '待審核' },
      { key: 'expense_request', label: '申請', pendingStatus: '申請中' },
    ],
  },
}

export default function Approve() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState('hr')
  const [tab, setTab] = useState('leave')
  const [data, setData] = useState({
    leaves: [], overtimes: [], trips: [], expenses: [], corrections: [], expense_requests: [],
    can: { hr: false, finance: false },
  })
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const { data: rpc, error } = await supabase.rpc('liff_list_pending_approvals', {
      p_line_user_id: lineProfile.lineUserId,
    })
    if (error) { console.error('load approvals', error); setLoading(false); return }
    setData({
      leaves:           rpc?.leaves           || [],
      overtimes:        rpc?.overtimes        || [],
      trips:            rpc?.trips            || [],
      expenses:         rpc?.expenses         || [],
      corrections:      rpc?.corrections      || [],
      expense_requests: rpc?.expense_requests || [],
      can:              rpc?.can              || { hr: false, finance: false },
    })
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  // 切到沒待辦的 tab → 自動跳到群組中第一個有待辦的
  useEffect(() => {
    if (loading) return
    const tabs = GROUPS[group].tabs
    if (!tabs.some(t => t.key === tab)) {
      setTab(tabs[0].key)
    }
  }, [group, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async (type, id, action) => {
    let reason = null
    if (action === 'reject') {
      reason = prompt('退回原因（申請人會看到，並可改後重送）：')
      if (reason === null) return
      if (!reason.trim()) { alert('請填寫退回原因'); return }
    }
    setProcessing(id)
    const { data: result, error } = await supabase.rpc('liff_approve_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: type, p_id: id, p_action: action, p_reason: reason,
    })
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) {
      alert(ERR_MSG[result?.error] || `審核失敗：${result?.error || 'unknown'}`)
      return
    }
    // ★ 推 LINE 通知
    notifyApprovalEvent({ type, action, result }).catch(err => console.warn('notify failed', err))
    reload()
  }

  // tab 對應計數
  const counts = {
    leave:           data.leaves.filter(l => l.status === '待審核').length,
    overtime:        data.overtimes.filter(o => o.status === '待審核').length,
    trip:            data.trips.filter(t => t.status === '待審核').length,
    correction:      data.corrections.filter(c => c.status === '待審核').length,
    expense:         data.expenses.filter(e => e.status === '待審核').length,
    expense_request: data.expense_requests.filter(e => e.status === '申請中').length,
  }
  const groupCounts = {
    hr:      GROUPS.hr.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
    finance: GROUPS.finance.tabs.reduce((sum, t) => sum + (counts[t.key] || 0), 0),
  }
  const totalPending = groupCounts.hr + groupCounts.finance

  const statusBadge = (s) => s === '已核准' || s === '已核銷' ? 'badge-green' : s === '已退回' ? 'badge-red' : 'badge-orange'
  const groupEnabled = { hr: data.can.hr, finance: data.can.finance }
  const tabEnabled = (k) =>
    ['leave','overtime','trip','correction'].includes(k) ? data.can.hr :
    ['expense','expense_request'].includes(k) ? data.can.finance : false

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 簽核中心</div>
        {totalPending > 0 && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
          }}>{totalPending} 件待審</span>
        )}
      </div>

      {/* ── Group toggle (人事 / 金費) ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Object.entries(GROUPS).map(([key, g]) => {
          const Icon = g.icon
          const active = group === key
          const enabled = groupEnabled[key]
          const count = groupCounts[key]
          return (
            <button key={key} onClick={() => setTab(g.tabs[0].key) || setGroup(key)} style={{
              flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
              border: `2px solid ${active ? `var(--${g.color})` : 'var(--border2)'}`,
              background: active ? `var(--${g.color}-dim)` : 'var(--card)',
              color: active ? `var(--${g.color})` : enabled ? 'var(--t1)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: enabled ? 1 : 0.55,
            }}>
              {!enabled && <Lock size={12} />}
              <Icon size={16} /> {g.label}
              {enabled && count > 0 && (
                <span style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--orange)', color: '#fff',
                  fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Sub-tabs (in current group) ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {GROUPS[group].tabs.map(t => {
          const enabled = tabEnabled(t.key)
          const count = counts[t.key] || 0
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '8px 6px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${tab === t.key ? 'var(--cyan)' : 'var(--border2)'}`,
              background: tab === t.key ? 'var(--cyan-dim)' : 'var(--card)',
              color: tab === t.key ? 'var(--cyan)' : enabled ? 'var(--t2)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative', opacity: enabled ? 1 : 0.55,
            }}>
              {t.label}
              {enabled && count > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9,
                  background: 'var(--orange)', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : !groupEnabled[group] ? (
        <div className="empty">
          <Lock size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>你的角色沒有權限審核此類單據</div>
        </div>
      ) : (
        renderTab(tab, data, processing, handle, statusBadge)
      )}
    </div>
  )
}

function renderTab(tab, data, processing, handle, statusBadge) {
  const empty = (msg) => <div className="empty">{msg}</div>

  if (tab === 'leave') {
    if (data.leaves.length === 0) return empty('沒有等你審的請假單')
    return data.leaves.map(l => (
      <Row key={l.id} item={l} type="leave" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
            <span className="badge badge-cyan" style={{ marginRight: 6 }}>{l.type}</span>
            {l.start_date}{l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
            <span style={{ marginLeft: 8, color: 'var(--t3)' }}>
              {l.hours && l.hours < 8 ? `${l.hours}h` : `${l.days}天`}
            </span>
          </div>
          {l.reason && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{l.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'overtime') {
    if (data.overtimes.length === 0) return empty('沒有等你審的加班單')
    return data.overtimes.map(o => (
      <Row key={o.id} item={o} type="overtime" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            {o.date} · <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{o.hours}h</span>
          </div>
          {o.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{o.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'trip') {
    if (data.trips.length === 0) return empty('沒有等你審的出差單')
    return data.trips.map(t => (
      <Row key={t.id} item={t} type="trip" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{t.destination}</span>
            <span> · {t.start_date} ~ {t.end_date}</span>
          </div>
          {t.purpose && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{t.purpose}</div>}
          {t.budget > 0 && <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginTop: 4 }}>預算：NT$ {Number(t.budget).toLocaleString()}</div>}
        </>}
      />
    ))
  }
  if (tab === 'correction') {
    if (data.corrections.length === 0) return empty('沒有等你審的補打卡單')
    return data.corrections.map(c => (
      <Row key={c.id} item={c} type="correction" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核准並修正"
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>{c.date}</div>
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600, marginTop: 2 }}>
            {c.type || '上班打卡'}：{c.correction_time || '未填'}
          </div>
          {c.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{c.reason}</div>}
        </>}
      />
    ))
  }
  if (tab === 'expense') {
    if (data.expenses.length === 0) return empty('沒有等你審的報帳單')
    return data.expenses.map(e => (
      <Row key={e.id} item={e} type="expense" processing={processing} handle={handle} statusBadge={statusBadge}
        approveLabel="核銷"
        body={<>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>
            <span className="badge badge-cyan" style={{ marginRight: 6 }}>{e.category}</span>
            <span style={{ fontWeight: 700 }}>NT$ {Number(e.amount).toLocaleString()}</span>
            <span style={{ color: 'var(--t3)' }}> · {e.date}</span>
          </div>
          {e.description && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{e.description}</div>}
        </>}
      />
    ))
  }
  if (tab === 'expense_request') {
    if (data.expense_requests.length === 0) return empty('沒有等你審的申請單')
    return data.expense_requests.map(er => (
      <Row key={er.id} item={er} type="expense_request" processing={processing} handle={handle} statusBadge={statusBadge}
        body={<>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{er.title}</div>
          <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700, marginBottom: 4 }}>
            NT$ {Number(er.estimated_amount || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>
            {er.account_name && <span>{er.account_name} · </span>}
            {er.department && <span>{er.department} · </span>}
            {er.store && <span>{er.store}</span>}
          </div>
          {er.description && (
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{er.description}</div>
          )}
          {er.chain_name && (
            <div style={{
              marginTop: 6, padding: '4px 8px', borderRadius: 6,
              background: 'var(--purple-dim)', color: 'var(--purple)',
              fontSize: 11, fontWeight: 600,
            }}>
              🔐 {er.chain_name} · 第 {er.current_step + 1} / {er.chain_total_steps} 關（{er.current_step_target || er.current_step_label || '—'}）
            </div>
          )}
        </>}
      />
    ))
  }
  return null
}

function Row({ item, type, processing, handle, statusBadge, body, approveLabel = '核准' }) {
  const [expanded, setExpanded] = useState(false)
  const isPending = item.status === '待審核' || item.status === '申請中'

  // 動態欄位：展開時顯示
  const detailFields = []
  if (item.created_at)   detailFields.push(['提交時間', item.created_at.replace('T', ' ').slice(0, 16)])
  if (item.department)   detailFields.push(['部門', item.department])
  if (item.store)        detailFields.push(['門市', item.store])
  if (item.start_date)   detailFields.push(['起始日', item.start_date])
  if (item.end_date && item.end_date !== item.start_date) detailFields.push(['結束日', item.end_date])
  if (item.date)         detailFields.push(['日期', item.date])
  if (item.hours)        detailFields.push(['時數', `${item.hours} 小時`])
  if (item.days)         detailFields.push(['天數', `${item.days} 天`])
  if (item.type)         detailFields.push(['類型', item.type])
  if (item.destination)  detailFields.push(['出差地', item.destination])
  if (item.budget)       detailFields.push(['預算', `NT$ ${Number(item.budget).toLocaleString()}`])
  if (item.amount)       detailFields.push(['金額', `NT$ ${Number(item.amount).toLocaleString()}`])
  if (item.estimated_amount) detailFields.push(['預估金額', `NT$ ${Number(item.estimated_amount).toLocaleString()}`])
  if (item.account_code) detailFields.push(['會計科目', `${item.account_code} ${item.account_name || ''}`])
  if (item.category)     detailFields.push(['類別', item.category])
  if (item.correction_time) detailFields.push(['補卡時間', item.correction_time])
  if (item.purpose)      detailFields.push(['出差目的', item.purpose])
  if (item.reason)       detailFields.push(['原因', item.reason])
  if (item.description)  detailFields.push(['說明', item.description])
  if (item.chain_name)   detailFields.push(['簽核鏈', `${item.chain_name} (第 ${(item.current_step ?? 0) + 1}/${item.chain_total_steps} 關)`])

  return (
    <div className="list-item" style={{
      borderLeft: item.status === '已退回' ? '3px solid var(--red)' : undefined,
    }}>
      {/* Header (clickable to expand) */}
      <div onClick={() => setExpanded(s => !s)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ fontSize: 15, fontWeight: 800 }}>{item.employee}</span>
          </div>
          <span className={`badge ${statusBadge(item.status)}`}>{item.status}</span>
        </div>
        {body}
      </div>

      {/* 退回原因（明顯） */}
      {item.reject_reason && (
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.12)', border: '1px solid var(--red)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 2 }}>
            🔄 退回原因
          </div>
          <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap' }}>
            {item.reject_reason}
          </div>
        </div>
      )}

      {/* 展開詳細 */}
      {expanded && detailFields.length > 0 && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 8,
          background: 'var(--card)', border: '1px solid var(--border2)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>📄 完整資訊</div>
          {detailFields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px dashed var(--border2)' }}>
              <span style={{ color: 'var(--t3)', minWidth: 70, flexShrink: 0 }}>{k}</span>
              <span style={{ color: 'var(--t1)', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {isPending && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button disabled={processing === item.id} onClick={() => handle(type, item.id, 'approve')} style={{
            flex: 3, padding: '10px', borderRadius: 10, border: 'none',
            background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: processing === item.id ? 0.5 : 1,
          }}><Check size={16} /> {approveLabel}</button>
          <button disabled={processing === item.id} onClick={() => handle(type, item.id, 'reject')} style={{
            flex: 1, padding: '10px', borderRadius: 10,
            border: '1.5px solid var(--red)', background: 'transparent',
            color: 'var(--red)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}><X size={16} /> 退回</button>
        </div>
      )}
    </div>
  )
}
