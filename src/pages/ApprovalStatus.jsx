import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, FileText, Clock, CheckCircle2, XCircle, ArrowRight, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 把 status 分到三大類：進行中 / 已通過 / 已退回
const PASS_STATUSES = ['已核准', '已核銷', '已通過']
// '已退回' = 可重送（B2）；'已拒絕' / '已駁回' = legacy 不可重送
const RESUBMIT_STATUS = '已退回'
const FAIL_STATUSES = ['已拒絕', '已駁回', '已退回']

const TYPE_META = {
  leaves:           { label: '請假',   icon: '🏖️', color: 'cyan',   rpcType: 'leave' },
  overtimes:        { label: '加班',   icon: '⏰', color: 'orange', rpcType: 'overtime' },
  trips:            { label: '出差',   icon: '🚗', color: 'purple', rpcType: 'trip' },
  expenses:         { label: '報帳',   icon: '💰', color: 'green',  rpcType: 'expense' },
  corrections:      { label: '補打卡', icon: '✏️', color: 'cyan',   rpcType: 'correction' },
  expense_requests: { label: '申請',   icon: '📝', color: 'green',  rpcType: 'expense_request' },
}

export default function ApprovalStatus() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending') // pending | passed | failed
  const [data, setData] = useState({ leaves: [], overtimes: [], trips: [], expenses: [], corrections: [], expense_requests: [] })
  const [loading, setLoading] = useState(true)
  const [resubmitting, setResubmitting] = useState(null)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const { data: rpcData, error } = await supabase.rpc('liff_list_my_submissions', {
      p_line_user_id: lineProfile.lineUserId,
    })
    if (error) {
      console.error('load my submissions', error)
      setLoading(false)
      return
    }
    setData(rpcData || { leaves: [], overtimes: [], trips: [], expenses: [], corrections: [], expense_requests: [] })
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  const handleResubmit = async (row) => {
    if (!confirm(`確定要將「${row._meta.label}」重新送審？`)) return
    setResubmitting(`${row._type}-${row.id}`)
    const { data: result, error } = await supabase.rpc('liff_resubmit_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: row._meta.rpcType,
      p_id: row.id,
      p_changes: null,
    })
    setResubmitting(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) { alert(result?.error === 'NOT_FOUND_OR_NOT_REJECTED' ? '單據已不是退回狀態' : `重送失敗：${result?.error}`); return }
    reload()
  }

  // 把所有 type 的 records 攤平成統一格式
  const flatten = () => {
    const rows = []
    Object.entries(TYPE_META).forEach(([key, meta]) => {
      ;(data[key] || []).forEach(r => {
        const status = r.status || ''
        rows.push({
          ...r,
          _type: key,
          _meta: meta,
          _status: status,
          _bucket: PASS_STATUSES.includes(status) ? 'passed'
                 : FAIL_STATUSES.includes(status) ? 'failed'
                 : 'pending',
        })
      })
    })
    rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    return rows
  }

  const allRows = flatten()
  const counts = {
    pending: allRows.filter(r => r._bucket === 'pending').length,
    passed:  allRows.filter(r => r._bucket === 'passed').length,
    failed:  allRows.filter(r => r._bucket === 'failed').length,
  }
  const visibleRows = allRows.filter(r => r._bucket === tab)

  const stColor = (s) => PASS_STATUSES.includes(s) ? 'var(--green)'
                       : FAIL_STATUSES.includes(s) ? 'var(--red)'
                       : 'var(--orange)'
  const stBg    = (s) => PASS_STATUSES.includes(s) ? 'var(--green-dim)'
                       : FAIL_STATUSES.includes(s) ? 'var(--red-dim)'
                       : 'rgba(251,146,60,0.1)'

  // 摘要行：根據 type 顯示不同欄位
  const renderSummary = (r) => {
    if (r._type === 'leaves') {
      return `${r.type || '請假'} · ${r.start_date}${r.end_date && r.end_date !== r.start_date ? ` ~ ${r.end_date}` : ''} · ${r.hours && r.hours < 8 ? `${r.hours}h` : `${r.days}天`}`
    }
    if (r._type === 'overtimes') return `${r.date} · ${r.hours}h`
    if (r._type === 'trips')     return `${r.destination || ''} · ${r.start_date} ~ ${r.end_date}`
    if (r._type === 'expenses')  return `${r.category || ''} · NT$ ${Number(r.amount || 0).toLocaleString()} · ${r.date}`
    if (r._type === 'corrections') return `${r.type || '上班打卡'} · ${r.date} · ${r.correction_time || '未填'}`
    if (r._type === 'expense_requests') return `${r.title} · NT$ ${Number(r.estimated_amount || 0).toLocaleString()}`
    return ''
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📊 我的簽核進度</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          查詢我提交過的所有單據狀態
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'pending', label: '進行中', icon: Clock,         count: counts.pending, color: 'var(--orange)' },
          { key: 'passed',  label: '已通過', icon: CheckCircle2,  count: counts.passed,  color: 'var(--green)' },
          { key: 'failed',  label: '已退回', icon: XCircle,       count: counts.failed,  color: 'var(--red)' },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '10px 6px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${tab === t.key ? t.color : 'var(--border2)'}`,
              background: tab === t.key ? `${t.color === 'var(--orange)' ? 'rgba(251,146,60,0.1)' : t.color === 'var(--green)' ? 'var(--green-dim)' : 'var(--red-dim)'}` : 'var(--card)',
              color: tab === t.key ? t.color : 'var(--t2)',
              cursor: 'pointer', position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <Icon size={16} />
              <span>{t.label}</span>
              {t.count > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 20, height: 20, borderRadius: '50%',
                  background: t.color, color: '#fff',
                  fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Quick link to Approve page */}
      <button onClick={() => navigate('/approve')} style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16,
        background: 'var(--cyan-dim)', color: 'var(--cyan)',
        border: '1.5px solid var(--cyan)', fontSize: 13, fontWeight: 700,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>👀 我要審別人的單據</span>
        <ArrowRight size={14} />
      </button>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : visibleRows.length === 0 ? (
        <div className="empty">
          <FileText size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>
            {tab === 'pending' ? '目前沒有進行中的單據' :
             tab === 'passed'  ? '尚無已通過的單據' :
                                 '尚無被退回的單據'}
          </div>
        </div>
      ) : visibleRows.map(r => (
        <div key={`${r._type}-${r.id}`} className="list-item" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 16 }}>{r._meta.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{r._meta.label}</span>
              {r.created_at && (
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>· {r.created_at.slice(0, 10)}</span>
              )}
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: stBg(r._status), color: stColor(r._status), flexShrink: 0,
            }}>{r._status}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginLeft: 24 }}>
            {renderSummary(r)}
          </div>
          {r.reject_reason && (
            <div style={{
              marginTop: 8, marginLeft: 24, padding: '10px 12px', borderRadius: 8,
              background: 'rgba(248,113,113,0.12)', border: '1.5px solid var(--red)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 3 }}>
                🔄 退回原因
              </div>
              <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {r.reject_reason}
              </div>
            </div>
          )}
          {r.approver && PASS_STATUSES.includes(r._status) && (
            <div style={{ marginTop: 4, marginLeft: 24, fontSize: 11, color: 'var(--t3)' }}>
              簽核人：{r.approver}
            </div>
          )}
          {r._status === RESUBMIT_STATUS && (
            <button
              onClick={() => handleResubmit(r)}
              disabled={resubmitting === `${r._type}-${r.id}`}
              style={{
                marginTop: 8, marginLeft: 24, padding: '8px 14px', borderRadius: 8,
                border: '1.5px solid var(--cyan)', background: 'var(--cyan-dim)',
                color: 'var(--cyan)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: resubmitting === `${r._type}-${r.id}` ? 0.5 : 1,
              }}
            >
              <RotateCcw size={12} /> 修改後重新送審
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
