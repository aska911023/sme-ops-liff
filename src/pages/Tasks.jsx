import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Tasks() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [checklists, setChecklists] = useState([])
  const [tab, setTab] = useState('tasks')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('tasks').select('*').eq('assignee', employee.name).order('id', { ascending: false }),
      supabase.from('checklists').select('*').eq('assignee', employee.name).order('id', { ascending: false }),
    ]).then(([t, c]) => {
      setTasks(t.data || [])
      setChecklists(c.data || [])
      setLoading(false)
    })
  }, [employee])

  const handleStatusChange = async (id, status) => {
    const { data } = await supabase.from('tasks').update({ status }).eq('id', id).select().single()
    if (data) setTasks(prev => prev.map(t => t.id === id ? data : t))
  }

  const priColor = (p) => p === '高' ? 'badge-red' : p === '中' ? 'badge-orange' : 'badge-cyan'
  const statusColor = (s) => s === '已完成' ? 'var(--green)' : s === '進行中' ? 'var(--cyan)' : 'var(--t3)'

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">⚙️ 流程進度</div>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--card)', borderRadius: 10, padding: 4, marginBottom: 16, border: '1px solid var(--border)' }}>
        {[['tasks', '我的任務'], ['checklists', '查核清單']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: tab === k ? 'var(--cyan)' : 'transparent',
            color: tab === k ? '#fff' : 'var(--t3)',
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : tab === 'tasks' ? (
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
