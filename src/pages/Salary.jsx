import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Salary() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [bonusRecords, setBonusRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(null)

  const [leaveDeductions, setLeaveDeductions] = useState([])
  const [expenses, setExpenses] = useState([])

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_my_salary', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_leave_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_expenses', { p_line_user_id: lineProfile.lineUserId }),
    ]).then(([s, l, e]) => {
      const sal = Array.isArray(s.data) ? s.data : []
      setRecords(sal)
      setBonusRecords([]) // 獎金整併到 bonus_records，後續若需要再補 RPC
      setLeaveDeductions((Array.isArray(l.data) ? l.data : []).filter(x => x.status === '已核准'))
      setExpenses(Array.isArray(e.data) ? e.data : [])
      if (sal.length) setSelectedMonth(sal[0].month)
      setLoading(false)
    })
  }, [lineProfile])

  const current = records.find(r => r.month === selectedMonth)
  const bonus = bonusRecords.filter(b => b.period === selectedMonth)
  const monthLeaves = leaveDeductions.filter(l => l.start_date?.startsWith(selectedMonth) && ['事假', '病假'].includes(l.type))
  const monthExpenses = expenses.filter(e => e.date?.startsWith(selectedMonth) && e.status === '已核准')
  const expenseTotal = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">💰 薪資查詢</div>
      </div>

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : records.length === 0 ? (
        <div className="empty">尚無薪資紀錄</div>
      ) : (
        <>
          {/* Month Selector */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <select
              className="form-input"
              value={selectedMonth || ''}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{
                width: '100%', padding: '12px 40px 12px 16px', borderRadius: 12,
                fontSize: 15, fontWeight: 700, color: 'var(--cyan)',
                background: 'var(--card)', border: '1.5px solid rgba(34,211,238,0.3)',
                appearance: 'none', cursor: 'pointer',
              }}
            >
              {records.map(r => {
                const [y, m] = r.month.split('-')
                return <option key={r.month} value={r.month}>{y} 年 {parseInt(m)} 月</option>
              })}
            </select>
            <ChevronDown size={18} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--cyan)', pointerEvents: 'none' }} />
          </div>

          {current && (
            <>
              {/* Net Salary */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(34,211,238,0.08))',
                border: '1px solid rgba(52,211,153,0.2)',
                borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>實發薪資</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green)' }}>
                  NT$ {(current.net_salary || 0).toLocaleString()}
                </div>
              </div>

              {/* Breakdown */}
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>薪資明細</div>
                {[
                  { label: '底薪', value: current.base_salary, color: 'var(--t1)' },
                  { label: '津貼', value: current.allowance, color: 'var(--green)', sign: '+' },
                  { label: '加班費', value: current.overtime, color: 'var(--cyan)', sign: '+' },
                  { label: '績效獎金', value: current.bonus, color: 'var(--purple)', sign: '+' },
                  { label: '事假扣薪', value: current.absence_deduction, color: 'var(--red)', sign: '-' },
                  { label: '遲到扣薪', value: current.late_deduction, color: 'var(--red)', sign: '-' },
                  { label: `其他扣款${current.deduction_note ? `（${current.deduction_note}）` : ''}`, value: current.other_deduction, color: 'var(--red)', sign: '-' },
                  { label: '勞健保', value: current.insurance, color: 'var(--orange)', sign: '-' },
                  { label: '報帳退款', value: expenseTotal, color: 'var(--cyan)', sign: '+' },
                ].map((item, i) => (
                  <div key={i} className="info-row">
                    <span className="info-label">{item.label}</span>
                    <span style={{ fontWeight: 600, color: (item.value || 0) === 0 ? 'var(--t3)' : item.color }}>
                      {(item.value || 0) === 0 ? '—' : `${item.sign || ''}NT$ ${(item.value || 0).toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Leave Deduction Detail */}
              {monthLeaves.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>📋 請假扣款明細</div>
                  {monthLeaves.map(l => (
                    <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span><span className="badge badge-cyan" style={{ marginRight: 6 }}>{l.type}</span>{l.start_date}</span>
                        <span style={{ color: 'var(--red)', fontWeight: 600 }}>{l.hours ? `${l.hours}h` : `${l.days || 1}天`}</span>
                      </div>
                      {l.reason && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{l.reason}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Expense Reimbursement Detail */}
              {monthExpenses.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>🧾 報帳退款明細</div>
                  {monthExpenses.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--t2)' }}>{e.description || e.category || '報帳'}</span>
                      <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>+NT$ {(e.amount || 0).toLocaleString()}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700 }}>
                    <span>合計</span>
                    <span style={{ color: 'var(--cyan)' }}>+NT$ {expenseTotal.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Bonus Detail */}
              {bonus.length > 0 && (
                <div className="card">
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>🏆 獎金明細</div>
                  {bonus.map(b => (
                    <div key={b.id} style={{
                      padding: '12px', borderRadius: 10,
                      background: 'var(--glass)', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{b.role_type} 獎金</span>
                        <span style={{ color: 'var(--purple)', fontWeight: 800 }}>NT$ {(b.total_bonus || 0).toLocaleString()}</span>
                      </div>
                      {b.notes && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{b.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
