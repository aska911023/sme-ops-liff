import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, GraduationCap, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUS_STYLE = {
  '已報名':  { bg: 'var(--cyan-dim)',     color: 'var(--cyan)',   icon: <Clock size={12} /> },
  '進行中':  { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', icon: <Clock size={12} /> },
  '已完成':  { bg: 'var(--green-dim)',    color: 'var(--green)',  icon: <CheckCircle2 size={12} /> },
  '未通過':  { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)',  icon: <XCircle size={12} /> },
}

const CATEGORY_COLOR = {
  '一般': 'var(--t2)',
  '安全': 'var(--red)',
  '技術': 'var(--cyan)',
  '管理': 'var(--purple)',
  '合規': 'var(--orange)',
}

export default function Training() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('mine') // 'mine' | 'browse'
  const [courses, setCourses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [summary, setSummary] = useState({ total: 0, in_progress: 0, completed: 0, failed: 0, total_hours: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // course id being processed
  const [certs, setCerts] = useState([])

  const reload = async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const [c, e, cert] = await Promise.all([
      supabase.rpc('liff_list_training_courses', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_enrollments', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_lms_my_certificates', { p_line_user_id: lineProfile.lineUserId }),
    ])
    if (c.data?.ok) setCourses(c.data.courses || [])
    if (e.data?.ok) {
      setEnrollments(e.data.enrollments || [])
      setSummary(e.data.summary || summary)
    }
    if (cert.data?.ok) setCerts(cert.data.certificates || [])
    if (c.error || e.error) setError(c.error?.message || e.error?.message)
    setLoading(false)
  }

  useEffect(() => { reload() }, [lineProfile])

  const enroll = async (courseId) => {
    setBusy(courseId)
    const { data } = await supabase.rpc('liff_enroll_course', {
      p_line_user_id: lineProfile.lineUserId,
      p_course_id: courseId,
    })
    if (!data?.ok) {
      const msgMap = {
        ALREADY_ENROLLED: '你已經報名過這門課了',
        COURSE_FULL: '這門課已額滿',
        COURSE_CLOSED: '這門課已停開',
        TENANT_MISMATCH: '無權報名此課程',
      }
      alert(msgMap[data?.error] || '報名失敗')
    }
    setBusy(null)
    reload()
  }

  const cancel = async (enrollmentId) => {
    if (!confirm('確定要取消報名？')) return
    setBusy(enrollmentId)
    const { data } = await supabase.rpc('liff_cancel_enrollment', {
      p_line_user_id: lineProfile.lineUserId,
      p_enrollment_id: enrollmentId,
    })
    if (!data?.ok) {
      alert(data?.error === 'CANNOT_CANCEL' ? '已開始或結束的課程無法取消' : '取消失敗')
    }
    setBusy(null)
    reload()
  }

  const browseList = useMemo(() => courses, [courses])

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">🎓 教育訓練</div>
      </div>

      {error && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 8,
          background: 'rgba(248,113,113,0.1)', color: 'var(--red)',
          fontSize: 12,
        }}>⚠️ {error}</div>
      )}

      {/* 統計卡 */}
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--cyan)' }}>{summary.in_progress || 0}</div>
          <div className="stat-label">進行中</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{summary.completed || 0}</div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--purple)' }}>{summary.total_hours || 0}h</div>
          <div className="stat-label">已修時數</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--orange)' }}>{certs.length}</div>
          <div className="stat-label">證照</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: 4, marginBottom: 12,
        borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
      }}>
        {[
          { key: 'mine', label: '我的課程', count: enrollments.length },
          { key: 'browse', label: '可報名', count: browseList.filter(c => !c.i_enrolled).length },
          { key: 'certs', label: '證照', count: certs.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: tab === t.key ? 'var(--cyan-dim)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--t2)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {t.label}
            <span style={{
              fontSize: 11, padding: '1px 6px', borderRadius: 999,
              background: tab === t.key ? 'var(--cyan)' : 'var(--border2)',
              color: tab === t.key ? '#fff' : 'var(--t3)',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* 我的課程 */}
      {tab === 'mine' && (
        enrollments.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48 }}>📚</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>尚未報名任何課程</div>
            <button onClick={() => setTab('browse')} style={{
              marginTop: 12, padding: '8px 16px', borderRadius: 8,
              background: 'var(--cyan-dim)', color: 'var(--cyan)',
              border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>瀏覽課程</button>
          </div>
        ) : (
          enrollments.map(e => {
            const st = STATUS_STYLE[e.status] || STATUS_STYLE['已報名']
            return (
              <div key={e.id} onClick={() => navigate(`/training/course/${e.course_id}`)} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 14, cursor: 'pointer',
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{e.course_title}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 11, color: 'var(--t3)' }}>
                      {e.category && <span style={{ color: CATEGORY_COLOR[e.category] || 'var(--t2)' }}>● {e.category}</span>}
                      {e.duration_hours && <span>⏱ {e.duration_hours}h</span>}
                      {e.instructor && <span>👨‍🏫 {e.instructor}</span>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 999,
                    background: st.bg, color: st.color, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  }}>
                    {st.icon} {e.status}
                  </span>
                </div>
                {e.score !== null && e.score !== undefined && (
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 8 }}>
                    成績：<b style={{ color: e.score >= 60 ? 'var(--green)' : 'var(--red)' }}>{e.score}</b>
                    {e.completed_at && <span style={{ marginLeft: 8, color: 'var(--t3)' }}>· {e.completed_at?.slice(0, 10)}</span>}
                  </div>
                )}
                {e.status === '已報名' && (
                  <button
                    onClick={(ev) => { ev.stopPropagation(); cancel(e.id) }}
                    disabled={busy === e.id}
                    style={{
                      marginTop: 10, padding: '6px 12px', borderRadius: 8,
                      background: 'transparent', border: '1px solid var(--border2)',
                      color: 'var(--t3)', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    {busy === e.id ? '取消中...' : '取消報名'}
                  </button>
                )}
              </div>
            )
          })
        )
      )}

      {/* 可報名 */}
      {tab === 'browse' && (
        browseList.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48 }}>📭</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>目前沒有開課中的課程</div>
          </div>
        ) : (
          browseList.map(c => {
            const full = c.max_enrollment != null && c.enrolled_count >= c.max_enrollment
            return (
              <div key={c.id} onClick={() => navigate(`/training/course/${c.id}`)} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 14, cursor: 'pointer',
                background: 'var(--card)', border: '1px solid var(--border)',
                opacity: c.i_enrolled ? 0.7 : 1,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                  <GraduationCap size={14} style={{ display: 'inline', marginRight: 4, color: 'var(--cyan)' }} />
                  {c.title}
                </div>
                {c.description && (
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>
                    {c.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--t3)' }}>
                  {c.category && <span style={{ color: CATEGORY_COLOR[c.category] || 'var(--t2)' }}>● {c.category}</span>}
                  {c.duration_hours && <span>⏱ {c.duration_hours} 小時</span>}
                  {c.instructor && <span>👨‍🏫 {c.instructor}</span>}
                  <span style={{ color: full ? 'var(--red)' : 'var(--t3)' }}>
                    👥 {c.enrolled_count}/{c.max_enrollment || '∞'}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  {c.i_enrolled ? (
                    <span style={{
                      fontSize: 11, padding: '6px 12px', borderRadius: 8,
                      background: 'var(--green-dim)', color: 'var(--green)', fontWeight: 700,
                    }}>✅ 已報名（{c.my_status}）</span>
                  ) : (
                    <button
                      onClick={(ev) => { ev.stopPropagation(); enroll(c.id) }}
                      disabled={full || busy === c.id}
                      style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        background: full ? 'var(--border2)' : 'var(--cyan)',
                        color: full ? 'var(--t3)' : '#fff',
                        fontSize: 12, fontWeight: 700,
                        cursor: full ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {busy === c.id ? '報名中...' : full ? '已額滿' : '我要報名'}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )
      )}

      {/* 我的證照 */}
      {tab === 'certs' && (
        certs.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48 }}>🎓</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>尚未取得任何結業證照</div>
          </div>
        ) : (
          certs.map(ct => {
            const meta = { '金': '🥇', '銀': '🥈', '銅': '🥉' }[ct.tier] || '🎓'
            return (
              <div key={ct.id} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 14,
                background: 'var(--card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 28 }}>{meta}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>{ct.course_title || '課程'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                    {ct.tier ? `${ct.tier}級` : ''}{ct.score != null ? ` · ${ct.score} 分` : ''}{ct.issued_at ? ` · ${String(ct.issued_at).slice(0, 10)}` : ''}
                  </div>
                  {ct.certificate_number && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{ct.certificate_number}</div>}
                </div>
              </div>
            )
          })
        )
      )}
    </div>
  )
}
