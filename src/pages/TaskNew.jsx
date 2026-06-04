import { useState, useEffect } from 'react'
import { ChevronLeft, Paperclip, X, Image, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const ERR_MSG = {
  EMPLOYEE_NOT_FOUND: '找不到員工資料',
  TITLE_REQUIRED: '請填寫任務標題',
  ASSIGNEE_NOT_FOUND: '找不到指派對象',
  ASSIGNEE_CROSS_ORG: '指派對象不在同一個組織',
}

const PRIORITIES = ['高', '中', '低']

export default function TaskNew() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: '中',
    assignee_id: '', workflow: '',
  })
  const [colleagues, setColleagues] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([]) // 待上傳的發起附件（建立任務後一併送出）

  const handleFilesPicked = (e) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ''
    setPendingFiles(prev => [...prev, ...list])
  }
  const removePendingFile = (idx) => setPendingFiles(prev => prev.filter((_, i) => i !== idx))

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_employees_in_org', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => setColleagues(Array.isArray(data) ? data : []))
  }, [lineProfile?.lineUserId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { alert('請填寫任務標題'); return }
    setSubmitting(true)
    const { data, error } = await supabase.rpc('liff_create_task', {
      p_line_user_id: lineProfile.lineUserId,
      p_payload: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        priority: form.priority,
        assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
        workflow: form.workflow.trim() || null,
      },
    })
    if (error) { setSubmitting(false); alert('系統錯誤：' + error.message); return }
    if (!data?.ok) { setSubmitting(false); alert(ERR_MSG[data?.error] || `新增失敗：${data?.error || 'unknown'}`); return }

    // 上傳發起附件（kind='initiator'）— 任務建立後才有 task_id
    const newTaskId = data.task_id || data.id
    if (newTaskId && pendingFiles.length > 0) {
      let uploadedCount = 0
      for (const file of pendingFiles) {
        try {
          const ext = file.name.split('.').pop()
          const path = `tasks/${newTaskId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
          const { error: upErr } = await supabase.storage.from('task-attachments').upload(path, file, { upsert: false })
          if (upErr) { console.warn('upload err', upErr); continue }
          const { data: ins, error: insErr } = await supabase.rpc('liff_insert_task_attachment', {
            p_line_user_id: lineProfile.lineUserId,
            p_payload: {
              task_id:      newTaskId,
              file_name:    file.name,
              storage_path: path,
              file_size:    file.size,
              file_type:    file.type,
              kind:         'initiator',
            },
          })
          if (insErr || !ins?.ok) { console.warn('insert attachment err', insErr || ins?.error); continue }
          uploadedCount++
        } catch (err) {
          console.warn('upload exception', err)
        }
      }
      if (uploadedCount < pendingFiles.length) {
        alert(`任務已建立，但 ${pendingFiles.length - uploadedCount} 個附件上傳失敗`)
      }
    }

    setSubmitting(false)
    navigate('/tasks', { replace: true })
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/tasks')}><ChevronLeft size={16} /> 任務列表</button>
      <div className="header">
        <div className="header-title">➕ 新增任務</div>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="任務標題" required>
          <input
            type="text" required
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="例：月底盤點倉庫"
            style={inputStyle}
          />
        </Field>

        <Field label="描述">
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="具體工作內容..."
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="截止日期" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.due_date}
              onChange={e => set('due_date', e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="優先度" style={{ flex: 1 }}>
            <select
              value={form.priority}
              onChange={e => set('priority', e.target.value)}
              style={inputStyle}
            >
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>

        <Field label="指派給">
          <select
            value={form.assignee_id}
            onChange={e => set('assignee_id', e.target.value)}
            style={inputStyle}
          >
            <option value="">指派給自己（{employee?.name}）</option>
            {colleagues
              .filter(c => c.id !== employee?.id)
              .map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.dept ? `（${c.dept}）` : ''}
                </option>
              ))}
          </select>
        </Field>

        <Field label="流程 / 分類（選填）">
          <input
            type="text"
            value={form.workflow}
            onChange={e => set('workflow', e.target.value)}
            placeholder="例：每日開店作業"
            style={inputStyle}
          />
        </Field>

        <Field label={`📎 發起附件（選填，${pendingFiles.length} 個）`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{
              cursor: 'pointer',
              padding: '10px 12px', borderRadius: 8, border: '1px dashed var(--border2)',
              background: 'var(--card)', color: 'var(--cyan)',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              justifyContent: 'center',
            }}>
              <Paperclip size={14} /> 加照片/檔案
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                multiple
                onChange={handleFilesPicked}
                style={{ display: 'none' }}
              />
            </label>
            {pendingFiles.map((f, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 8,
                background: 'var(--card)', border: '1px solid var(--border2)', fontSize: 12,
              }}>
                {f.type?.startsWith('image/')
                  ? <Image size={14} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
                  : <FileText size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                    {(f.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button type="button" onClick={() => removePendingFile(idx)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--red)', padding: 4, display: 'flex', alignItems: 'center',
                }}><X size={14} /></button>
              </div>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            style={{
              flex: 1, padding: '12px', borderRadius: 10,
              border: '1.5px solid var(--border2)', background: 'transparent',
              color: 'var(--t2)', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: 'var(--cyan)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            {submitting ? '新增中...' : '建立任務'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid var(--border2)', fontSize: 14,
  background: 'var(--card)', color: 'var(--t1)', outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, required, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--red)' }}> *</span>}
      </div>
      {children}
    </div>
  )
}
