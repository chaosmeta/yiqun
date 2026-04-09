// src/components/OwnerPanel.jsx
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { useOwnerWrite, useGlobalStats } from '../hooks/useVault'
import { fmt } from '../utils'

const OWNER = '0x37fa564eab81cf5eb00e830304bf111aa6637835'

export function OwnerPanel() {
  const { address, isConnected } = useAccount()
  const { stats } = useGlobalStats()
  const { fundMain, fundDia, buybackBurn, withdraw, isPending, isConfirming, isSuccess } = useOwnerWrite()

  const [mainAmt,     setMainAmt]     = useState('')
  const [diaAmt,      setDiaAmt]      = useState('')
  const [buybackAmt,  setBuybackAmt]  = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (isSuccess) { setToast({ msg: '操作成功 ✓', type: 'success' }); setTimeout(() => setToast(null), 3000) }
  }, [isSuccess])

  // 只对 Owner 地址显示
  if (!isConnected || address?.toLowerCase() !== OWNER) return null

  const contractBNB = stats?.[9] ?? 0n
  const busy = isPending || isConfirming

  const handle = (fn, amt) => {
    if (!amt || isNaN(amt) || Number(amt) <= 0)
      return setToast({ msg: '请输入有效的 BNB 数量', type: 'error' })
    try { fn(amt) } catch(e) { setToast({ msg: e.message, type: 'error' }) }
  }

  const handleWithdraw = () => {
    if (!withdrawAmt || isNaN(withdrawAmt) || Number(withdrawAmt) <= 0)
      return setToast({ msg: '请输入有效的 BNB 数量', type: 'error' })
    try { withdraw(parseEther(withdrawAmt)) } catch(e) { setToast({ msg: e.message, type: 'error' }) }
  }

  return (
    <div className="panel owner-panel">
      <div className="panel-title">🔧 Owner 管理面板</div>
      <div className="pc-sub" style={{ marginBottom: 16 }}>
        合约余额：<strong style={{ color: '#f0b429' }}>{fmt.bnb(contractBNB)} BNB</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="owner-card">
          <div className="owner-card-title">💰 注入主分红池</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={mainAmt} onChange={e => setMainAmt(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => handle(fundMain, mainAmt)} disabled={busy}>
            {busy ? '处理中…' : 'fundMainPool'}
          </button>
        </div>
        <div className="owner-card">
          <div className="owner-card-title">🐜 注入王者池</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={diaAmt} onChange={e => setDiaAmt(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }} onClick={() => handle(fundDia, diaAmt)} disabled={busy}>
            {busy ? '处理中…' : 'fundDiaPool'}
          </button>
        </div>
        <div className="owner-card">
          <div className="owner-card-title">🔥 手动回购销毁</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={buybackAmt} onChange={e => setBuybackAmt(e.target.value)} />
          <button className="btn btn-danger" style={{ marginTop: 8, width: '100%' }} onClick={() => handle(buybackBurn, buybackAmt)} disabled={busy}>
            {busy ? '处理中…' : 'manualBuybackBurn'}
          </button>
        </div>
        <div className="owner-card">
          <div className="owner-card-title">🚨 紧急提款</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)} />
          <button className="btn btn-danger" style={{ marginTop: 8, width: '100%' }} onClick={handleWithdraw} disabled={busy}>
            {busy ? '处理中…' : 'emergencyWithdraw'}
          </button>
        </div>
      </div>
      {toast && <div className={`toast toast-${toast.type}`} style={{ marginTop: 12 }}>{toast.msg}</div>}
    </div>
  )
}
