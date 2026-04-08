// src/components/FeePanel.jsx
export function FeePanel() {
  const items = [
    { icon: '🔥', pct: '25%', label: '回购销毁',   sub: '持续通缩 · 蚁群越来越少',  color: 'red'     },
    { icon: '💰', pct: '62%', label: '主分红池',   sub: '每2小时分发 · 全部持有者', color: 'blue'    },
    { icon: '🐜', pct: '13%', label: '蚁后专属池', sub: '每48小时 · 仅Lv10享有',   color: 'diamond' },
  ]
  return (
    <div className="panel fee-panel">
      <div className="panel-title"><span>💱</span> 税费分配机制 · 买/卖各 3%</div>
      <div className="fee-grid">
        {items.map(({ icon, pct, label, sub, color }) => (
          <div key={label} className={`fee-card fee-${color}`}>
            <div className="fee-icon">{icon}</div>
            <div className={`fee-pct fee-pct-${color}`}>{pct}</div>
            <div className="fee-label">{label}</div>
            <div className="fee-sub">{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
