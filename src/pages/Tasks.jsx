import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronDown, ChevronRight, Check, Send, Plus, Paperclip, Image, FileText, X, Eye } from 'lucide-react'
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
    }).then(({ data }) => {
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
    // ★ 改用 v2：有審批人時 status='待確認' 並回傳 approvers，立即推 LINE
    const { data, error } = await supabase.rpc('liff_complete_task_v2', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: taskId,
    })
    setProcessing(null)
    if (error) {
      console.error('liff_complete_task_v2 error', JSON.stringify(error, null, 2))
      alert(`系統錯誤\nmsg: ${error.message}\ncode: ${error.code}\ndetails: ${error.details}\nhint: ${error.hint}`)
      return
    }
    if (!data?.ok) { alert(ERR_MSG[data?.error] || `完成失敗：${data?.error || 'unknown'}`); return }

    // 不再 client-side push 給審批人 —
    // 主系統 trg_notify_task_confirmation_inserted (INSERT trigger) 會自動推 step_assigned LINE 給第 0 關所有 approvers
    if (data.has_pending_confirmations && Array.isArray(data.approvers) && data.approvers.length > 0) {
      alert(`已標記完成，等 ${data.approvers.length} 位審批人通過`)
    }

    setExpandedId(null)
    setDetail(null)
    loadList()
  }

  const toggleSharedItem = async (item, taskId) => {
    const next = !item.checked
    // v2 帶 task_id → 寫 per-task 狀態，不會污染範本
    const { data } = await supabase.rpc('liff_toggle_checklist_item_v2', {
      p_line_user_id: lineProfile.lineUserId,
      p_task_id: taskId,
      p_item_id: item.id,
      p_checked: next,
    })
    if (!data?.ok) { alert(ERR_MSG[data?.error] || '切換失敗'); return }
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
                    {/* Complete — 已回報過 (待確認/待簽核) 時 disabled，避免重複回報 */}
                    {(() => {
                      const s = detail.task.status
                      const isAwaiting = s === '待確認' || s === '待簽核'
                      return (
                        <button
                          disabled={isAwaiting || processing === t.id}
                          onClick={() => !isAwaiting && handleComplete(t.id)}
                          style={{
                            width: '100%', padding: '10px', borderRadius: 10,
                            border: 'none',
                            background: isAwaiting ? 'var(--t3)' : 'var(--green)',
                            color: '#fff',
                            fontSize: 14, fontWeight: 700,
                            cursor: isAwaiting ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            opacity: (isAwaiting || processing === t.id) ? 0.6 : 1,
                          }}
                        >
                          <Check size={16} />
                          {s === '待確認' ? '等待確認中…'
                            : s === '待簽核' ? '等待簽核中…'
                            : '回報完成'}
                        </button>
                      )
                    })()}

                    {/* ★ 退回原因 (task 被審批人退回時顯示) */}
                    {detail.task.status === '已退回' && Array.isArray(detail.confirmations) && detail.confirmations.filter(c => c.status === 'rejected').map(c => (
                      <div key={c.id} style={{
                        marginTop: 12, padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(248,113,113,0.12)', border: '1.5px solid var(--red)',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 3 }}>
                          🔄 退回原因 · {c.approver}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--red)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {c.notes || '（未填）'}
                        </div>
                      </div>
                    ))}

                    {/* Description */}
                    {detail.task.description && (
                      <div style={{ marginTop: 12, fontSize: 13, color: 'var(--t2)', whiteSpace: 'pre-wrap' }}>
                        {detail.task.description}
                      </div>
                    )}

                    {/* Form Bindings — 流程綁定的必填表單 */}
                    {Array.isArray(detail.form_bindings) && detail.form_bindings.length > 0 && (
                      <FormBindingsBlock bindings={detail.form_bindings} />
                    )}

                    {/* Shared Checklists */}
                    {detail.checklists.map(cl => (
                      <div key={cl.id} style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
                          📋 {cl.name} ({cl.items.filter(i => i.checked).length}/{cl.items.length})
                        </div>
                        {cl.items.map(item => (
                          <ChecklistRow key={item.id} item={item} onToggle={() => toggleSharedItem(item, t.id)} />
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

                    {/* ★ 附件區（照片/檔案回報） */}
                    <TaskAttachments
                      taskId={t.id}
                      attachments={detail.attachments || []}
                      lineUserId={lineProfile?.lineUserId}
                      onChange={() => loadList()}
                      currentEmpId={detail.task?.assignee_id}
                    />

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

function FormBindingsBlock({ bindings }) {
  const completed = bindings.filter(b => b.status === '已完成').length
  const navTo = (b) => {
    if (b.form_id) return
    const taskId = new URLSearchParams(window.location.search).get('task')
    const taskQs = taskId ? `&task_id=${taskId}` : ''
    let url = null
    if (b.form_type === 'expense_request') url = `/expense-request?binding_id=${b.id}`
    else if (b.form_type === 'expense')    url = `/expenses?binding_id=${b.id}`
    else if (b.form_type === 'form_submission' && b.form_template_id) {
      url = `/forms/custom/${b.form_template_id}?binding_id=${b.id}${taskQs}`
    }
    else if (b.form_type === 'store_audit') {
      url = `/store-audits/new?binding_id=${b.id}${taskQs}`
    }
    if (url) {
      window.location.href = url
    } else {
      alert(`「${b.form_label}」無法在 LIFF 填寫，請至電腦版 SME Ops 系統`)
    }
  }
  const STATUS_STYLE = {
    '未填':   { bg: 'rgba(148,163,184,0.2)',  color: 'var(--t3)',     icon: '⚪' },
    '簽核中': { bg: 'rgba(245,158,11,0.2)',    color: 'var(--orange)', icon: '🔵' },
    '已退回': { bg: 'rgba(239,68,68,0.2)',     color: 'var(--red)',    icon: '❌' },
    '已完成': { bg: 'rgba(34,197,94,0.2)',     color: 'var(--green)',  icon: '✅' },
  }
  return (
    <div style={{ marginTop: 14, padding: 10, background: 'var(--glass)', borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>📋 需完成表單</span>
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>{completed}/{bindings.length} 完成</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bindings.map(b => {
          const s = STATUS_STYLE[b.status] || STATUS_STYLE['未填']
          return (
            <div key={b.id} onClick={() => navTo(b)}
              style={{
                padding: '8px 10px', borderRadius: 6, background: 'var(--bg)',
                cursor: b.form_id ? 'default' : 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                border: '1px solid var(--border)',
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                  {s.icon} {b.form_label}
                  {b.form_id && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--t3)' }}>#{b.form_id}</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>完成條件：{b.required_status}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{b.status}</span>
                {!b.form_id && (
                  <span style={{ fontSize: 11, color: 'var(--cyan)', fontWeight: 600 }}>填寫 →</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
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

// 附件區 — 拆兩區：📎 發起附件（read-only 但可下載） / 📎 回報附件（執行人/審核人可上傳）
export function TaskAttachments({ taskId, attachments = [], lineUserId, onChange, currentEmpId, readOnly = false }) {
  const [uploading, setUploading] = useState(false)

  const initiatorList = attachments.filter(a => (a.kind || 'reporter') === 'initiator')
  const reporterList  = attachments.filter(a => (a.kind || 'reporter') === 'reporter')

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
        const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, file, { upsert: false })
        if (upErr) { console.warn('upload err', upErr); alert('上傳失敗：' + upErr.message); continue }
        const { data, error } = await supabase.rpc('liff_insert_task_attachment', {
          p_line_user_id: lineUserId,
          p_payload: {
            task_id:      taskId,
            file_name:    file.name,
            storage_path: path,
            file_size:    file.size,
            file_type:    file.type,
            kind:         'reporter',
          },
        })
        if (error || !data?.ok) { alert('紀錄失敗：' + (data?.error || error?.message)); continue }
      }
      onChange?.()
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (att) => {
    if (!confirm(`刪除附件「${att.file_name}」？`)) return
    await supabase.storage.from('task-attachments').remove([att.storage_path]).catch(() => {})
    const { data } = await supabase.rpc('liff_delete_task_attachment', {
      p_line_user_id: lineUserId, p_id: att.id,
    })
    if (!data?.ok) { alert(data?.error || '刪除失敗'); return }
    onChange?.()
  }

  const viewFile = (att) => {
    const { data } = supabase.storage.from('task-attachments').getPublicUrl(att.storage_path)
    if (data?.publicUrl) window.open(data.publicUrl, '_blank')
  }

  const isImage = (att) => att.file_type?.startsWith('image/')

  const renderRow = (att, allowDelete) => (
    <div key={att.id} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 8,
      background: 'var(--card)', border: '1px solid var(--border2)',
    }}>
      {isImage(att) ? <Image size={14} style={{ color: 'var(--cyan)', flexShrink: 0 }} /> : <FileText size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {att.file_name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--t3)' }}>
          {att.uploaded_by} · {(att.file_size / 1024).toFixed(0)} KB · {new Date(att.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <button onClick={() => viewFile(att)} title="下載/檢視" style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--cyan)', padding: 4, display: 'flex', alignItems: 'center',
      }}><Eye size={14} /></button>
      {allowDelete && currentEmpId === att.uploaded_by_emp_id && (
        <button onClick={() => handleDelete(att)} title="刪除" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center',
        }}><X size={14} /></button>
      )}
    </div>
  )

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── 發起附件 (read-only，全員可下載) ── */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
          📎 發起附件 ({initiatorList.length})
        </div>
        {initiatorList.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>發起人未附檔</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {initiatorList.map(att => renderRow(att, !readOnly))}
          </div>
        )}
      </div>

      {/* ── 回報附件 (執行人/審核人可上傳) ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>
            📎 回報附件 ({reporterList.length})
          </div>
          {!readOnly && (
            <label style={{
              cursor: 'pointer',
              padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: 'var(--cyan-dim)', color: 'var(--cyan)',
              border: '1px solid var(--cyan)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: uploading ? 0.5 : 1,
            }}>
              <Paperclip size={12} /> {uploading ? '上傳中...' : '加照片/檔案'}
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                multiple
                onChange={handleUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
        {reporterList.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t3)', padding: '4px 0' }}>
            {readOnly ? '執行人未上傳附件' : '尚未上傳任何回報附件'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reporterList.map(att => renderRow(att, !readOnly))}
          </div>
        )}
      </div>
    </div>
  )
}
