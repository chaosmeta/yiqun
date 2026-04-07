# 💎 Diamond Protocol — 钻石手分红协议

> 持币越久 · 算力越强 · 分红越多 · 卖出清零

**网络：BSC Testnet**

---

## 项目结构

```
yiqun/
├── contracts/
│   ├── DiamondToken.sol   # ERC20 代币，3%/3% 税费自动换BNB
│   └── DiamondVault.sol   # 分红核心合约，10级算力等级系统
└── frontend/              # React + RainbowKit + wagmi DApp
    ├── src/
    │   ├── config/wagmi.js         # 链配置 + 合约地址
    │   ├── abi/index.js            # 合约 ABI
    │   ├── hooks/useVault.js       # wagmi 读写 hooks
    │   ├── components/
    │   │   ├── GlobalStats.jsx     # 全网数据
    │   │   ├── UserPanel.jsx       # 个人面板
    │   │   ├── LevelTable.jsx      # 等级系统
    │   │   └── FeePanel.jsx        # 税费分配
    │   ├── App.jsx
    │   ├── main.jsx                # RainbowKit Provider 入口
    │   └── styles.css
    ├── index.html
    ├── package.json
    └── vite.config.js
```

---

## 合约机制

### DiamondToken.sol

- 总量：**1亿 DMD**
- 买/卖税：各 **3%**，自动换成 BNB 打入 Vault：

| 分配 | 比例 | 说明 |
|------|------|------|
| 🔥 回购销毁 | 25% | 永久通缩 |
| 💰 主分红池 | 62% | 每2小时分发 |
| 💎 钻石王者池 | 13% | 每48小时，仅Lv10 |

### DiamondVault.sol

**算力公式：**
```
个人算力 = min(持币量, 500万 DMD) × 等级倍率 × 持有小时数
个人分红 = 个人算力 / 全网算力 × 分红池 BNB
```

**等级系统：**

| 等级 | 名称 | 时长 | 倍率 |
|------|------|------|------|
| Lv1  | 散户     | 0~24h    | ×1.0 |
| Lv2  | 铁杆     | 24~60h   | ×1.1 |
| Lv3  | 坚守     | 60~96h   | ×1.2 |
| Lv4  | 信仰     | 96~132h  | ×1.3 |
| Lv5  | 长持     | 132~168h | ×1.4 |
| Lv6  | 恒心     | 168~228h | ×1.6 |
| Lv7  | 钻石新秀 | 228~288h | ×1.8 |
| Lv8  | 钻石手   | 288~348h | ×2.0 |
| Lv9  | 钻石长老 | 348~408h | ×2.2 |
| Lv10 | 钻石王者 | 408h+    | ×2.5 💎 |

**卖出惩罚：** 算力清零 + 等级降1级 + 未领分红没收回流

**防巨鲸：** 单地址有效算力封顶 500万 DMD

---

## 前端技术栈

- **React 18** + **Vite**
- **RainbowKit v2** — 钱包连接 UI（支持 MetaMask、WalletConnect 等）
- **wagmi v2** — 合约读写 hooks
- **viem** — 类型安全的以太坊工具
- **@tanstack/react-query** — 数据缓存 & 刷新

---

## 部署步骤

### 1. 合约部署（Remix / Hardhat）

```
BSC Testnet PancakeSwap Router: 0xD99D1c33F9fC3444f8101754aBC46c52416550D1
BNB 测试币水龙头: https://testnet.bnbchain.org/faucet-smart

① 部署 DiamondVault(_router)
② 部署 DiamondToken(_router)
③ token.setVault(vaultAddress)
④ vault.setToken(tokenAddress)
⑤ vault.setTokenContract(tokenAddress)
⑥ 在 PancakeSwap Testnet 添加 DMD/BNB 流动性
```

### 2. 前端配置

编辑 `frontend/src/config/wagmi.js`：
```js
export const CONTRACT_ADDRESSES = {
  TOKEN: '0x你的Token合约地址',
  VAULT: '0x你的Vault合约地址',
}

// 从 https://cloud.walletconnect.com 获取
projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev       # 开发模式
npm run build     # 生产构建
```

---

## 参考链接

- BSCScan Testnet: https://testnet.bscscan.com
- PancakeSwap Testnet: https://pancakeswap.finance (切换到测试网)
- WalletConnect Cloud: https://cloud.walletconnect.com
- RainbowKit 文档: https://www.rainbowkit.com/docs

---

*拿不住的人，给拿得住的人打工。*
