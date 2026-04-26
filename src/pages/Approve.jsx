import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Check, X, Lock, ClipboardCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 把 RPC 錯誤碼轉人話
const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料，請重新綁定 LINE',
  FORBIDDEN: '你沒有權限審核這類單據',
  INVALID_TYPE: '單據類型錯誤',
  INVALID_ACTION: '動作無效',
  REASON_REQUIRED: '請填寫駁回原因',
  NOT_FOUND_OR_ALREADY_PROCESSED: '單據不存在或已被審過',
}

export default function Approve() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('task_confirmation') // task_confirmation | leave | overtime | trip | expense | correction | expense_request
  const [leaves, setLeaves] = useState([])
  const [overtimes, setOvertimes] = useState([])
  const [trips, setTrips] = useState([])
  const [expenses, setExpenses] = useState([])
  const [corrections, setCorrections] = useState([])
  const [expenseRequests, setExpenseRequests] = useState([])
  const [taskConfs, setTaskConfs] = useState([])
  const [can, setCan] = useState({ hr: false, finance: false })
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)

  const reload = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const { data, error } = await supabase.rpc('liff_list_pending_approvals', {
      p_line_user_id: lineProfile.lineUserId,
    })
    if (error) {
      console.error('load approvals', error)
      setLoading(false)
      return
    }
    setLeaves(data?.leaves || [])
    setOvertimes(data?.overtimes || [])
    setTrips(data?.trips || [])
    setExpenses(data?.expenses || [])
    setCorrections(data?.corrections || [])
    setExpenseRequests(data?.expense_requests || [])
    setTaskConfs(data?.task_confirmations || [])
    setCan(data?.can || { hr: false, finance: false })
    setLoading(false)
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  const handle = async (type, id, action) => {
    let reason = null
    if (action === 'reject') {
      const label = type === 'trip' || type === 'expense' || type === 'expense_request' ? '駁回'
                  : type === 'task_confirmation' ? '退回'
                  : '拒絕'
      reason = prompt(`請輸入${label}原因：`)
      if (reason === null) return
      if (!reason.trim()) { alert(`請填寫${label}原因`); return }
    }
    setProcessing(id)
    const { data, error } = await supabase.rpc('liff_approve_request', {
      p_line_user_id: lineProfile.lineUserId,
      p_type: type,
      p_id: id,
      p_action: action,
      p_reason: reason,
    })
    setProcessing(null)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!data?.ok) {
      alert(ERR_MSG[data?.error] || `審核失敗：${data?.error || 'unknown'}`)
      return
    }
    // RPC 回 ok 之後重抓（狀態/reject_reason/attendance 都已寫入 DB）
    reload()
  }

  const pendingLeaves = leaves.filter(l => l.status === '待審核')
  const pendingOTs = overtimes.filter(o => o.status === '待審核')
  const pendingTrips = trips.filter(t => t.status === '待審核')
  const pendingExps = expenses.filter(e => e.status === '待審核')
  const pendingCorrs = corrections.filter(c => c.status === '待審核')
  const pendingExpReqs = expenseRequests.filter(e => e.status === '申請中')
  // 任務確認：只看「執行人已標記完成、等待我簽核」的（task.status='待確認' 才是真的等我）
  const pendingTaskConfs = taskConfs.filter(tc => tc.task_status === '待確認')
  const totalPending = pendingLeaves.length + pendingOTs.length + pendingTrips.length + pendingExps.length + pendingCorrs.length + pendingExpReqs.length + pendingTaskConfs.length

  const statusBadge = (s) => s === '已核准' || s === '已核銷' ? 'badge-green' : s === '已拒絕' || s === '已駁回' ? 'badge-red' : 'badge-orange'

  // tab 對應到「需要哪個權限」
  // task_confirmation：靠 task_confirmations.approver=我 即可，不檢查 hr/finance
  const tabEnabled = {
    task_confirmation: true,
    leave: can.hr,
    overtime: can.hr,
    trip: can.hr,
    correction: can.hr,
    expense: can.finance,
    expense_request: can.finance,
  }
  const currentDisabled = !tabEnabled[tab]

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📋 審核中心</div>
        {totalPending > 0 && (
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: 'rgba(251,146,60,0.15)', color: 'var(--orange)',
          }}>
            {totalPending} 件待審
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'task_confirmation', label: '任務確認', count: pendingTaskConfs.length },
          { key: 'leave', label: '請假', count: pendingLeaves.length },
          { key: 'overtime', label: '加班', count: pendingOTs.length },
          { key: 'trip', label: '出差', count: pendingTrips.length },
          { key: 'expense', label: '報帳', count: pendingExps.length },
          { key: 'expense_request', label: '費用申請', count: pendingExpReqs.length },
          { key: 'correction', label: '補打卡', count: pendingCorrs.length },
        ].map(t => {
          const enabled = tabEnabled[t.key]
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              border: `1.5px solid ${tab === t.key ? 'var(--cyan)' : 'var(--border2)'}`,
              background: tab === t.key ? 'var(--cyan-dim)' : 'var(--card)',
              color: tab === t.key ? 'var(--cyan)' : enabled ? 'var(--t2)' : 'var(--t3)',
              cursor: 'pointer', position: 'relative', opacity: enabled ? 1 : 0.55,
            }}>
              {!enabled && <Lock size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
              {t.label}
              {enabled && t.count > 0 && (
                <span style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--orange)', color: '#fff',
                  fontSize: 11, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{t.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : currentDisabled ? (
        <div className="empty">
          <Lock size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>你的角色沒有權限審核這類單據</div>
        </div>
      ) : tab === 'task_confirmation' ? (
        <>
          {pendingTaskConfs.length === 0 ? (
            <div className="empty">
              <ClipboardCheck size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div>目前沒有等你確認的任務</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                當執行人按「完成」後，這裡才會出現
              </div>
            </div>
          ) : pendingTaskConfs.map(tc => (
            <div key={tc.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <ClipboardCheck size={14} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.task_title}</span>
                </div>
                <span className="badge badge-orange" style={{ flexShrink: 0 }}>待確認</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>
                {tc.workflow_name && <span>📋 {tc.workflow_name}</span>}
                {tc.task_assignee && <span> · 執行：{tc.task_assignee}</span>}
                {tc.task_store && <span> · 📍 {tc.task_store}</span>}
              </div>
              {tc.priority && tc.priority !== '中' && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700,
                  background: tc.priority === '高' ? 'rgba(248,113,113,0.15)' : 'var(--card)',
                  color: tc.priority === '高' ? 'var(--red)' : 'var(--t3)',
                }}>{tc.priority}優先</span>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button disabled={processing === tc.id} onClick={() => handle('task_confirmation', tc.id, 'approve')} style={{
                  flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                  background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  opacity: processing === tc.id ? 0.5 : 1,
                }}><Check size={16} /> 通過</button>
                <button disabled={processing === tc.id} onClick={() => handle('task_confirmation', tc.id, 'reject')} style={{
                  flex: 1, padding: '10px', borderRadius: 10,
                  border: '1.5px solid var(--red)', background: 'transparent',
                  color: 'var(--red)', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><X size={16} /> 退回</button>
              </div>
            </div>
          ))}
        </>
      ) : tab === 'leave' ? (
        <>
          {leaves.length === 0 ? (
            <div className="empty">尚無假單</div>
          ) : leaves.map(l => (
            <div key={l.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{l.employee}</span>
                  <span className="badge badge-cyan">{l.type}</span>
                </div>
                <span className={`badge ${statusBadge(l.status)}`}>{l.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
                {l.start_date}{l.end_date !== l.start_date ? ` ~ ${l.end_date}` : ''}
                <span style={{ marginLeft: 8, color: 'var(--t3)' }}>
                  {l.hours && l.hours < 8 ? `${l.hours}h` : `${l.days}天`}
                </span>
              </div>
              {l.reason && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{l.reason}</div>}
              {l.reject_reason && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>拒絕原因：{l.reject_reason}</div>
              )}
              {l.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === l.id} onClick={() => handle('leave', l.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === l.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === l.id} onClick={() => handle('leave', l.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 拒絕</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : tab === 'overtime' ? (
        <>
          {overtimes.length === 0 ? (
            <div className="empty">尚無加班申請</div>
          ) : overtimes.map(o => (
            <div key={o.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{o.employee}</span>
                  <span style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 700 }}>{o.hours}h</span>
                </div>
                <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>{o.date}</div>
              {o.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{o.reason}</div>}
              {o.reject_reason && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{o.reject_reason}</div>
              )}
              {o.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === o.id} onClick={() => handle('overtime', o.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === o.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === o.id} onClick={() => handle('overtime', o.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : tab === 'trip' ? (
        <>
          {trips.length === 0 ? (
            <div className="empty">尚無出差申請</div>
          ) : trips.map(t => (
            <div key={t.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{t.employee}</span>
                  <span style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600 }}>{t.destination}</span>
                </div>
                <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>{t.start_date} ~ {t.end_date}</div>
              {t.purpose && <div style={{ fontSize: 12, color: 'var(--t3)' }}>{t.purpose}</div>}
              {t.budget > 0 && <div style={{ fontSize: 12, color: 'var(--cyan)', fontWeight: 600, marginTop: 4 }}>預算：NT$ {Number(t.budget).toLocaleString()}</div>}
              {t.reject_reason && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{t.reject_reason}</div>}
              {t.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === t.id} onClick={() => handle('trip', t.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === t.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === t.id} onClick={() => handle('trip', t.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : tab === 'expense' ? (
        <>
          {expenses.length === 0 ? (
            <div className="empty">尚無報帳申請</div>
          ) : expenses.map(e => (
            <div key={e.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{e.employee}</span>
                  <span className="badge badge-cyan">{e.category}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>NT$ {Number(e.amount).toLocaleString()}</span>
                </div>
                <span className={`badge ${statusBadge(e.status)}`}>{e.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>{e.date}{e.description ? ` · ${e.description}` : ''}</div>
              {e.reject_reason && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{e.reject_reason}</div>}
              {e.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === e.id} onClick={() => handle('expense', e.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === e.id ? 0.5 : 1,
                  }}><Check size={16} /> 核銷</button>
                  <button disabled={processing === e.id} onClick={() => handle('expense', e.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : tab === 'correction' ? (
        <>
          {corrections.length === 0 ? (
            <div className="empty">尚無補打卡申請</div>
          ) : corrections.map(c => (
            <div key={c.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{c.employee}</span>
                  <span style={{ fontSize: 13, color: 'var(--t2)' }}>{c.date}</span>
                </div>
                <span className={`badge ${statusBadge(c.status)}`}>{c.status}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--cyan)', fontWeight: 600 }}>
                {c.type || '上班打卡'}：{c.correction_time || '未填'}
              </div>
              {c.reason && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>原因：{c.reason}</div>}
              {c.reject_reason && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{c.reject_reason}</div>}
              {c.status === '待審核' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === c.id} onClick={() => handle('correction', c.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === c.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准並修正</button>
                  <button disabled={processing === c.id} onClick={() => handle('correction', c.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          {expenseRequests.length === 0 ? (
            <div className="empty">尚無費用申請</div>
          ) : expenseRequests.map(er => (
            <div key={er.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{er.employee}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>
                    NT$ {Number(er.estimated_amount || 0).toLocaleString()}
                  </span>
                </div>
                <span className={`badge ${statusBadge(er.status)}`}>{er.status}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
                {er.title}
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
                  🔐 {er.chain_name}{er.chain_steps ? ` · ${er.chain_steps}` : ''}
                </div>
              )}
              {er.reject_reason && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>駁回原因：{er.reject_reason}</div>
              )}
              {er.status === '申請中' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button disabled={processing === er.id} onClick={() => handle('expense_request', er.id, 'approve')} style={{
                    flex: 3, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: processing === er.id ? 0.5 : 1,
                  }}><Check size={16} /> 核准</button>
                  <button disabled={processing === er.id} onClick={() => handle('expense_request', er.id, 'reject')} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--red)', background: 'transparent',
                    color: 'var(--red)', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}><X size={16} /> 駁回</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
