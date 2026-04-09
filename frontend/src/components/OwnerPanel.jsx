// src/components/OwnerPanel.jsx
// Owner 管理面板：直接在前端操作 fundMainPool / fundDiaPool / manualBuybackBurn / emergencyWithdraw
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { parseEther } from 'viem'
import { useOwnerWrite, useGlobalStats } from '../hooks/useVault'
import { fmt } from '../utils'

// Owner 地址（部署合约的钱包）
const OWNER = '0x637c0410107041232F0037852e53E7abD3A24e24'.toLowerCase()
// 注意：如果 owner 地址不是合约地址，请改成部署时用的钱包地址
// 这里只是前端隐藏面板用，合约本身有 onlyOwner 保护

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

  // 只有连接钱包后才显示（合约有 onlyOwner 保护，非 Owner 调用会失败）
  if (!isConnected) return null

  const contractBNB = stats?.[9] ?? 0n
  const busy = isPending || isConfirming

  const handle = (fn, amt) => {
    if (!amt || isNaN(amt) || Number(amt) <= 0) return setToast({ msg: '请输入有效的 BNB 数量', type: 'error' })
    try { fn(amt) } catch(e) { setToast({ msg: e.message, type: 'error' }) }
  }

  const handleWithdraw = () => {
    if (!withdrawAmt || isNaN(withdrawAmt) || Number(withdrawAmt) <= 0)
      return setToast({ msg: '请输入有效的 BNB 数量', type: 'error' })
    try { withdraw(parseEther(withdrawAmt)) } catch(e) { setToast({ msg: e.message, type: 'error' }) }
  }

  return (
    <div className="panel owner-panel" style={{ marginTop: 20, border: '1px solid rgba(255,180,0,0.3)', background: 'rgba(255,180,0,0.05)' }}>
      <div className="panel-title">🔧 Owner 管理面板</div>
      <div className="pc-sub" style={{ marginBottom: 16 }}>
        合约余额：<strong style={{ color: '#f0b429' }}>{fmt.bnb(contractBNB)} BNB</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* 注入主分红池 */}
        <div className="owner-card">
          <div className="owner-card-title">💰 注入主分红池</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={mainAmt}
            onChange={e => setMainAmt(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }}
            onClick={() => handle(fundMain, mainAmt)} disabled={busy}>
            {busy ? '处理中…' : 'fundMainPool'}
          </button>
        </div>

        {/* 注入王者池 */}
        <div className="owner-card">
          <div className="owner-card-title">🐜 注入王者池</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={diaAmt}
            onChange={e => setDiaAmt(e.target.value)} />
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }}
            onClick={() => handle(fundDia, diaAmt)} disabled={busy}>
            {busy ? '处理中…' : 'fundDiaPool'}
          </button>
        </div>

        {/* 手动回购销毁 */}
        <div className="owner-card">
          <div className="owner-card-title">🔥 手动回购销毁</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={buybackAmt}
            onChange={e => setBuybackAmt(e.target.value)} />
          <button className="btn btn-danger" style={{ marginTop: 8, width: '100%' }}
            onClick={() => handle(buybackBurn, buybackAmt)} disabled={busy}>
            {busy ? '处理中…' : 'manualBuybackBurn'}
          </button>
        </div>

        {/* 紧急提款 */}
        <div className="owner-card">
          <div className="owner-card-title">🚨 紧急提款</div>
          <input className="owner-input" type="number" placeholder="BNB 数量" value={withdrawAmt}
            onChange={e => setWithdrawAmt(e.target.value)} />
          <button className="btn btn-danger" style={{ marginTop: 8, width: '100%' }}
            onClick={handleWithdraw} disabled={busy}>
            {busy ? '处理中…' : 'emergencyWithdraw'}
          </button>
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`} style={{ marginTop: 12 }}>{toast.msg}</div>}
    </div>
  )
}
