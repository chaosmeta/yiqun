// src/components/UserPanel.jsx
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useUserInfo, useVaultWrite, useGlobalStats } from '../hooks/useVault'
import { fmt, LEVEL_DATA, LEVEL_THRESHOLDS } from '../utils'
import { useEffect, useState } from 'react'

function LevelBadge({ lv }) {
  return (
    <div className={`level-badge ${lv >= 7 ? 'diamond' : ''}`}>
      <span className="lv-num">{lv}</span>
      <span className="lv-label">LEVEL</span>
      {lv === 10 && <span className="lv-crown">🐜</span>}
    </div>
  )
}

function LvProgress({ heldHours, lv }) {
  const cur  = LEVEL_THRESHOLDS[lv - 1] || 0
  const next = LEVEL_THRESHOLDS[lv]     || 0
  const pct  = lv >= 10 ? 100 : Math.min(100, ((Number(heldHours) - cur) / (next - cur)) * 100)
  return (
    <div className="progress-wrap">
      <div className="progress-labels">
        <span>持有 {Number(heldHours)}h</span>
        <span>{lv < 10 ? `升级需: ${next}h` : '已达顶级 🐜'}</span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${lv >= 10 ? 'gold' : ''}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

export function UserPanel() {
  const { isConnected } = useAccount()
  const { userInfo, levelInfo, tokenBal, isRegistered, isLoading, refetch } = useUserInfo()
  const { stats: globalStats } = useGlobalStats()
  const { register, claim, syncBalance, isPending, isConfirming, isSuccess } = useVaultWrite()
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (isSuccess) { setToast({ msg: '交易成功 ✓', type: 'success' }); refetch(); setTimeout(() => setToast(null), 3000) }
  }, [isSuccess])
  useEffect(() => {
    if (isPending)         setToast({ msg: '等待钱包签名…', type: 'info' })
    else if (isConfirming) setToast({ msg: '链上确认中…',   type: 'info' })
  }, [isPending, isConfirming])

  if (!isConnected) return (
    <div className="panel user-panel">
      <div className="panel-title"><span>👤</span> 我的账户</div>
      <div className="connect-cta">
        <div className="connect-icon">🐜</div>
        <p>连接钱包，开始累积蚁群算力</p>
        <div className="rainbow-wrap"><ConnectButton /></div>
      </div>
    </div>
  )

  if (isLoading) return (
    <div className="panel user-panel">
      <div className="panel-title"><span>👤</span> 我的账户</div>
      <div className="loading-box">加载中…</div>
    </div>
  )

  if (!isRegistered) {
    const hasBal = tokenBal && tokenBal > 0n
    return (
      <div className="panel user-panel">
        <div className="panel-title"><span>👤</span> 我的账户</div>
        {hasBal ? (
          <div className="register-cta">
            <div className="rc-icon">🚀</div>
            <p>你持有 <strong className="hl">{fmt.token(tokenBal)} 蚁群</strong></p>
            <p className="sub">注册参与算力分红系统</p>
            <button className="btn btn-primary" onClick={register} disabled={isPending || isConfirming}>
              {isPending || isConfirming ? '处理中…' : '🐜 注册参与分红'}
            </button>
            <div className="info-box">持币满1小时后开始累积算力，持续持有即可自动升级</div>
          </div>
        ) : (
          <div className="register-cta">
            <div className="rc-icon">💸</div>
            <p className="sub">你尚未持有蚁群代币</p>
            <p className="sub2">在 PancakeSwap 购买后即可注册</p>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    )
  }

  // getUserInfo: [totalBalance, level, oldestHeldHours, power, pendingMain, pendingDia, totalClaimed, positionCount]
  const balance   = userInfo?.[0] ?? 0n
  const lv        = userInfo ? Number(userInfo[1]) : 1
  const heldHours = userInfo?.[2] ?? 0n
  const power     = userInfo?.[3] ?? 0n
  const pendMain  = userInfo?.[4] ?? 0n  // 链上真实累计待领（主）
  const pendDia   = userInfo?.[5] ?? 0n  // 链上真实累计待领（王者）
  const claimed   = userInfo?.[6] ?? 0n

  const lvName = levelInfo?.[1] ?? '—'
  const mult   = levelInfo ? Number(levelInfo[2]) : 10

  const totalPower  = globalStats?.[0] ?? 0n
  const contractBNB = globalStats?.[9] ?? 0n  // 合约实际余额

  const sharePct = totalPower > 0n && power > 0n
    ? ((Number(power) / Number(totalPower)) * 100).toFixed(2) : '0.00'

  // ── 显示逻辑 ──────────────────────────────────────────────────
  // 链上 pending 是合约记录的真实值，claim() 就是按这个发
  // 如果 pending > contractBNB，实际到手 = contractBNB（合约没那么多钱）
  // 所以：显示的数字 = min(pending, contractBNB)，和实际到手完全一致
  const totalPend  = pendMain + pendDia
  const displayAmt = totalPend > contractBNB ? contractBNB : totalPend

  // 拆分显示：主分红和王者分红按比例缩减
  const ratio = totalPend > 0n
    ? Number(displayAmt) / Number(totalPend) : 0
  const displayMain = BigInt(Math.floor(Number(pendMain) * ratio))
  const displayDia  = BigInt(Math.floor(Number(pendDia)  * ratio))

  const isLv10 = lv === 10
  const hasVaultFunds = contractBNB > 0n
  const canClaim = hasVaultFunds && displayAmt > 0n
  // 是否受限（链上有待领但合约钱不够）
  const isLimited = totalPend > contractBNB && totalPend > 0n

  return (
    <div className="panel user-panel">
      <div className="panel-title"><span>👤</span> 我的账户</div>

      <div className="level-row">
        <LevelBadge lv={lv} />
        <div className="level-info">
          <div className="level-name">Lv{lv} {lvName}</div>
          <div className="level-mult">算力倍率 ×{(mult / 10).toFixed(1)}</div>
          <LvProgress heldHours={heldHours} lv={lv} />
        </div>
      </div>

      <div className="data-rows">
        {[
          { label: '持币数量',     val: fmt.token(balance) + ' 蚁群', cls: 'blue'  },
          { label: '我的算力',     val: fmt.power(power),             cls: 'gold'  },
          { label: '全网算力占比', val: sharePct + '%',               cls: 'gold'  },
          { label: '历史总领取',   val: fmt.bnb(claimed) + ' BNB',   cls: 'green' },
        ].map(r => (
          <div className="dr" key={r.label}>
            <span className="dr-l">{r.label}</span>
            <span className={`dr-v ${r.cls}`}>{r.val}</span>
          </div>
        ))}
      </div>

      <div className="reward-grid">
        <div className="reward-card main-card">
          <div className="rc-label">主分红可领</div>
          <div className="rc-val blue">{fmt.bnb(displayMain)}</div>
          <div className="rc-unit">BNB · 每2小时</div>
        </div>
        <div className="reward-card dia-card">
          <div className="rc-label">🐜 蚁后可领</div>
          <div className="rc-val diamond">{fmt.bnb(displayDia)}</div>
          <div className="rc-unit">{isLv10 ? 'BNB · Lv10专属' : '升至Lv10解锁'}</div>
        </div>
      </div>

      {/* 受限提示：链上有更多待领，但合约暂时余额不足 */}
      {isLimited && (
        <div className="warn-box warn-yellow">
          💡 你的累计待领 {fmt.bnb(totalPend)} BNB，当前受合约余额限制，实际可领 {fmt.bnb(displayAmt)} BNB，剩余待领将在下次分红补充后可领
        </div>
      )}

      {!hasVaultFunds && (
        <div className="warn-box warn-red">
          ⚠️ 分红池暂无资金，领取暂时不可用，请等待资金补充
        </div>
      )}

      <div className="btn-row">
        <button
          className="btn btn-gold"
          onClick={claim}
          disabled={!canClaim || isPending || isConfirming}
        >
          {isPending || isConfirming
            ? '处理中…'
            : canClaim
              ? `🏆 领取 ${fmt.bnb(displayAmt)} BNB`
              : '暂无可领'}
        </button>
        <button className="btn btn-outline" onClick={syncBalance} disabled={isPending || isConfirming}>
          🔄 同步余额
        </button>
      </div>

      <div className="warn-box">
        ⚠️ 卖出或转账将导致：算力清零 · 等级降1级 · 未领分红全部没收回流奖池
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  )
}
