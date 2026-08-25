import { useState, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const qType = (q) => q.type || 'single'
const isCorrect = (q, ans) => {
  if (qType(q) === 'multiple') {
    const c = [...(q.answer_indices || [])].sort((a, b) => a - b)
    const g = Array.isArray(ans) ? [...ans].sort((a, b) => a - b) : []
    return c.length > 0 && c.length === g.length && c.every((v, k) => v === g[k])
  }
  return ans === q.answer_index
}

export default function TrainingCourse() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { lineProfile } = useAuth()
  const lid = lineProfile?.lineUserId

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | lesson | quiz | result
  const [lesson, setLesson] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: r } = await supabase.rpc('liff_lms_course_detail', { p_line_user_id: lid, p_course_id: Number(id) })
    if (r?.ok) setData(r); else setData({ error: r?.error || '載入失敗' })
    setLoading(false)
  }
  useEffect(() => { if (lid) load() }, [lid, id])

  if (loading) return <div className="page"><div className="empty" style={{ paddingTop: 60 }}>載入中…</div></div>
  if (!data || data.error) return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/training')}><ChevronLeft size={16} /> 教育訓練</button>
      <div className="empty" style={{ paddingTop: 40 }}>{data?.error || '找不到課程'}</div>
    </div>
  )

  const { course, enrollment, sections = [] } = data
  const progress = data.progress || {}
  const lessons = sections.flatMap(s => s.lessons || [])
  const doneCount = lessons.filter(l => progress[l.id]?.completed).length
  const pct = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0
  const nextLesson = lessons.find(l => !progress[l.id]?.completed) || lessons[0]

  const enroll = async () => {
    setBusy(true)
    const { data: r } = await supabase.rpc('liff_enroll_course', { p_line_user_id: lid, p_course_id: Number(id) })
    setBusy(false)
    if (r?.ok) load(); else alert(r?.error === 'ALREADY_ENROLLED' ? '已報名' : '報名失敗')
  }

  const openLesson = (l) => {
    setLesson(l); setAnswers({}); setResult(null)
    setView(l.type === 'quiz' ? 'quiz' : 'lesson')
  }

  const markComplete = async () => {
    if (busy) return
    setBusy(true)
    const { data: r } = await supabase.rpc('liff_lms_complete_lesson', { p_line_user_id: lid, p_lesson_id: lesson.id })
    setBusy(false)
    if (!r?.ok) { alert('操作失敗'); return }
    if (r.course_completed) { setResult({ courseCompleted: true, tier: r.tier }); setView('result'); return }
    await load(); setView('list')
  }

  const uploadAssignment = async (file) => {
    if (!file || busy) return
    if (file.size > 50 * 1024 * 1024) { alert('檔案過大(上限約 50MB)'); return }
    setBusy(true)
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `liff/${lesson.id}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('lms-uploads').getPublicUrl(path)
      const { data: r } = await supabase.rpc('liff_lms_submit_assignment', {
        p_line_user_id: lid, p_lesson_id: lesson.id, p_file_url: pub.publicUrl, p_file_name: file.name,
      })
      if (!r?.ok) throw new Error(r?.error || '')
      setResult({ pending: true }); setView('result')
    } catch (e) {
      alert('上傳失敗:' + (e.message || ''))
    } finally { setBusy(false) }
  }

  const questions = Array.isArray(lesson?.quiz_data) ? lesson.quiz_data : []
  const hasEssay = questions.some(q => qType(q) === 'essay')
  const passing = course.passing_score || 80
  const selectAns = (i, oi) => {
    const q = questions[i]
    if (qType(q) === 'multiple') {
      setAnswers(p => { const s = new Set(Array.isArray(p[i]) ? p[i] : []); s.has(oi) ? s.delete(oi) : s.add(oi); return { ...p, [i]: [...s].sort((a, b) => a - b) } })
    } else setAnswers(p => ({ ...p, [i]: oi }))
  }
  const setEssay = (i, t) => setAnswers(p => ({ ...p, [i]: t }))
  const isAnsweredQ = (q, i) => qType(q) === 'essay'
    ? (typeof answers[i] === 'string' && answers[i].trim().length > 0)
    : qType(q) === 'multiple' ? (Array.isArray(answers[i]) && answers[i].length > 0) : answers[i] !== undefined

  const submitQuiz = async () => {
    if (!questions.every(isAnsweredQ)) { alert('請回答所有題目'); return }
    const totalP = questions.reduce((s, q) => s + (q.points || 1), 0)
    // 客觀題自動得分(申論不計入,由後台批閱)
    const autoP = questions.reduce((s, q, i) => s + (qType(q) !== 'essay' && isCorrect(q, answers[i]) ? (q.points || 1) : 0), 0)
    setBusy(true)
    if (hasEssay) {
      // 含申論 → 送後台批閱,不立即算完成
      const answerArr = questions.map((q, i) => answers[i] ?? null)
      const { data: r } = await supabase.rpc('liff_lms_submit_quiz_review', {
        p_line_user_id: lid, p_lesson_id: lesson.id, p_answers: answerArr, p_auto_points: autoP, p_total_points: totalP,
      })
      setBusy(false)
      if (!r?.ok) { alert('提交失敗'); return }
      setResult({ pending: true }); setView('result')
      return
    }
    const score = totalP ? Math.round((autoP / totalP) * 100) : 0
    const passed = score >= passing
    const { data: r } = await supabase.rpc('liff_lms_submit_quiz', { p_line_user_id: lid, p_lesson_id: lesson.id, p_score: score, p_passed: passed })
    setBusy(false)
    if (!r?.ok) { alert('提交失敗'); return }
    setResult({ score, passed, courseCompleted: r.course_completed, tier: r.tier }); setView('result')
  }

  const S = {
    card: { padding: '14px 16px', marginBottom: 8, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--border)' },
    btn: { width: '100%', padding: '12px', borderRadius: 10, background: 'var(--cyan)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
    btn2: { width: '100%', padding: '10px', borderRadius: 10, background: 'var(--cyan-dim)', color: 'var(--cyan)', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  }

  // ── 結果頁 ──
  if (view === 'result') {
    if (result?.pending) {
      return (
        <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}>
          <div style={{ fontSize: 60 }}>📝</div>
          <h2 style={{ margin: '12px 0 6px', color: 'var(--t1)' }}>已提交,等待批閱</h2>
          <p style={{ color: 'var(--t2)', lineHeight: 1.7 }}>此測驗含申論題,需管理者人工批閱。<br />批閱完成後才會計算成績。</p>
          <button style={{ ...S.btn, marginTop: 24 }} onClick={async () => { await load(); setView('list') }}>返回課程</button>
        </div>
      )
    }
    const tierIcon = { 金: '🥇', 銀: '🥈', 銅: '🥉' }[result?.tier] || '🎓'
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}>
        <div style={{ fontSize: 60 }}>{result.courseCompleted ? tierIcon : (result.passed ? '✅' : '❌')}</div>
        <h2 style={{ margin: '12px 0 6px', color: 'var(--t1)' }}>
          {result.courseCompleted ? '恭喜完成整門課程！' : result.passed ? '測驗通過！' : '未達標準'}
        </h2>
        {result.score != null && <p style={{ color: 'var(--t2)' }}>得分 {result.score} 分（及格 {passing} 分）</p>}
        {result.courseCompleted && <p style={{ color: 'var(--green)', fontWeight: 700 }}>已獲得 {result.tier} 級結業證書</p>}
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!result.passed && !result.courseCompleted && lesson?.type === 'quiz' && (
            <button style={S.btn2} onClick={() => { setAnswers({}); setResult(null); setView('quiz') }}>重新作答</button>
          )}
          <button style={S.btn} onClick={async () => { await load(); setView('list') }}>返回課程</button>
        </div>
      </div>
    )
  }

  // ── 測驗頁 ──
  if (view === 'quiz') {
    return (
      <div className="page">
        <button className="back-btn" onClick={() => setView('list')}><ChevronLeft size={16} /> 返回課程</button>
        <h2 style={{ color: 'var(--t1)', fontSize: 18 }}>{lesson.title}</h2>
        <p style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 14 }}>共 {questions.length} 題・及格 {passing} 分</p>
        {data.submissions?.[lesson.id]?.status === 'submitted' && !progress[lesson.id]?.completed ? (
          <div style={S.card}>📝 已提交,批閱中——管理者評分後才會計算成績。</div>
        ) : questions.length === 0 ? (
          <div style={S.card}>此測驗尚未設定題目</div>
        ) : (<>
          {questions.map((q, i) => {
            const essay = qType(q) === 'essay'
            const multi = qType(q) === 'multiple'
            return (
              <div key={i} style={{ ...S.card }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>{i + 1}. {q.question}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>{essay ? '申論題・人工批閱' : multi ? '複選・可多選' : qType(q) === 'truefalse' ? '是非題' : '單選題'}</div>
                {essay ? (
                  <textarea value={typeof answers[i] === 'string' ? answers[i] : ''} onChange={e => setEssay(i, e.target.value)}
                    placeholder="請輸入你的作答…" rows={5}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                ) : (q.options || []).map((opt, oi) => {
                  const sel = multi ? (Array.isArray(answers[i]) && answers[i].includes(oi)) : answers[i] === oi
                  return (
                    <div key={oi} onClick={() => selectAns(i, oi)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${sel ? 'var(--cyan)' : 'var(--border)'}`, background: sel ? 'var(--cyan-dim)' : 'transparent',
                      color: sel ? 'var(--cyan)' : 'var(--t2)', fontSize: 14,
                    }}>
                      <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: multi ? 4 : '50%', border: `2px solid ${sel ? 'var(--cyan)' : 'var(--border2)'}`, background: sel ? 'var(--cyan)' : 'transparent' }} />
                      {opt}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {hasEssay && <div style={{ fontSize: 12, color: 'var(--t3)', margin: '0 4px 8px' }}>※ 含申論題,提交後需管理者批閱才計成績。</div>}
          <button style={{ ...S.btn, marginTop: 8 }} disabled={busy} onClick={submitQuiz}>{busy ? '提交中…' : '提交測驗'}</button>
        </>)}
      </div>
    )
  }

  // ── 單元頁(文字/影片/作業)──
  if (view === 'lesson' && lesson) {
    const done = progress[lesson.id]?.completed
    return (
      <div className="page">
        <button className="back-btn" onClick={() => setView('list')}><ChevronLeft size={16} /> 返回課程</button>
        <h2 style={{ color: 'var(--t1)', fontSize: 18 }}>{lesson.title}</h2>
        <p style={{ color: 'var(--t3)', fontSize: 12, marginBottom: 14 }}>🕐 {lesson.duration_minutes} 分鐘</p>
        {lesson.type === 'video' && lesson.content ? (
          <Video url={lesson.content} />
        ) : lesson.type === 'pdf' ? (
          lesson.content ? (
            <div>
              <iframe src={lesson.content} title="PDF" style={{ width: '100%', height: '56vh', border: '1px solid var(--border)', borderRadius: 12 }} />
              <a href={lesson.content} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: 10, padding: '10px', borderRadius: 10, background: 'var(--cyan-dim)', color: 'var(--cyan)', fontWeight: 700, textDecoration: 'none' }}>在瀏覽器開啟 PDF ↗</a>
            </div>
          ) : <div style={S.card}>此單元尚無 PDF</div>
        ) : lesson.type === 'assignment' ? (
          <div>
            <div style={{ ...S.card, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 15, color: 'var(--t2)', marginBottom: 12 }}>
              {lesson.content || '（此作業尚無說明）'}
            </div>
            {progress[lesson.id]?.completed ? (
              <div style={{ ...S.card, color: 'var(--green)', fontWeight: 700 }}>✓ 作業已通過</div>
            ) : data.submissions?.[lesson.id]?.status === 'submitted' ? (
              <div style={{ ...S.card, color: 'var(--orange)', fontWeight: 700 }}>📤 已上傳,批閱中——管理者確認後才算完成。</div>
            ) : (
              <label style={{ ...S.btn, display: 'block', textAlign: 'center', cursor: busy ? 'default' : 'pointer' }}>
                {busy ? '上傳中…' : '📤 上傳作業(拍照 / 選檔)'}
                <input type="file" hidden accept="image/*,video/*,application/pdf" disabled={busy}
                  onChange={e => uploadAssignment(e.target.files?.[0])} />
              </label>
            )}
            <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>支援照片 / 影片 / PDF,上限約 50MB。</p>
          </div>
        ) : (
          <div style={{ ...S.card, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 15, color: 'var(--t2)' }}>
            {lesson.content || '（此單元尚無內容）'}
          </div>
        )}
        {lesson.type !== 'assignment' && (
          <button style={{ ...S.btn, marginTop: 12 }} disabled={done || busy} onClick={markComplete}>
            {done ? '✓ 已完成' : busy ? '處理中…' : '標記完成'}
          </button>
        )}
      </div>
    )
  }

  // ── 課程總覽(list)──
  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/training')}><ChevronLeft size={16} /> 教育訓練</button>
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)' }}>{course.title}</div>
        {course.description && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>{course.description}</div>}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--t3)', flexWrap: 'wrap' }}>
          {course.category && <span>● {course.category}</span>}
          {course.estimated_hours && <span>⏱ {course.estimated_hours}h</span>}
          {course.is_required && <span style={{ color: 'var(--red)' }}>必修</span>}
        </div>
        {enrollment ? (
          <>
            {course.delivery_mode !== '實體' && lessons.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>{doneCount}/{lessons.length} 單元完成</div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--cyan)', borderRadius: 3 }} />
                </div>
              </div>
            )}
            {nextLesson && course.delivery_mode !== '實體' && (
              <button style={{ ...S.btn, marginTop: 12 }} onClick={() => openLesson(nextLesson)}>
                {enrollment.status === '已完成' ? '重新觀看' : doneCount > 0 ? '繼續學習' : '開始學習'}
              </button>
            )}
          </>
        ) : (
          <button style={{ ...S.btn, marginTop: 12 }} disabled={busy} onClick={enroll}>{busy ? '報名中…' : '立即報名'}</button>
        )}
      </div>

      {course.delivery_mode === '實體' ? (
        <div style={S.card}>此為<b>實體課程</b>,由講師現場點名簽到,簽到後即完成。</div>
      ) : (
        sections.map(sec => (
          <div key={sec.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', margin: '4px 4px 6px' }}>{sec.title}</div>
            {(sec.lessons || []).map(l => {
              const d = progress[l.id]?.completed
              const pending = !d && data.submissions?.[l.id]?.status === 'submitted'
              const icon = l.type === 'video' ? '▶' : l.type === 'quiz' ? '📝' : l.type === 'assignment' ? '📤' : '📄'
              return (
                <div key={l.id} onClick={() => enrollment && openLesson(l)} style={{
                  ...S.card, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10,
                  opacity: enrollment ? 1 : 0.6, cursor: enrollment ? 'pointer' : 'default',
                }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <div style={{ flex: 1, fontSize: 14, color: d ? 'var(--green)' : 'var(--t1)', fontWeight: 600 }}>{l.title}</div>
                  {d ? <span style={{ color: 'var(--green)' }}>✓</span>
                    : pending ? <span style={{ color: 'var(--orange)', fontSize: 12, fontWeight: 700 }}>批閱中</span>
                    : <span style={{ color: 'var(--t3)', fontSize: 12 }}>{l.duration_minutes}分</span>}
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

function Video({ url }) {
  const yt = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1]
  const vm = url.match(/vimeo\.com\/(\d+)/)?.[1]
  // aspect-ratio 直接放 iframe(不用 paddingBottom+絕對定位+overflow,避免被裁成一角)
  const frame = { width: '100%', aspectRatio: '16 / 9', border: 'none', borderRadius: 12, display: 'block', background: '#000' }
  if (yt) return <iframe style={frame} src={`https://www.youtube.com/embed/${yt}`} allowFullScreen title="video" />
  if (vm) return <iframe style={frame} src={`https://player.vimeo.com/video/${vm}`} allowFullScreen title="video" />
  return <video controls style={{ ...frame }} src={url} />
}
