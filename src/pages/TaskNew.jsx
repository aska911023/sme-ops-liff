import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
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
    setSubmitting(false)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!data?.ok) { alert(ERR_MSG[data?.error] || `新增失敗：${data?.error || 'unknown'}`); return }
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
