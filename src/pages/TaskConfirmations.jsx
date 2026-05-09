import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import TaskConfirmationList from '../components/TaskConfirmationList'

export default function TaskConfirmations() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [confs, setConfs] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    supabase.rpc('liff_list_my_task_confirmations', {
      p_line_user_id: lineProfile.lineUserId,
    }).then(({ data }) => {
      setConfs(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [lineProfile?.lineUserId])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">✔️ 任務確認</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
          審核「執行人按完成、等你確認」的任務
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <TaskConfirmationList
          confs={confs}
          lineUserId={lineProfile?.lineUserId}
          onReload={reload}
        />
      )}
    </div>
  )
}
