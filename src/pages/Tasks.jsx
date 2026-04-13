import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronDown, ChevronRight, Check, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Tasks() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('workflow')
  const [loading, setLoading] = useState(true)

  // Workflow steps (from 流程管理)
  const [wfSteps, setWfSteps] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [checklistItems, setChecklistItems] = useState([])
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)

  // Legacy tasks
  const [tasks, setTasks] = useState([])
  const [checklists, setChecklists] = useState([])

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('workflow_steps')
        .select('*, workflow_instances(template_name, store)')
        .eq('assignee', employee.name)
        .in('status', ['待處理', '進行中'])
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('tasks').select('*').eq('assignee', employee.name).order('id', { ascending: false }),
      supabase.from('checklists').select('*').eq('assignee', employee.name).order('id', { ascending: false }),
    ]).then(([wf, t, c]) => {
      setWfSteps(wf.data || [])
      setTasks(t.data || [])
      setChecklists(c.data || [])
      setLoading(false)
    })
  }, [employee])

  // ── Workflow step handlers ──
  const handleExpand = async (step) => {
    if (expandedId === step.id) { setExpandedId(null); return }
    setExpandedId(step.id)
    setCommentText('')
    // Load linked checklist items
    const { data: links } = await supabase.from('workflow_step_checklists')
      .select('checklist_id').eq('step_id', step.id)
    if (links?.length) {
      const ids = links.map(l => l.checklist_id)
      const { data: items } = await supabase.from('checklist_items')
        .select('*').in('checklist_id', ids).order('sort_order')
      setChecklistItems(items || [])
    } else {
      setChecklistItems([])
    }
  }

  const handleComplete = async (step) => {
    const { data } = await supabase.from('workflow_steps')
      .update({ status: '已完成', completed_at: new Date().toISOString() })
      .eq('id', step.id).select().single()
    if (data) setWfSteps(prev => prev.filter(s => s.id !== step.id))
  }

  const handleToggleItem = async (item) => {
    const { data } = await supabase.from('checklist_items')
      .update({ checked: !item.checked }).eq('id', item.id).select().single()
    if (data) {
      setChecklistItems(prev => {
        const updated = prev.map(i => i.id === item.id ? data : i)
        const clItems = updated.filter(i => i.checklist_id === item.checklist_id)
        const completed = clItems.filter(i => i.checked).length
        supabase.from('checklists').update({ completed }).eq('id', item.checklist_id).then()
        return updated
      })
    }
  }

  const handleSendComment = async (stepId) => {
    if (!commentText.trim() || sending) return
    setSending(true)
    await supabase.from('workflow_step_comments').insert({
      step_id: stepId, author: employee.name, content: commentText.trim(),
    })
    setCommentText('')
    setSending(false)
  }

  // ── Legacy task handlers ──
  const handleStatusChange = async (id, status) => {
    const { data } = await supabase.from('tasks').update({ status }).eq('id', id).select().single()
    if (data) setTasks(prev => prev.map(t => t.id === id ? data : t))
  }

  const priColor = (p) => p === '高' ? 'badge-red' : p === '中' ? 'badge-orange' : 'badge-cyan'
  const statusColor = (s) => s === '已完成' ? 'var(--green)' : s === '進行中' ? 'var(--cyan)' : 'var(--t3)'
  const stepStatusColor = (s) => s === '進行中' ? '#06b6d4' : '#94a3b8'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">⚙️ 流程進度</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 4, marginBottom: 16, border: '1px solid var(--border)' }}>
        {[['workflow', `流程任務 (${wfSteps.length})`], ['tasks', '一般任務'], ['checklists', '查核清單']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            background: tab === k ? 'var(--cyan)' : 'transparent',
            color: tab === k ? '#fff' : 'var(--t3)',
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tab === 'workflow' ? (
        /* ═══ Workflow Steps Tab ═══ */
        <>
          {wfSteps.length === 0 ? (
            <div className="empty">🎉 沒有待辦流程任務</div>
          ) : wfSteps.map(step => {
            const inst = step.workflow_instances
            const isOpen = expandedId === step.id
            return (
              <div key={step.id} className="list-item" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Step header */}
                <div onClick={() => handleExpand(step)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {isOpen ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{step.title}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', paddingLeft: 20 }}>
                      {inst?.store || inst?.template_name || ''}
                      {step.due_date && <span> · 截止 {step.due_date}</span>}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: stepStatusColor(step.status) + '20',
                    color: stepStatusColor(step.status),
                  }}>{step.status}</span>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                    {/* Complete button */}
                    <button onClick={() => handleComplete(step)} style={{
                      width: '100%', padding: '11px', borderRadius: 10,
                      background: 'var(--green, #34d399)', color: '#fff', border: 'none',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Check size={16} /> 回報完成
                    </button>

                    {/* Checklist items */}
                    {checklistItems.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>
                          📋 清單 ({checklistItems.filter(i => i.checked).length}/{checklistItems.length})
                        </div>
                        {checklistItems.map(item => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                            <button onClick={() => handleToggleItem(item)} style={{
                              width: 22, height: 22, borderRadius: 5, flexShrink: 0, padding: 0,
                              border: `2px solid ${item.checked ? 'var(--green, #34d399)' : 'var(--border2)'}`,
                              background: item.checked ? 'var(--green, #34d399)' : 'transparent',
                              color: '#fff', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {item.checked && <Check size={13} />}
                            </button>
                            <span style={{
                              fontSize: 13,
                              textDecoration: item.checked ? 'line-through' : 'none',
                              color: item.checked ? 'var(--t3)' : 'var(--t1)',
                            }}>{item.title}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Comment */}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>💬 回報備註</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text" placeholder="輸入備註..."
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendComment(step.id)}
                          style={{
                            flex: 1, padding: '9px 12px', borderRadius: 8,
                            border: '1px solid var(--border2)', fontSize: 13, background: 'var(--glass)', color: 'var(--t1)', outline: 'none',
                          }}
                        />
                        <button onClick={() => handleSendComment(step.id)} disabled={sending} style={{
                          padding: '9px 12px', borderRadius: 8,
                          background: 'var(--cyan)', color: '#fff', border: 'none', cursor: 'pointer',
                        }}>
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </>
      ) : tab === 'tasks' ? (
        /* ═══ Legacy Tasks Tab ═══ */
        <>
          <div className="stat-row">
            <div className="stat-box">
              <div className="stat-num" style={{ color: 'var(--cyan)' }}>{tasks.filter(t => t.status === '進行中').length}</div>
              <div className="stat-label">進行中</div>
            </div>
            <div className="stat-box">
              <div className="stat-num" style={{ color: 'var(--green)' }}>{tasks.filter(t => t.status === '已完成').length}</div>
              <div className="stat-label">已完成</div>
            </div>
          </div>
          {tasks.length === 0 ? (
            <div className="empty">目前沒有指派給您的任務</div>
          ) : tasks.map(t => (
            <div key={t.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                    {t.workflow && <span>{t.workflow} · </span>}
                    {t.due_date && <span>截止 {t.due_date}</span>}
                  </div>
                </div>
                <span className={`badge ${priColor(t.priority)}`}>{t.priority}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['未開始', '進行中', '已完成'].map(s => (
                  <button key={s} onClick={() => handleStatusChange(t.id, s)} style={{
                    flex: 1, padding: '7px', borderRadius: 8, border: '1px solid var(--border2)',
                    background: t.status === s ? statusColor(s) : 'var(--glass)',
                    color: t.status === s ? '#fff' : 'var(--t3)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        /* ═══ Checklists Tab ═══ */
        <>
          {checklists.length === 0 ? (
            <div className="empty">目前沒有查核清單</div>
          ) : checklists.map(c => {
            const pct = c.items > 0 ? Math.round(c.completed / c.items * 100) : 0
            return (
              <div key={c.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                  <span className="badge badge-cyan">{c.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--glass)' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${pct}%`,
                      background: pct === 100 ? 'var(--green)' : pct > 50 ? 'var(--cyan)' : 'var(--orange)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--t2)', minWidth: 50, textAlign: 'right' }}>
                    {c.completed}/{c.items}
                  </span>
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
