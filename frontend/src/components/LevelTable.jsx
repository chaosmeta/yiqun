// src/components/LevelTable.jsx
import { useAccount } from 'wagmi'
import { useUserInfo } from '../hooks/useVault'
import { LEVEL_DATA } from '../utils'

export function LevelTable() {
  const { isConnected } = useAccount()
  const { levelInfo } = useUserInfo()
  const currentLv = levelInfo ? Number(levelInfo[0]) : 0

  return (
    <div className="panel">
      <div className="panel-title"><span>🏅</span> 钻石手等级系统</div>

      <table className="lv-table">
        <thead>
          <tr>
            <th>等级</th>
            <th>持有时长</th>
            <th>算力倍率</th>
          </tr>
        </thead>
        <tbody>
          {LEVEL_DATA.map(({ lv, name, hours, mult }) => {
            const isActive = isConnected && currentLv === lv
            const isDiamond = lv === 10
            return (
              <tr key={lv} className={isActive ? 'row-active' : ''}>
                <td className={isDiamond ? 'diamond-cell' : ''}>
                  Lv{lv} {name}
                  {isActive && <span className="you-badge">← 你</span>}
                </td>
                <td className="td-hours">{hours}</td>
                <td>
                  <span className={`mult-chip ${isDiamond ? 'chip-diamond' : ''}`}>
                    ×{mult.toFixed(1)}{isDiamond ? ' 💎' : ''}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="info-box" style={{ marginTop: 16 }}>
        💎 <strong>钻石王者专属：</strong>每48小时额外分得13%分红池<br />
        🔥 持币上限算力：500万 DMD（防巨鲸垄断）<br />
        📊 算力 = min(持币, 500万) × 等级倍率 × 持有小时数
      </div>
    </div>
  )
}
