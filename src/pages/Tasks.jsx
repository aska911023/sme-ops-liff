import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronDown, ChevronRight, Check, Send, Plus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const SCOPES = [
  { key: 'active',    label: '進行中' },
  { key: 'completed', label: '已完成' },
  { key: 'all',       label: '全部' },
]

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料，請重新綁定 LINE',
  NOT_FOUND_OR_NOT_ASSIGNED: '任務不存在或不是你的',
  NOT_FOUND_OR_ALREADY_DONE: '任務不存在或已完成',
  NOT_FOUND_OR_FORBIDDEN: '沒有權限',
  ITEM_NOT_FOUND: '項目不存在',
  FORBIDDEN: '沒有權限',
  EMPTY_CONTENT: '請輸入內容',
}

const priColor = (p) => p === '高' ? 'badge-red' : p === '中' ? 'badge-orange' : 'badge-cyan'

export default function Tasks() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const scope = SCOPES.some(s => s.key === searchParams.get('filter'))
    ? searchParams.get('filter')
    : 'active'
  const deepLinkTaskId = searchParams.get('task')

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [sending, setSending] = useState(false)
  const [processing, setProcessing] = useState(null)
  const deepLinkAppliedRef = useRef(false)

  const setScope = (next) => {
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'active') nextParams.delete('filter')
    else nextParams.set('filter', next)
    setSearchParams(nextParams, { replace: true })
  }

  const loadList = useCallback(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    supabase.rpc('liff_list_my_tasks', {
      p_line_user_id: lineProfile.lineUserId,
      p_scope: scope,
    })
      .then(({ data }) => {
        setTasks(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [lineProfile?.lineUserId, scope])

  useEffect(() => { loadList() }, [loadList])

  // BOT deep-link：網址帶 ?task=<id> 就自動展開該任務（只跑一次）
  useEffect(() => {
    if (deepLinkAppliedRef.current) return
    if (!deepLinkTaskId || loading || tasks.length === 0) return
    const idNum = Number(deepLinkTaskId)
    const hit = tasks.find(t => t.id === idNum)
    if (hit) {
      deepLinkAppliedRef.current = true
      openDetail(hit)
      // 展開完把 ?task= 從 URL 拿掉，避免 refresh 又展開一次
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('task')
      setSearchParams(nextParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTaskId, loading, tasks])

  const openDetail = async (task) => {
    if (expandedId === task.id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(task.id)
    setDetail(null)
    setCommentText('')
    setDetailLoading(true)
    const { data } = await supabase.rpc('liff_get_task_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: task.id,
    })
    setDetailLoading(false)
    if (!data?.ok) { alert(ERR_MSG[data?.error] || `載入失敗：${data?.error || 'unknown'}`); return }
    setDetail(data)
  }

  const handleComplete = async (taskId) => {
    setProcessing(taskId)
    const { data } = await supabase.rpc('liff_complete_task', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: taskId,
    })
    setProcessing(null)
    if (!data?.ok) { alert(ERR_MSG[data?.error] || `完成失敗：${data?.error || 'unknown'}`); return }
    setExpandedId(null)
    setDetail(null)
    loadList()
  }

  const toggleSharedItem = async (item) => {
    const next = !item.checked
    const { data } = await supabase.rpc('liff_toggle_checklist_item', {
      p_line_user_id: lineProfile.lineUserId,
      p_item_id: item.id,
      p_checked: next,
    })
    if (!data?.ok) { alert(ERR_MSG[data?.error] || '切換失敗'); return }
    // 本地更新
    setDetail(d => ({
      ...d,
      checklists: d.checklists.map(cl => ({
        ...cl,
        items: cl.items.map(i => i.id === item.id ? { ...i, checked: next } : i),
      })),
    }))
  }

  const toggleInlineItem = async (item) => {
    const next = !item.checked
    const { data } = await supabase.rpc('liff_toggle_task_checklist_item', {
      p_line_user_id: lineProfile.lineUserId,
      p_item_id: item.id,
      p_checked: next,
    })
    if (!data?.ok) { alert(ERR_MSG[data?.error] || '切換失敗'); return }
    setDetail(d => ({
      ...d,
      inline_items: d.inline_items.map(i => i.id === item.id ? { ...i, checked: next } : i),
    }))
  }

  const sendComment = async (taskId) => {
    const content = commentText.trim()
    if (!content || sending) return
    setSending(true)
    const { data } = await supabase.rpc('liff_create_task_comment', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: taskId,
      p_content: content,
    })
    setSending(false)
    if (!data?.ok) { alert(ERR_MSG[data?.error] || '留言失敗'); return }
    setCommentText('')
    // 重抓 detail
    const { data: fresh } = await supabase.rpc('liff_get_task_detail', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: taskId,
    })
    if (fresh?.ok) setDetail(fresh)
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="header-title">⚙️ 我的任務</div>
        <button
          onClick={() => navigate('/tasks/new')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', borderRadius: 8, border: 'none',
            background: 'var(--cyan)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={14} /> 新增
        </button>
      </div>

      {/* Scope tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {SCOPES.map(s => {
          const active = scope === s.key
          return (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: `1.5px solid ${active ? 'var(--cyan)' : 'var(--border2)'}`,
                background: active ? 'var(--cyan-dim)' : 'var(--card)',
                color: active ? 'var(--cyan)' : 'var(--t2)',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tasks.length === 0 ? (
        <div className="empty">
          {scope === 'completed' ? '沒有已完成的任務' : scope === 'all' ? '尚無任務' : '🎉 目前沒有待辦任務'}
        </div>
      ) : tasks.map(t => {
        const open = expandedId === t.id
        return (
          <div key={t.id} className="list-item">
            <div onClick={() => openDetail(t)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {t.workflow && <span>{t.workflow} · </span>}
                      {t.store && <span>{t.store} · </span>}
                      {t.due_date && <span>截止 {t.due_date}</span>}
                    </div>
                  </div>
                </div>
                {t.priority && <span className={`badge ${priColor(t.priority)}`}>{t.priority}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>狀態：{t.status}</div>
            </div>

            {open && (
              <div style={{
                marginTop: 12, paddingTop: 12,
                borderTop: '1px solid var(--border2)',
              }}>
                {detailLoading || !detail ? (
                  <div className="empty" style={{ padding: '12px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto', width: 18, height: 18 }} />
                  </div>
                ) : (
                  <>
                    {/* Complete */}
                    <button
                      disabled={processing === t.id}
                      onClick={() => handleComplete(t.id)}
                      style={{
                        width: '100%', padding: '10px', borderRadius: 10,
                        border: 'none', background: 'var(--green)', color: '#fff',
                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        opacity: processing === t.id ? 0.5 : 1,
                      }}
                    >
                      <Check size={16} /> 回報完成
                    </button>

                    {/* Description */}
                    {detail.task.description && (
                      <div style={{ marginTop: 12, fontSize: 13, color: 'var(--t2)', whiteSpace: 'pre-wrap' }}>
                        {detail.task.description}
                      </div>
                    )}

                    {/* Shared Checklists */}
                    {detail.checklists.map(cl => (
                      <div key={cl.id} style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                          📋 {cl.name} ({cl.items.filter(i => i.checked).length}/{cl.items.length})
                        </div>
                        {cl.items.map(item => (
                          <ChecklistRow key={item.id} item={item} onToggle={() => toggleSharedItem(item)} />
                        ))}
                      </div>
                    ))}

                    {/* Inline items */}
                    {detail.inline_items.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                          ✅ 任務項目 ({detail.inline_items.filter(i => i.checked).length}/{detail.inline_items.length})
                        </div>
                        {detail.inline_items.map(item => (
                          <ChecklistRow key={item.id} item={item} onToggle={() => toggleInlineItem(item)} />
                        ))}
                      </div>
                    )}

                    {/* Comments */}
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                        💬 備註 ({detail.comments.length})
                      </div>
                      {detail.comments.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--t3)', padding: '4px 0' }}>尚無留言</div>
                      ) : detail.comments.map(c => (
                        <div key={c.id} style={{
                          padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                          background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
                        }}>
                          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>
                            {c.author} · {new Date(c.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <input
                          type="text" placeholder="新增備註..."
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && sendComment(t.id)}
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8,
                            border: '1px solid var(--border2)', fontSize: 13,
                            background: 'var(--card)', color: 'var(--t1)', outline: 'none',
                          }}
                        />
                        <button
                          disabled={sending || !commentText.trim()}
                          onClick={() => sendComment(t.id)}
                          style={{
                            padding: '8px 12px', borderRadius: 8, border: 'none',
                            background: 'var(--cyan)', color: '#fff', cursor: 'pointer',
                            opacity: sending || !commentText.trim() ? 0.5 : 1,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ChecklistRow({ item, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <button
        onClick={onToggle}
        style={{
          width: 22, height: 22, borderRadius: 5, padding: 0, flexShrink: 0,
          border: `2px solid ${item.checked ? 'var(--green)' : 'var(--border2)'}`,
          background: item.checked ? 'var(--green)' : 'transparent',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {item.checked && <Check size={12} />}
      </button>
      <span style={{
        fontSize: 13,
        textDecoration: item.checked ? 'line-through' : 'none',
        color: item.checked ? 'var(--t3)' : 'var(--t1)',
      }}>
        {item.title}
      </span>
    </div>
  )
}
