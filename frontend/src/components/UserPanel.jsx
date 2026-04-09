// src/components/UserPanel.jsx
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useUserInfo, useVaultWrite, useGlobalStats } from '../hooks/useVault'
import { fmt, LEVEL_THRESHOLDS } from '../utils'
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
  const claimed   = userInfo?.[6] ?? 0n

  const lvName = levelInfo?.[1] ?? '—'
  const mult   = levelInfo ? Number(levelInfo[2]) : 10

  // getGlobalStats: [totalPower, mainPool, diaPool, ..., contractBNB(9)]
  const totalPower  = globalStats?.[0] ?? 0n
  const mainPool    = globalStats?.[1] ?? 0n  // 主分红池实时余额
  const diaPool     = globalStats?.[2] ?? 0n  // 王者池实时余额
  const contractBNB = globalStats?.[9] ?? 0n  // 合约总余额

  const isLv10 = lv === 10

  // ── 核心算法：用实时合约余额 × 算力占比 ──────────────────────
  // 每次都基于当前合约里实际有多少钱来算，不依赖链上累计的 pending
  // 这样显示的数字始终和合约实际余额挂钩，领多少就是多少
  const myShareRatio = (totalPower > 0n && power > 0n)
    ? Number(power) / Number(totalPower)
    : 0

  // 主分红可领 = 主分红池实时余额 × 算力占比
  const realtimeMain = mainPool > 0n
    ? BigInt(Math.floor(myShareRatio * Number(mainPool)))
    : 0n

  // 王者池可领 = 王者池实时余额 × 算力占比（仅Lv10）
  const realtimeDia = (isLv10 && diaPool > 0n)
    ? BigInt(Math.floor(myShareRatio * Number(diaPool)))
    : 0n

  const realtimeTotal = realtimeMain + realtimeDia

  // 安全上限：不超过合约总余额
  const displayAmt  = realtimeTotal > contractBNB ? contractBNB : realtimeTotal
  const displayMain = realtimeMain > contractBNB ? contractBNB : realtimeMain
  const displayDia  = realtimeDia > (contractBNB - displayMain) ? (contractBNB - displayMain) : realtimeDia

  const sharePct    = myShareRatio > 0 ? (myShareRatio * 100).toFixed(2) : '0.00'
  const hasPool     = mainPool > 0n || diaPool > 0n
  const canClaim    = contractBNB > 0n && displayAmt > 0n

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
          <div className="rc-unit">= 主分红池 × {sharePct}%</div>
        </div>
        <div className="reward-card dia-card">
          <div className="rc-label">🐜 蚁后可领</div>
          <div className="rc-val diamond">{fmt.bnb(displayDia)}</div>
          <div className="rc-unit">{isLv10 ? `= 王者池 × ${sharePct}%` : '升至Lv10解锁'}</div>
        </div>
      </div>

      {/* 分红池有钱但合约余额少时提示 */}
      {hasPool && contractBNB === 0n && (
        <div className="warn-box warn-red">
          ⚠️ 合约暂无可用余额，领取暂时不可用
        </div>
      )}

      {!hasPool && (
        <div className="warn-box warn-yellow">
          💡 分红池暂无资金，等待下次税收注入后可领取
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
