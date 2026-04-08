// src/App.jsx
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { GlobalStats } from './components/GlobalStats'
import { UserPanel }   from './components/UserPanel'
import { LevelTable }  from './components/LevelTable'
import { FeePanel }    from './components/FeePanel'

export default function App() {
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-gem">💎</span>
            <span className="logo-text">DIAMOND</span>
          </div>
          <div className="network-badge">
            <span className="net-dot" />
            BSC
          </div>
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="avatar"
          />
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="hero">
        <h1 className="hero-title">钻石手的福音</h1>
        <p className="hero-sub">
          持币越久 · 算力越强 · 分红越多 · <em>卖出清零</em>
        </p>
      </div>

      {/* ── Main ── */}
      <main className="container">
        <GlobalStats />
        <div className="main-grid">
          <UserPanel />
          <LevelTable />
        </div>
        <FeePanel />
      </main>

      <footer className="footer">
        💎 Diamond Protocol · BSC · 拿不住的人，给拿得住的人打工
      </footer>
    </div>
  )
}
