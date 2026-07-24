import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, RefreshCw, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import ActivityTimeline from '../components/ActivityTimeline'
import { ExpenseDashboardTab, NonExpenseDashboardTab } from '../components/ExpenseDashboardTab'
import HrDashboardTab from '../components/HrDashboardTab'

const STATUS = {
  RUNNING: '進行中', COMPLETED: '已完成', PAUSED: '暫停',
  PENDING: '待處理', NOT_STARTED: '未開始', BLOCKED: '已擱置', CANCELLED: '已取消',
}

export default function Dashboard() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [selectedStore, setSelectedStore] = useState('all')
  const [activityPeriod, setActivityPeriod] = useState('today')
  const [expandedInstanceId, setExpandedInstanceId] = useState(null)
  const [focusTab, setFocusTab] = useState('in_progress')
  const [mainTab, setMainTab] = useState('workflow') // 'workflow' | 'expense' | 'non_expense'

  const load = useCallback(async () => {
    if (!lineProfile?.lineUserId) return
    const { data: resp, error: err } = await supabase.rpc('liff_list_dashboard', {
      p_line_user_id: lineProfile.lineUserId,
      p_days: 30,
    })
    setLoading(false)
    setRefreshing(false)
    if (err) { setError('系統錯誤：' + err.message); return }
    if (!resp?.ok) {
      setError(resp?.error === 'FORBIDDEN' ? '你的角色沒有權限查看儀表板' : resp?.error || '載入失敗')
      return
    }
    setError(null)
    setData(resp)
    setLastRefresh(new Date())
  }, [lineProfile?.lineUserId])

  useEffect(() => { load() }, [load])

  const handleRefresh = () => {
    setRefreshing(true)
    load()
  }

  // ── derived ──
  const matchesStore = useCallback((row) => {
    if (selectedStore === 'all') return true
    return row.store === selectedStore
  }, [selectedStore])

  const stepsByInstance = useMemo(() => {
    const map = new Map()
    ;(data?.instance_tasks || []).forEach(s => {
      if (!map.has(s.workflow_instance_id)) map.set(s.workflow_instance_id, [])
      map.get(s.workflow_instance_id).push(s)
    })
    return map
  }, [data?.instance_tasks])

  const filteredInstances = useMemo(() => (
    (data?.instances || [])
      .filter(matchesStore)
      .map(inst => ({ ...inst, steps: stepsByInstance.get(inst.id) || [] }))
  ), [data?.instances, matchesStore, stepsByInstance])

  const filteredSteps = useMemo(() => (
    (data?.instance_tasks || []).filter(matchesStore)
  ), [data?.instance_tasks, matchesStore])

  const wfStat = useMemo(() => ({
    total: filteredInstances.length,
    running: filteredInstances.filter(i => i.status === STATUS.RUNNING).length,
    completed: filteredInstances.filter(i => i.status === STATUS.COMPLETED).length,
  }), [filteredInstances])

  const stepStat = useMemo(() => {
    const now = new Date()
    return {
      total: filteredSteps.length,
      pending: filteredSteps.filter(s => s.status === STATUS.PENDING || s.status === STATUS.NOT_STARTED).length,
      in_progress: filteredSteps.filter(s => s.status === STATUS.RUNNING).length,
      completed: filteredSteps.filter(s => s.status === STATUS.COMPLETED).length,
      blocked: filteredSteps.filter(s => s.status === STATUS.BLOCKED).length,
      overdue: filteredSteps.filter(s => s.due_date && s.status !== STATUS.COMPLETED && s.status !== STATUS.CANCELLED && new Date(s.due_date) < now).length,
    }
  }, [filteredSteps])

  const runningInstances = useMemo(
    () => filteredInstances.filter(i => i.status === STATUS.RUNNING).slice(0, 20),
    [filteredInstances]
  )

  const { inProgressList, overdueList } = useMemo(() => {
    const now = new Date()
    const inProg = filteredSteps
      .filter(s => s.status === STATUS.RUNNING)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const over = filteredSteps
      .filter(s => s.status !== STATUS.COMPLETED && s.status !== STATUS.CANCELLED && s.due_date && new Date(s.due_date) < now)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    return { inProgressList: inProg, overdueList: over }
  }, [filteredSteps])

  const activity = useMemo(() => {
    if (!data) return []
    const now = new Date()
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const cutoff = activityPeriod === 'today'
      ? todayStart
      : new Date(now.getTime() - (activityPeriod === '7days' ? 7 : 30) * 86400000)
    const sameDay = activityPeriod === 'today'

    const fmt = (d) => sameDay
      ? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })

    const stepEvents = filteredSteps.flatMap(s => {
      const events = []
      const created = new Date(s.created_at)
      if (created >= cutoff) {
        events.push({
          id: `s-c-${s.id}`, _ts: created.getTime(), time: fmt(created),
          title: s.title, storeName: s.store || '',
          type: s.status === STATUS.BLOCKED ? 'blocked' : 'created',
        })
      }
      if (s.completed_at) {
        const completed = new Date(s.completed_at)
        if (completed >= cutoff) {
          events.push({
            id: `s-d-${s.id}`, _ts: completed.getTime(), time: fmt(completed),
            title: s.title, storeName: s.store || '', type: 'completed',
          })
        }
      }
      return events
    })

    const taskEvents = (data.standalone_tasks || [])
      .filter(t => selectedStore === 'all' && new Date(t.created_at) >= cutoff)
      .map(t => ({
        id: `t-${t.id}`, _ts: new Date(t.created_at).getTime(),
        time: fmt(new Date(t.created_at)),
        title: t.title, storeName: '',
        type: t.status === STATUS.COMPLETED ? 'completed'
          : t.status === STATUS.BLOCKED ? 'blocked' : 'created',
      }))

    return [...stepEvents, ...taskEvents]
      .sort((a, b) => b._ts - a._ts)
      .slice(0, sameDay ? 10 : 30)
  }, [filteredSteps, data, activityPeriod, selectedStore])

  // ── render guards ──
  if (loading) {
    return (
      <div className="page">
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
        <div className="empty">
          <Lock size={20} style={{ marginBottom: 8, opacity: 0.6 }} />
          <div>{error}</div>
        </div>
      </div>
    )
  }

  const overallPct = stepStat.total > 0
    ? Math.round((stepStat.completed / stepStat.total) * 100)
    : 0

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>

      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="header-title">📊 儀表板</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {data?.employee_name ? `${data.employee_name}，` : ''}流程、費用與非費用申請概況
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: '8px 12px', borderRadius: 20,
            background: 'var(--glass)', border: '1px solid var(--border2)',
            color: 'var(--cyan)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            opacity: refreshing ? 0.6 : 1,
          }}
        >
          <RefreshCw size={13} style={{
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
          }} />
          {refreshing ? '更新中' : '重新整理'}
        </button>
      </div>

      {/* Main tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4 }}>
        {[
          { key: 'workflow',    label: '工作流程' },
          { key: 'hr',          label: '人力' },
          { key: 'expense',     label: '費用' },
          { key: 'non_expense', label: '非費用' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            style={{
              flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none',
              background: mainTab === t.key ? 'var(--cyan)' : 'transparent',
              color: mainTab === t.key ? '#fff' : 'var(--t2)',
              fontSize: 12, fontWeight: mainTab === t.key ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'hr' && (
        <HrDashboardTab lineUserId={lineProfile?.lineUserId} />
      )}
      {mainTab === 'expense' && (
        <ExpenseDashboardTab lineUserId={lineProfile?.lineUserId} />
      )}
      {mainTab === 'non_expense' && (
        <NonExpenseDashboardTab lineUserId={lineProfile?.lineUserId} />
      )}

      {mainTab === 'workflow' && <>

      {/* Overall progress */}
      <div className="list-item" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>
          <span>整體任務完成率</span>
          <span style={{ fontWeight: 800, color: 'var(--t1)' }}>{overallPct}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--border)' }}>
          <div style={{
            height: '100%', borderRadius: 99, width: `${overallPct}%`,
            background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)',
            transition: 'width 0.6s',
          }} />
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <SummaryCard val={wfStat.running} label="進行中流程" color="var(--blue)" sub={`${wfStat.total} 總計`} />
        <SummaryCard val={stepStat.in_progress} label="進行中任務" color="var(--cyan)" />
        <SummaryCard val={stepStat.pending} label="待處理任務" color="var(--orange)" sub={`${stepStat.total} 總計`} />
        <SummaryCard val={stepStat.overdue} label="逾期任務" color="var(--red)" />
      </div>

      {/* Store filter */}
      {data?.stores?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--t1)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value="all">🏢 全部門市</option>
            {data.stores.map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
          </select>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: 'var(--t3)' }}>
              {lastRefresh.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 更新
            </span>
          )}
        </div>
      )}

      {/* Active workflows */}
      <div className="list-item" style={{ padding: 0, marginBottom: 12 }}>
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🔄 進行中流程</span>
          {runningInstances.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{runningInstances.length}</span>
          )}
        </div>
        <div style={{ padding: '10px 14px' }}>
          {runningInstances.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t3)', fontSize: 13 }}>
              目前沒有進行中的流程
            </div>
          ) : runningInstances.map(inst => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              expanded={expandedInstanceId === inst.id}
              onToggle={() => setExpandedInstanceId(expandedInstanceId === inst.id ? null : inst.id)}
            />
          ))}
        </div>
      </div>

      {/* In-progress / Overdue tabs */}
      {(inProgressList.length > 0 || overdueList.length > 0) && (
        <div className="list-item" style={{ padding: 0, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, padding: '12px 14px 4px' }}>
            {[
              { key: 'in_progress', label: '🔄 進行中', count: inProgressList.length, color: 'var(--blue)' },
              { key: 'overdue', label: '❗ 逾期', count: overdueList.length, color: 'var(--red)' },
            ].map(t => {
              const active = focusTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setFocusTab(t.key)}
                  style={{
                    flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 700,
                    borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${active ? t.color : 'var(--border2)'}`,
                    background: active ? (t.key === 'in_progress' ? 'var(--blue-dim)' : 'var(--red-dim)') : 'transparent',
                    color: active ? t.color : 'var(--t3)',
                  }}
                >
                  {t.label} <span style={{ opacity: 0.75, marginLeft: 4 }}>{t.count}</span>
                </button>
              )
            })}
          </div>
          <div style={{ padding: '10px 14px' }}>
            <FocusList list={focusTab === 'in_progress' ? inProgressList : overdueList} isOverdueTab={focusTab === 'overdue'} />
          </div>
        </div>
      )}

      {/* Activity timeline */}
      <ActivityTimeline activity={activity} period={activityPeriod} onPeriodChange={setActivityPeriod} />

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </>}

    </div>
  )
}

function SummaryCard({ val, label, color, sub }) {
  return (
    <div className="list-item" style={{ padding: '12px 6px', textAlign: 'center', margin: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function InstanceCard({ instance, expanded, onToggle }) {
  const now = new Date()
  const steps = instance.steps || []
  const total = steps.length
  const completed = steps.filter(s => s.status === STATUS.COMPLETED).length
  const inProgress = steps.filter(s => s.status === STATUS.RUNNING).length
  const blocked = steps.filter(s => s.status === STATUS.BLOCKED).length
  const overdueCount = steps.filter(s =>
    s.status !== STATUS.COMPLETED && s.status !== STATUS.CANCELLED &&
    s.due_date && new Date(s.due_date) < now
  ).length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const pctColor = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--orange)' : 'var(--red)'
  const inProgressSteps = steps.filter(s => s.status === STATUS.RUNNING)

  return (
    <div
      onClick={onToggle}
      style={{
        padding: '10px 12px', marginBottom: 8, borderRadius: 10,
        background: 'var(--glass)',
        border: `1px solid ${expanded ? 'var(--cyan)' : 'var(--border2)'}`,
        cursor: 'pointer', transition: 'border 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{
            fontSize: 10, color: 'var(--t3)', flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
          }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {instance.template_name}
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: pctColor, flexShrink: 0 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: pctColor, transition: 'width 0.6s' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11 }}>
        <span style={{ color: 'var(--green)', fontWeight: 600 }}>✅ {completed}/{total}</span>
        {inProgress > 0 && <span style={{ color: 'var(--blue)', fontWeight: 600 }}>🔄 {inProgress}</span>}
        {blocked > 0 && <span style={{ color: 'var(--orange)', fontWeight: 600 }}>🟠 {blocked}</span>}
        {overdueCount > 0 && (
          <span style={{
            padding: '1px 8px', borderRadius: 99, fontWeight: 700,
            background: 'var(--red-dim)', color: 'var(--red)',
          }}>❗ 逾期 {overdueCount}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
          {new Date(instance.started_at).toLocaleDateString('zh-TW')}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 6 }}>
            🔄 進行中任務 ({inProgressSteps.length})
          </div>
          {inProgressSteps.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>目前無進行中任務</div>
          ) : inProgressSteps.map(s => {
            const stepOverdue = s.due_date && new Date(s.due_date) < new Date()
            return (
              <div key={s.id} style={{
                padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                background: 'var(--blue-dim)', borderLeft: '2px solid var(--blue)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{s.title}</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--t3)' }}>
                  <span>👤 {s.assignee || '未指派'}</span>
                  {s.due_date && (
                    <span style={{ color: stepOverdue ? 'var(--red)' : 'var(--t3)', fontWeight: stepOverdue ? 700 : 400 }}>
                      📅 {new Date(s.due_date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                      {stepOverdue ? ' 逾期' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FocusList({ list, isOverdueTab }) {
  if (list.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t3)', fontSize: 13 }}>
        {isOverdueTab ? '✓ 沒有逾期任務' : '目前無進行中任務'}
      </div>
    )
  }
  const color = isOverdueTab ? 'var(--red)' : 'var(--blue)'
  const dim = isOverdueTab ? 'var(--red-dim)' : 'var(--blue-dim)'
  return list.slice(0, 15).map(s => {
    const overdueDays = s.due_date && new Date(s.due_date) < new Date() && s.status !== STATUS.COMPLETED && s.status !== STATUS.CANCELLED
      ? Math.max(0, Math.ceil((Date.now() - new Date(s.due_date).getTime()) / 86400000))
      : null
    return (
      <div key={s.id} style={{
        padding: '6px 10px', marginBottom: 4, borderRadius: 6,
        background: dim, borderLeft: `2px solid ${color}`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginBottom: 2 }}>{s.title}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--t3)', flexWrap: 'wrap' }}>
          <span>👤 {s.assignee || '未指派'}</span>
          {isOverdueTab ? (
            overdueDays !== null && (
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>📅 逾期 {overdueDays} 天</span>
            )
          ) : (
            <>
              {s.due_date && (
                <span>📅 {new Date(s.due_date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
              )}
              {overdueDays !== null && (
                <span style={{
                  fontSize: 9, padding: '1px 7px', borderRadius: 99, fontWeight: 700,
                  background: 'var(--red-dim)', color: 'var(--red)',
                }}>❗ 逾期 {overdueDays} 天</span>
              )}
            </>
          )}
        </div>
      </div>
    )
  })
}
