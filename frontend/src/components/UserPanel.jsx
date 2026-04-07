// src/components/UserPanel.jsx
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useUserInfo, useVaultWrite, useGlobalStats } from '../hooks/useVault'
import { fmt, LEVEL_DATA, LEVEL_THRESHOLDS } from '../utils'
import { useEffect, useState } from 'react'

function LevelBadge({ lv }) {
  const info = LEVEL_DATA[lv - 1] || LEVEL_DATA[0]
  const isDiamond = lv >= 7
  return (
    <div className={`level-badge ${isDiamond ? 'diamond' : ''}`}>
      <span className="lv-num">{lv}</span>
      <span className="lv-label">LEVEL</span>
      {lv === 10 && <span className="lv-crown">💎</span>}
    </div>
  )
}

function LvProgress({ heldHours, lv }) {
  const cur  = LEVEL_THRESHOLDS[lv - 1] || 0
  const next = LEVEL_THRESHOLDS[lv] || 0
  const pct  = lv >= 10 ? 100 : Math.min(100, ((Number(heldHours) - cur) / (next - cur)) * 100)
  return (
    <div className="progress-wrap">
      <div className="progress-labels">
        <span>持有 {Number(heldHours)}h</span>
        <span>{lv < 10 ? `升级需: ${next}h` : '已达顶级 💎'}</span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${lv >= 10 ? 'gold' : ''}`}
          style={{ width: pct + '%' }}
        />
      </div>
    </div>
  )
}

export function UserPanel() {
  const { address, isConnected } = useAccount()
  const { userInfo, levelInfo, tokenBal, isRegistered, isLoading, refetch } = useUserInfo()
  const { data: globalData } = useGlobalStats()
  const { register, claim, syncBalance, isPending, isConfirming, isSuccess } = useVaultWrite()
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (isSuccess) {
      setToast({ msg: '交易成功 ✓', type: 'success' })
      refetch()
      setTimeout(() => setToast(null), 3000)
    }
  }, [isSuccess])

  useEffect(() => {
    if (isPending) setToast({ msg: '等待钱包签名…', type: 'info' })
    else if (isConfirming) setToast({ msg: '链上确认中…', type: 'info' })
  }, [isPending, isConfirming])

  // ── Not connected ──────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="panel user-panel">
        <div className="panel-title"><span>👤</span> 我的账户</div>
        <div className="connect-cta">
          <div className="connect-icon">💎</div>
          <p>连接钱包，开始累积钻石算力</p>
          <div className="rainbow-wrap">
            <ConnectButton />
          </div>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="panel user-panel">
        <div className="panel-title"><span>👤</span> 我的账户</div>
        <div className="loading-box">加载中…</div>
      </div>
    )
  }

  // ── Not registered ─────────────────────────────────────────
  if (!isRegistered) {
    const hasBal = tokenBal && tokenBal > 0n
    return (
      <div className="panel user-panel">
        <div className="panel-title"><span>👤</span> 我的账户</div>
        {hasBal ? (
          <div className="register-cta">
            <div className="rc-icon">🚀</div>
            <p>你持有 <strong className="hl">{fmt.token(tokenBal)} DMD</strong></p>
            <p className="sub">注册参与算力分红系统</p>
            <button
              className="btn btn-primary"
              onClick={register}
              disabled={isPending || isConfirming}
            >
              {isPending || isConfirming ? '处理中…' : '💎 注册参与分红'}
            </button>
            <div className="info-box">持币满1小时后开始累积算力，持续持有即可自动升级</div>
          </div>
        ) : (
          <div className="register-cta">
            <div className="rc-icon">💸</div>
            <p className="sub">你尚未持有 DMD 代币</p>
            <p className="sub2">在 PancakeSwap 购买后即可注册</p>
          </div>
        )}
        {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
      </div>
    )
  }

  // ── Registered ────────────────────────────────────────────
  const lv        = levelInfo ? Number(levelInfo[0]) : 1
  const lvName    = levelInfo ? levelInfo[1] : '—'
  const mult      = levelInfo ? Number(levelInfo[2]) : 10
  const heldHours = levelInfo ? levelInfo[3] : 0n

  const power     = userInfo ? userInfo[4] : 0n
  const pendMain  = userInfo ? userInfo[5] : 0n
  const pendDia   = userInfo ? userInfo[6] : 0n
  const claimed   = userInfo ? userInfo[7] : 0n
  const balance   = userInfo ? userInfo[0] : 0n
  const capped    = userInfo ? userInfo[1] : 0n

  const totalPower = globalData ? globalData[0] : 0n
  const sharePct   = totalPower > 0n && power > 0n
    ? ((Number(power) / Number(totalPower)) * 100).toFixed(2)
    : '0.00'

  const totalPend = pendMain + pendDia

  return (
    <div className="panel user-panel">
      <div className="panel-title"><span>👤</span> 我的账户</div>

      {/* Level Row */}
      <div className="level-row">
        <LevelBadge lv={lv} />
        <div className="level-info">
          <div className="level-name">Lv{lv} {lvName}</div>
          <div className="level-mult">算力倍率 ×{(mult / 10).toFixed(1)}</div>
          <LvProgress heldHours={heldHours} lv={lv} />
        </div>
      </div>

      {/* Data rows */}
      <div className="data-rows">
        {[
          { label: '持币数量',     val: fmt.token(balance)  + ' DMD', cls: 'blue' },
          { label: '有效权重(上限500万)', val: fmt.token(capped) + ' DMD', cls: '' },
          { label: '我的算力',     val: fmt.power(power),   cls: 'gold' },
          { label: '全网算力占比', val: sharePct + '%',     cls: 'gold' },
          { label: '历史总领取',   val: fmt.bnb(claimed) + ' BNB', cls: 'green' },
        ].map(r => (
          <div className="dr" key={r.label}>
            <span className="dr-l">{r.label}</span>
            <span className={`dr-v ${r.cls}`}>{r.val}</span>
          </div>
        ))}
      </div>

      {/* Reward Cards */}
      <div className="reward-grid">
        <div className="reward-card main-card">
          <div className="rc-label">主分红待领</div>
          <div className="rc-val blue">{fmt.bnb(pendMain)}</div>
          <div className="rc-unit">BNB · 每2小时</div>
        </div>
        <div className="reward-card dia-card">
          <div className="rc-label">💎 王者额外</div>
          <div className="rc-val diamond">{fmt.bnb(pendDia)}</div>
          <div className="rc-unit">BNB · 每48小时</div>
        </div>
      </div>

      {/* Actions */}
      <div className="btn-row">
        <button
          className="btn btn-gold"
          onClick={claim}
          disabled={isPending || isConfirming || totalPend === 0n}
        >
          {isPending || isConfirming ? '处理中…' : `🏆 领取 ${fmt.bnb(totalPend)} BNB`}
        </button>
        <button
          className="btn btn-outline"
          onClick={syncBalance}
          disabled={isPending || isConfirming}
        >
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
