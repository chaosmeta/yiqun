// src/abi/index.js — ABI 对齐 AntVault v6

export const VAULT_ABI = [
  // ── View ──────────────────────────────────────────────────
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getUserInfo',
    outputs: [
      { name: 'totalBalance_',    type: 'uint256' },
      { name: 'level_',           type: 'uint8'   },
      { name: 'oldestHeldHours_', type: 'uint256' },
      { name: 'power_',           type: 'uint256' },
      { name: 'pendingMain_',     type: 'uint256' },
      { name: 'pendingDia_',      type: 'uint256' },
      { name: 'totalClaimed_',    type: 'uint256' },
      { name: 'positionCount_',   type: 'uint256' },
    ],
    stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getUserPositions',
    outputs: [
      { name: 'amounts_',    type: 'uint256[]' },
      { name: 'startTimes_', type: 'uint256[]' },
      { name: 'heldHours_',  type: 'uint256[]' },
    ],
    stateMutability: 'view', type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'getLevelInfo',
    outputs: [
      { name: 'level_',          type: 'uint8'   },
      { name: 'levelName_',      type: 'string'  },
      { name: 'multiplier_',     type: 'uint256' },
      { name: 'heldHours_',      type: 'uint256' },
      { name: 'nextLevelHours_', type: 'uint256' },
    ],
    stateMutability: 'view', type: 'function',
  },
  {
    inputs: [],
    name: 'getGlobalStats',
    outputs: [
      { name: 'totalPower_',       type: 'uint256' },
      { name: 'mainPool_',         type: 'uint256' },
      { name: 'diaPool_',          type: 'uint256' },
      { name: 'totalMainDist_',    type: 'uint256' },
      { name: 'totalDiaDist_',     type: 'uint256' },
      { name: 'totalBuyback_',     type: 'uint256' },
      { name: 'activeUsers_',      type: 'uint256' },
      { name: 'nextMainDistTime_', type: 'uint256' },
      { name: 'nextDiaDistTime_',  type: 'uint256' },
      { name: 'contractBNB_',      type: 'uint256' },
    ],
    stateMutability: 'view', type: 'function',
  },
  // ── Write（用户）─────────────────────────────────────────
  { inputs: [], name: 'register',            outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'claim',               outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'syncBalance',         outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'triggerDistribution', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  // ── Write（Owner）────────────────────────────────────────
  { inputs: [], name: 'fundMainPool',      outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [], name: 'fundDiaPool',       outputs: [], stateMutability: 'payable', type: 'function' },
  { inputs: [], name: 'manualBuybackBurn', outputs: [], stateMutability: 'payable', type: 'function' },
  {
    inputs: [{ name: 'amount', type: 'uint256' }],
    name: 'emergencyWithdraw',
    outputs: [], stateMutability: 'nonpayable', type: 'function',
  },
]

export const TOKEN_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals',    outputs: [{ name: '', type: 'uint8'   }], stateMutability: 'view', type: 'function' },
]
