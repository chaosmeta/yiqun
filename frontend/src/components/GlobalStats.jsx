// src/components/GlobalStats.jsx
import { useGlobalStats } from '../hooks/useVault'
import { useVaultWrite } from '../hooks/useVault'
import { fmt } from '../utils'

function StatCard({ label, value, sub, color = 'blue' }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function GlobalStats() {
  const { stats: s, burnedTokens, isLoading } = useGlobalStats()
  const { triggerDistribution, isPending } = useVaultWrite()

  if (isLoading) return <div className="loading-row">加载全网数据…</div>

  const now      = Math.floor(Date.now() / 1000)
  const nextMain = s ? Number(s[7]) - now : 0

  return (
    <section className="global-section">
      {/* 第一行：核心指标 */}
      <div className="stats-grid">
        <StatCard label="全网算力"        value={s ? fmt.power(s[0])   : '—'} color="blue"    />
        <StatCard label="持有用户"         value={s ? s[6].toString()   : '—'} color="gold"    />
        <StatCard label="主分红池"         value={s ? fmt.bnb(s[1])     : '—'} sub="BNB" color="green"   />
        <StatCard label="💎 王者池"        value={s ? fmt.bnb(s[2])     : '—'} sub="BNB" color="diamond" />
      </div>

      {/* 第二行：累计数据 + 回购 + 倒计时 */}
      <div className="pool-row">
        <div className="pool-card">
          <div className="pc-label">📦 总分红已发</div>
          <div className="pc-value blue">
            {s ? fmt.bnb(s[3] + s[4]) : '—'} <span>BNB</span>
          </div>
        </div>

        {/* 回购销毁：BNB 数量 + 代币数量 */}
        <div className="pool-card">
          <div className="pc-label">🔥 回购销毁</div>
          <div className="pc-value red">
            {s ? fmt.bnb(s[5]) : '—'} <span>BNB</span>
          </div>
          {burnedTokens != null && (
            <div className="pc-sub burn-token">
              ≈ {fmt.token(burnedTokens)} 代币已销毁
            </div>
          )}
        </div>

        <div className="pool-card">
          <div className="pc-label">⏱ 下次主分红</div>
          <div className="pc-value green">{s ? fmt.countdown(nextMain) : '—'}</div>
          <div className="pc-sub">每 2 小时一次</div>
        </div>

        <div className="pool-card">
          <button
            className="trigger-btn"
            onClick={triggerDistribution}
            disabled={isPending}
          >
            {isPending ? '提交中…' : '⚡ 触发分红'}
          </button>
          <div className="pc-sub">任何人可触发</div>
        </div>
      </div>
    </section>
  )
}
