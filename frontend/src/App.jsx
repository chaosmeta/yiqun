// src/App.jsx
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { GlobalStats } from './components/GlobalStats'
import { UserPanel }   from './components/UserPanel'
import { LevelTable }  from './components/LevelTable'
import { FeePanel }    from './components/FeePanel'
import { OwnerPanel }  from './components/OwnerPanel'

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/ant-logo.png" alt="蚁群" className="logo-img"
              onError={e => { e.target.style.display='none' }} />
            <span className="logo-text">蚁群</span>
          </div>
          <div className="network-badge"><span className="net-dot" />BSC</div>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
        </div>
      </header>

      <div className="hero">
        <h1 className="hero-title">蚁群分红协议</h1>
        <p className="hero-sub">持币越久 · 算力越强 · 分红越多 · <em>卖出清零</em></p>
      </div>

      <main className="container">
        <GlobalStats />
        <div className="main-grid">
          <UserPanel />
          <LevelTable />
        </div>
        <FeePanel />
        {/* Owner 管理面板：连接钱包后自动显示，非Owner调用会被合约拒绝 */}
        <OwnerPanel />
      </main>

      <footer className="footer">
        🐜 蚁群协议 · BSC · 拿不住的人，给拿得住的人打工
      </footer>
    </div>
  )
}
