// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ═══════════════════════════════════════════════════════════════
//  AntVault — 蚁群算力分红合约 v5
//  BSC Mainnet
//
//  核心机制：
//  · 每次买入记录为独立 Position{amount, startTime}
//  · 等级由【最早持仓】的 startTime 决定
//  · 算力 = Σ(每批有效量 × 等级倍率 × 该批持有小时) / 10
//  · 卖出惩罚：清空所有持仓，等级降1，待领分红没收回池
//  · 主分红 2h 周期，钻石王者(Lv10)额外 48h 周期
// ═══════════════════════════════════════════════════════════════

abstract contract Context {
    function _msgSender() internal view virtual returns (address) { return msg.sender; }
}

abstract contract Ownable is Context {
    address private _owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    constructor(address initialOwner) {
        _owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }
    modifier onlyOwner() { require(_owner == _msgSender(), "Not owner"); _; }
    function owner() public view returns (address) { return _owner; }
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;
    uint256 private _status;
    constructor() { _status = _NOT_ENTERED; }
    modifier nonReentrant() {
        require(_status != _ENTERED, "Reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

interface IPancakeRouter02 {
    function WETH() external pure returns (address);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

contract AntVault is Ownable, ReentrancyGuard {

    // ─── 常量 ──────────────────────────────────────────────────
    uint256 public constant PRECISION               = 1e18;
    uint256 public constant MAX_WEIGHT_BALANCE      = 5_000_000 * 1e18;
    uint256 public constant MAIN_REWARD_INTERVAL    = 2 hours;
    uint256 public constant DIAMOND_REWARD_INTERVAL = 48 hours;
    uint256 public constant MAX_POSITIONS           = 50;
    address public constant DEAD                    = 0x000000000000000000000000000000000000dEaD;
    address public constant PANCAKE_ROUTER          = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    // ─── 等级数据（pure，不占存储槽，部署零风险）──────────────
    function _levelMinHours(uint8 lv) internal pure returns (uint256) {
        // lv: 1~10，返回该等级所需最低持有小时
        if (lv == 1)  return 0;
        if (lv == 2)  return 24;
        if (lv == 3)  return 60;
        if (lv == 4)  return 96;
        if (lv == 5)  return 132;
        if (lv == 6)  return 168;
        if (lv == 7)  return 228;
        if (lv == 8)  return 288;
        if (lv == 9)  return 348;
        return 408; // lv == 10
    }
    function _levelMultiplier(uint8 lv) internal pure returns (uint256) {
        // 返回等级倍率 × 10（避免小数）
        if (lv == 1)  return 10;
        if (lv == 2)  return 11;
        if (lv == 3)  return 12;
        if (lv == 4)  return 13;
        if (lv == 5)  return 14;
        if (lv == 6)  return 16;
        if (lv == 7)  return 18;
        if (lv == 8)  return 20;
        if (lv == 9)  return 22;
        return 25; // lv == 10
    }

    // ─── 数据结构 ──────────────────────────────────────────────
    struct Position {
        uint256 amount;
        uint256 startTime;   // 该批买入的时间戳，独立计时
    }

    struct UserInfo {
        Position[] positions;
        uint256 totalBalance;
        uint256 pendingMainReward;
        uint256 pendingDiaReward;
        uint256 totalClaimed;
        uint256 mainRewardDebt;  // 上次结算时的 mainAccPerPower
        uint256 diaRewardDebt;   // 上次结算时的 diaAccPerPower
        uint8   level;           // 冗余存储，惩罚降级用
        bool    registered;
    }

    // ─── 状态变量 ──────────────────────────────────────────────
    address public token;

    mapping(address => UserInfo) public users;
    address[] public userList;
    uint256 public activeUserCount;

    uint256 public lastMainDistributeTime;
    uint256 public lastDiaDistributeTime;
    uint256 public mainRewardPool;
    uint256 public diaRewardPool;
    uint256 public totalBuybackBurned;
    uint256 public totalMainDistributed;
    uint256 public totalDiaDistributed;
    uint256 public mainAccPerPower;
    uint256 public diaAccPerPower;

    mapping(address => bool) public blacklisted;

    // ─── 事件 ──────────────────────────────────────────────────
    event Registered(address indexed user, uint256 amount);
    event PositionAdded(address indexed user, uint256 newAmount, uint256 totalBalance);
    event UserPenalized(address indexed user, uint8 oldLevel, uint8 newLevel, uint256 forfeitedMain, uint256 forfeitedDia);
    event MainRewardDistributed(uint256 amount, uint256 totalPower);
    event DiaRewardDistributed(uint256 amount, uint256 totalPower);
    event Claimed(address indexed user, uint256 mainAmount, uint256 diaAmount);
    event BuybackBurn(uint256 bnbAmount);
    event MainRewardReceived(uint256 amount);
    event DiaRewardReceived(uint256 amount);
    event BuybackReceived(uint256 amount);
    event TokenSet(address indexed token);

    // ─── 构造函数（无参数，直接部署）──────────────────────────
    constructor() Ownable(msg.sender) {
        lastMainDistributeTime = block.timestamp;
        lastDiaDistributeTime  = block.timestamp;
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════════════
    //  接收分红 BNB（由代币合约调用）
    // ═══════════════════════════════════════════════════════════

    function receiveMainReward() external payable {
        mainRewardPool += msg.value;
        emit MainRewardReceived(msg.value);
        if (block.timestamp >= lastMainDistributeTime + MAIN_REWARD_INTERVAL)
            _distributeMain();
    }

    function receiveDiamondReward() external payable {
        diaRewardPool += msg.value;
        emit DiaRewardReceived(msg.value);
        if (block.timestamp >= lastDiaDistributeTime + DIAMOND_REWARD_INTERVAL)
            _distributeDiamond();
    }

    function receiveBuybackBurn() external payable {
        emit BuybackReceived(msg.value);
        _doBuybackBurn(msg.value);
    }

    // ═══════════════════════════════════════════════════════════
    //  用户操作
    // ═══════════════════════════════════════════════════════════

    /// @notice 注册或同步余额（买入后调用）
    function register() external nonReentrant { _syncUser(msg.sender); }

    /// @notice 代替他人注册（如发射台钩子）
    function registerFor(address account) external nonReentrant {
        require(account != address(0), "Zero address");
        _syncUser(account);
    }

    /// @notice 同步余额（与 register 相同，语义更清晰）
    function syncBalance() external nonReentrant { _syncUser(msg.sender); }

    function _syncUser(address account) internal {
        require(token != address(0), "Token not set");
        require(!blacklisted[account], "Blacklisted");

        uint256 onChain   = IERC20(token).balanceOf(account);
        require(onChain > 0, "No tokens held");

        UserInfo storage u = users[account];
        uint256 recorded   = u.totalBalance;

        if (onChain < recorded) {
            // 持仓减少 → 惩罚
            _penalizeUser(account);
            // 惩罚后如果还有余额，重新记录
            if (onChain > 0) _newPosition(account, onChain);
            return;
        }

        if (onChain > recorded) {
            // 持仓增加 → 先结算已有奖励，再新增批次
            uint256 newAmt = onChain - recorded;
            _settleRewards(account);           // 结算旧算力产生的奖励
            _newPosition(account, newAmt);     // 新批次，独立 startTime
            u.totalBalance = onChain;
            if (!u.registered) {
                // 首次注册
                u.registered = true;
                userList.push(account);
                activeUserCount++;
                emit Registered(account, onChain);
            } else {
                emit PositionAdded(account, newAmt, onChain);
            }
        }
        // onChain == recorded：无变化，不做操作
    }

    /// @dev 新增一个持仓批次，不动 rewardDebt（由调用方负责先 settle）
    function _newPosition(address account, uint256 amount) internal {
        UserInfo storage u = users[account];
        require(u.positions.length < MAX_POSITIONS, "Too many positions");
        u.positions.push(Position({ amount: amount, startTime: block.timestamp }));
        if (u.level == 0) u.level = 1;
    }

    /// @notice 领取分红
    function claim() external nonReentrant {
        require(token != address(0), "Token not set");
        UserInfo storage u = users[msg.sender];
        require(u.totalBalance > 0, "Not registered");

        uint256 onChain = IERC20(token).balanceOf(msg.sender);
        if (onChain < u.totalBalance) {
            _penalizeUser(msg.sender);
            return;
        }

        _settleRewards(msg.sender);

        uint256 mainAmt = u.pendingMainReward;
        uint256 diaAmt  = u.pendingDiaReward;
        uint256 total   = mainAmt + diaAmt;
        require(total > 0, "Nothing to claim");
        require(address(this).balance >= total, "Insufficient BNB");

        u.pendingMainReward  = 0;
        u.pendingDiaReward   = 0;
        u.totalClaimed      += total;
        totalMainDistributed += mainAmt;
        totalDiaDistributed  += diaAmt;

        emit Claimed(msg.sender, mainAmt, diaAmt);
        (bool ok,) = msg.sender.call{value: total}("");
        require(ok, "Transfer failed");
    }

    // ═══════════════════════════════════════════════════════════
    //  分红分发（内部）
    // ═══════════════════════════════════════════════════════════

    function _distributeMain() internal {
        if (mainRewardPool == 0 || activeUserCount == 0) return;
        uint256 tp = _calcTotalPower();
        if (tp == 0) return;
        uint256 amt = mainRewardPool;
        mainRewardPool = 0;
        lastMainDistributeTime = block.timestamp;
        mainAccPerPower += (amt * PRECISION) / tp;
        emit MainRewardDistributed(amt, tp);
    }

    function _distributeDiamond() internal {
        if (diaRewardPool == 0) return;
        uint256 dp = _calcDiamondPower();
        if (dp == 0) return;
        uint256 amt = diaRewardPool;
        diaRewardPool = 0;
        lastDiaDistributeTime = block.timestamp;
        diaAccPerPower += (amt * PRECISION) / dp;
        emit DiaRewardDistributed(amt, dp);
    }

    /// @notice 任何人可触发到期分发
    function triggerDistribution() external nonReentrant {
        if (block.timestamp >= lastMainDistributeTime + MAIN_REWARD_INTERVAL && mainRewardPool > 0)
            _distributeMain();
        if (block.timestamp >= lastDiaDistributeTime + DIAMOND_REWARD_INTERVAL && diaRewardPool > 0)
            _distributeDiamond();
    }

    // ═══════════════════════════════════════════════════════════
    //  奖励结算 / 惩罚 / 算力（内部）
    // ═══════════════════════════════════════════════════════════

    /// @dev 将 accPerPower 增量转化为 pending，更新 debt
    function _settleRewards(address account) internal {
        UserInfo storage u = users[account];
        if (u.totalBalance == 0) return;

        uint256 power = _userPower(account);

        // 主分红结算
        uint256 mainDelta = mainAccPerPower - u.mainRewardDebt;
        if (mainDelta > 0 && power > 0)
            u.pendingMainReward += (power * mainDelta) / PRECISION;
        u.mainRewardDebt = mainAccPerPower;

        // 钻石王者分红结算（仅 Lv10）
        uint256 diaDelta = diaAccPerPower - u.diaRewardDebt;
        if (diaDelta > 0 && power > 0 && _calcLevel(account) == 10)
            u.pendingDiaReward += (power * diaDelta) / PRECISION;
        u.diaRewardDebt = diaAccPerPower;
    }

    /// @dev 惩罚：清空持仓，等级降1，待领分红没收
    function _penalizeUser(address account) internal {
        UserInfo storage u = users[account];
        _settleRewards(account);

        uint8 oldLv = u.level;
        if (u.level > 1) u.level--;

        uint256 fm = u.pendingMainReward;
        uint256 fd = u.pendingDiaReward;
        u.pendingMainReward = 0;
        u.pendingDiaReward  = 0;
        mainRewardPool += fm;
        diaRewardPool  += fd;

        delete u.positions;
        u.totalBalance = 0;
        // 注意：registered 保留，防止重复入 userList
        if (activeUserCount > 0) activeUserCount--;

        emit UserPenalized(account, oldLv, u.level, fm, fd);
    }

    // ─── 等级与算力计算 ─────────────────────────────────────────

    function _oldestHeldHours(address account) internal view returns (uint256) {
        Position[] storage pos = users[account].positions;
        if (pos.length == 0) return 0;
        uint256 oldest = pos[0].startTime;
        for (uint256 i = 1; i < pos.length; i++)
            if (pos[i].startTime < oldest) oldest = pos[i].startTime;
        return (block.timestamp - oldest) / 1 hours;
    }

    function _calcLevel(address account) internal view returns (uint8) {
        uint256 h = _oldestHeldHours(account);
        for (uint8 lv = 10; lv >= 2; lv--)
            if (h >= _levelMinHours(lv)) return lv;
        return 1;
    }

    function _userPower(address account) internal view returns (uint256) {
        Position[] storage pos = users[account].positions;
        if (pos.length == 0) return 0;

        uint8   lv         = _calcLevel(account);
        uint256 multiplier = _levelMultiplier(lv);
        uint256 capUsed    = 0;
        uint256 power      = 0;

        for (uint256 i = 0; i < pos.length; i++) {
            if (capUsed >= MAX_WEIGHT_BALANCE) break;
            uint256 remaining = MAX_WEIGHT_BALANCE - capUsed;
            uint256 effective = pos[i].amount > remaining ? remaining : pos[i].amount;
            capUsed += effective;
            uint256 hrs = (block.timestamp - pos[i].startTime) / 1 hours;
            if (hrs == 0) continue;
            // power += effective × multiplier × hrs / 10
            power += (effective * multiplier * hrs) / 10;
        }
        return power;
    }

    function _calcTotalPower() internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < userList.length; i++) {
            if (users[userList[i]].totalBalance > 0)
                total += _userPower(userList[i]);
        }
        return total;
    }

    function _calcDiamondPower() internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < userList.length; i++) {
            address a = userList[i];
            if (users[a].totalBalance > 0 && _calcLevel(a) == 10)
                total += _userPower(a);
        }
        return total;
    }

    // ═══════════════════════════════════════════════════════════
    //  回购销毁 / 批量惩罚
    // ═══════════════════════════════════════════════════════════

    function _doBuybackBurn(uint256 bnbAmount) internal {
        if (bnbAmount == 0 || token == address(0)) return;
        address[] memory path = new address[](2);
        path[0] = IPancakeRouter02(PANCAKE_ROUTER).WETH();
        path[1] = token;
        try IPancakeRouter02(PANCAKE_ROUTER)
            .swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbAmount}(
                0, path, DEAD, block.timestamp + 300
            )
        {
            totalBuybackBurned += bnbAmount;
            emit BuybackBurn(bnbAmount);
        } catch {}
    }

    function batchPenalizeSellers(address[] calldata accounts) external nonReentrant {
        require(token != address(0), "Token not set");
        for (uint256 i = 0; i < accounts.length; i++) {
            UserInfo storage u = users[accounts[i]];
            if (u.totalBalance == 0) continue;
            uint256 cur = IERC20(token).balanceOf(accounts[i]);
            if (cur < u.totalBalance) {
                _penalizeUser(accounts[i]);
                if (cur > 0) {
                    _newPosition(accounts[i], cur);
                    users[accounts[i]].totalBalance = cur;
                    if (!users[accounts[i]].registered) {
                        users[accounts[i]].registered = true;
                        userList.push(accounts[i]);
                    }
                    activeUserCount++;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  对外查询
    // ═══════════════════════════════════════════════════════════

    function getUserInfo(address account) external view returns (
        uint256 totalBalance_,
        uint8   level_,
        uint256 oldestHeldHours_,
        uint256 power_,
        uint256 pendingMain_,
        uint256 pendingDia_,
        uint256 totalClaimed_,
        uint256 positionCount_
    ) {
        UserInfo storage u = users[account];
        totalBalance_     = u.totalBalance;
        level_            = _calcLevel(account);
        oldestHeldHours_  = _oldestHeldHours(account);
        power_            = _userPower(account);

        // 预测待领（含未结算部分）
        uint256 mainInc = power_ > 0
            ? (power_ * (mainAccPerPower - u.mainRewardDebt)) / PRECISION : 0;
        pendingMain_ = u.pendingMainReward + mainInc;

        uint256 diaInc = (power_ > 0 && _calcLevel(account) == 10)
            ? (power_ * (diaAccPerPower - u.diaRewardDebt)) / PRECISION : 0;
        pendingDia_  = u.pendingDiaReward + diaInc;

        totalClaimed_  = u.totalClaimed;
        positionCount_ = u.positions.length;
    }

    function getUserPositions(address account) external view returns (
        uint256[] memory amounts_,
        uint256[] memory startTimes_,
        uint256[] memory heldHours_
    ) {
        Position[] storage pos = users[account].positions;
        uint256 len = pos.length;
        amounts_    = new uint256[](len);
        startTimes_ = new uint256[](len);
        heldHours_  = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            amounts_[i]    = pos[i].amount;
            startTimes_[i] = pos[i].startTime;
            heldHours_[i]  = (block.timestamp - pos[i].startTime) / 1 hours;
        }
    }

    function getLevelInfo(address account) external view returns (
        uint8  level_,
        string memory levelName_,
        uint256 multiplier_,
        uint256 heldHours_,
        uint256 nextLevelHours_
    ) {
        level_      = _calcLevel(account);
        multiplier_ = _levelMultiplier(level_);
        heldHours_  = _oldestHeldHours(account);
        string[10] memory names = [
            "Lv1 Ant",    "Lv2 Worker",  "Lv3 Soldier",
            "Lv4 Scout",  "Lv5 Guard",   "Lv6 Captain",
            "Lv7 Elite",  "Lv8 Veteran", "Lv9 Elder",  "Lv10 Queen"
        ];
        levelName_      = names[level_ - 1];
        nextLevelHours_ = level_ < 10 ? _levelMinHours(uint8(level_ + 1)) : 0;
    }

    function getGlobalStats() external view returns (
        uint256 totalPower_,
        uint256 mainPool_,
        uint256 diaPool_,
        uint256 totalMainDist_,
        uint256 totalDiaDist_,
        uint256 totalBuyback_,
        uint256 activeUsers_,
        uint256 nextMainDistTime_,
        uint256 nextDiaDistTime_,
        uint256 contractBNB_
    ) {
        totalPower_       = _calcTotalPower();
        mainPool_         = mainRewardPool;
        diaPool_          = diaRewardPool;
        totalMainDist_    = totalMainDistributed;
        totalDiaDist_     = totalDiaDistributed;
        totalBuyback_     = totalBuybackBurned;
        activeUsers_      = activeUserCount;
        nextMainDistTime_ = lastMainDistributeTime + MAIN_REWARD_INTERVAL;
        nextDiaDistTime_  = lastDiaDistributeTime  + DIAMOND_REWARD_INTERVAL;
        contractBNB_      = address(this).balance;
    }

    function getLevelTable() external pure returns (
        uint256[10] memory minHours_,
        uint256[10] memory multipliers_
    ) {
        for (uint8 i = 1; i <= 10; i++) {
            minHours_[i-1]     = _levelMinHours(i);
            multipliers_[i-1]  = _levelMultiplier(i);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Owner 管理
    // ═══════════════════════════════════════════════════════════

    function setToken(address _token) external onlyOwner {
        require(_token != address(0), "Zero address");
        token = _token;
        emit TokenSet(_token);
    }

    function setBlacklist(address account, bool status) external onlyOwner {
        blacklisted[account] = status;
    }

    function fundMainPool() external payable onlyOwner { mainRewardPool += msg.value; }
    function fundDiaPool()  external payable onlyOwner { diaRewardPool  += msg.value; }

    function manualBuybackBurn() external payable onlyOwner {
        _doBuybackBurn(msg.value);
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        (bool ok,) = owner().call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
