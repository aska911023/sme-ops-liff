import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// 2026-04-22 整理：workflow_step_* 衛星表已砍，流程執行改走 tasks 表。
// 這頁目前只呈現「派給我的 tasks」。狀態變更走一般 update，
// 若需要細部 checklist/comment 回報，走主系統或等後續補 RPC。
export default function Tasks() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_my_tasks', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        setTasks(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [lineProfile])

  const priColor = (p) => p === '高' ? 'badge-red' : p === '中' ? 'badge-orange' : 'badge-cyan'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">⚙️ 我的任務</div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tasks.length === 0 ? (
        <div className="empty">🎉 目前沒有待辦任務</div>
      ) : tasks.map(t => (
        <div key={t.id} className="list-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                {t.workflow && <span>{t.workflow} · </span>}
                {t.store && <span>{t.store} · </span>}
                {t.due_date && <span>截止 {t.due_date}</span>}
              </div>
            </div>
            {t.priority && <span className={`badge ${priColor(t.priority)}`}>{t.priority}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>狀態：{t.status}</div>
        </div>
      ))}
    </div>
  )
}
