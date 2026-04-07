// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ═══════════════════════════════════════════════════════════════
//  DiamondVault v3 — 钻石手等级算力分红合约
//  BSC Testnet
//
//  核心机制：
//  个人算力 = min(持币, 500万) × 等级倍率 × 持有小时数
//
//  等级系统（10级，按持币小时数升级）：
//  Lv1 散户    0~24h    × 1.0
//  Lv2 铁杆   24~60h    × 1.1
//  Lv3 坚守   60~96h    × 1.2
//  Lv4 信仰   96~132h   × 1.3
//  Lv5 长持  132~168h   × 1.4
//  Lv6 恒心  168~228h   × 1.6
//  Lv7 钻石新秀 228~288h × 1.8
//  Lv8 钻石手 288~348h  × 2.0
//  Lv9 钻石长老 348~408h × 2.2
//  Lv10 钻石王者 408h+  × 2.5
//
//  卖出/转出惩罚：算力清零，等级降1级（最低Lv1）
//  分红周期：主分红 2小时，钻石王者额外分红 48小时
//  回购销毁：Vault收到BNB立即在市场买Token销毁
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
}

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    constructor() { _status = NOT_ENTERED; }
    modifier nonReentrant() {
        require(_status != ENTERED, "Reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
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

contract DiamondVault is Ownable, ReentrancyGuard {

    // ═══════════════════════════════════════════════════════════
    //  常量
    // ═══════════════════════════════════════════════════════════

    uint256 public constant PRECISION            = 1e18;
    uint256 public constant MAX_WEIGHT_BALANCE   = 5_000_000 * 1e18;  // 500万封顶
    uint256 public constant MAIN_REWARD_INTERVAL = 2 hours;
    uint256 public constant DIAMOND_REWARD_INTERVAL = 48 hours;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // 等级阈值（小时数）
    uint256[10] public LEVEL_HOURS = [0, 24, 60, 96, 132, 168, 228, 288, 348, 408];
    // 等级倍率（×10，避免小数）：1.0 1.1 1.2 1.3 1.4 1.6 1.8 2.0 2.2 2.5
    uint256[10] public LEVEL_MULTIPLIER = [10, 11, 12, 13, 14, 16, 18, 20, 22, 25];

    // ═══════════════════════════════════════════════════════════
    //  地址配置
    // ═══════════════════════════════════════════════════════════

    address public token;
    address public pancakeRouter;
    address public tokenContract; // DiamondToken合约地址（用于接收税费通知）

    // ═══════════════════════════════════════════════════════════
    //  用户数据结构
    // ═══════════════════════════════════════════════════════════

    struct UserInfo {
        uint256 balance;           // 注册时的持币快照
        uint256 startTime;         // 最近一次开始持有时间（0=未注册）
        uint8   level;             // 当前等级 1~10（降级后保留）
        uint256 pendingMainReward; // 待领取主分红
        uint256 pendingDiaReward;  // 待领取钻石王者分红
        uint256 totalClaimed;      // 历史总领取
        // 分红快照（用于增量计算）
        uint256 mainRewardDebt;
        uint256 diaRewardDebt;
    }

    mapping(address => UserInfo) public users;
    address[] public userList;
    mapping(address => bool) public userRegistered;
    uint256 public activeUserCount;

    // ═══════════════════════════════════════════════════════════
    //  全网算力追踪（用快照+delta模式）
    // ═══════════════════════════════════════════════════════════

    // 全网累积算力快照（每次分红时刷新）
    uint256 public lastMainDistributeTime;
    uint256 public lastDiaDistributeTime;

    // 待分配的BNB池
    uint256 public mainRewardPool;     // 主分红池（62%）
    uint256 public diaRewardPool;      // 钻石王者池（13%）
    uint256 public totalBuybackBurned; // 总回购销毁BNB
    uint256 public totalMainDistributed;
    uint256 public totalDiaDistributed;

    // 全局累加器（用于 O(n) 分红分发）
    // 每次分红时遍历用户计算权重，分配BNB
    // 注意：用户量大时需要链下触发+链上批量分发

    // ─── 待发放的个人奖励（分红时按权重写入每个用户）
    // 使用全局每算力应得BNB的累加器（类似流动性挖矿）
    // mainAccPerPower: 每单位算力(PRECISION)累计应得主分红BNB
    uint256 public mainAccPerPower;
    uint256 public diaAccPerPower;

    // 全网总算力快照（上次分红时记录）
    uint256 public totalPowerSnapshot;
    uint256 public lastPowerSnapshotTime;

    // ═══════════════════════════════════════════════════════════
    //  黑名单
    // ═══════════════════════════════════════════════════════════
    mapping(address => bool) public blacklisted;

    // ═══════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════
    event Registered(address indexed user, uint256 balance, uint8 level);
    event BalanceSynced(address indexed user, uint256 oldBal, uint256 newBal);
    event UserPenalized(address indexed user, uint8 oldLevel, uint8 newLevel, uint256 forfeitedMain, uint256 forfeitedDia);
    event MainRewardDistributed(uint256 amount, uint256 totalPower, uint256 timestamp);
    event DiaRewardDistributed(uint256 amount, uint256 totalPower, uint256 timestamp);
    event Claimed(address indexed user, uint256 mainAmount, uint256 diaAmount);
    event BuybackBurn(uint256 bnbAmount);
    event MainRewardReceived(uint256 amount);
    event DiaRewardReceived(uint256 amount);
    event BuybackReceived(uint256 amount);

    // ═══════════════════════════════════════════════════════════
    //  Modifiers
    // ═══════════════════════════════════════════════════════════

    modifier onlyToken() {
        require(msg.sender == tokenContract, "Only token");
        _;
    }

    // ═══════════════════════════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════════════════════════

    constructor(address _router) Ownable(msg.sender) {
        pancakeRouter = _router;
        lastMainDistributeTime = block.timestamp;
        lastDiaDistributeTime  = block.timestamp;
        lastPowerSnapshotTime  = block.timestamp;
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════════════
    //  接收分红来源（由 DiamondToken 调用）
    // ═══════════════════════════════════════════════════════════

    function receiveMainReward() external payable {
        mainRewardPool += msg.value;
        emit MainRewardReceived(msg.value);

        // 如果到了分红时间，立即触发
        if (block.timestamp >= lastMainDistributeTime + MAIN_REWARD_INTERVAL) {
            _distributeMain();
        }
    }

    function receiveDiamondReward() external payable {
        diaRewardPool += msg.value;
        emit DiaRewardReceived(msg.value);

        if (block.timestamp >= lastDiaDistributeTime + DIAMOND_REWARD_INTERVAL) {
            _distributeDiamond();
        }
    }

    function receiveBuybackBurn() external payable {
        emit BuybackReceived(msg.value);
        _doBuybackBurn(msg.value);
    }

    // ═══════════════════════════════════════════════════════════
    //  用户操作
    // ═══════════════════════════════════════════════════════════

    /// @notice 注册参与分红
    function register() external nonReentrant {
        _registerUser(msg.sender);
    }

    function registerFor(address account) external nonReentrant {
        require(account != address(0), "Zero address");
        _registerUser(account);
    }

    function _registerUser(address account) internal {
        require(token != address(0), "Token not set");
        require(!blacklisted[account], "Blacklisted");

        uint256 currentBalance = IERC20(token).balanceOf(account);
        require(currentBalance > 0, "No tokens held");

        UserInfo storage u = users[account];

        if (u.balance > 0) {
            // 已注册，检查余额变化
            if (currentBalance < u.balance) {
                // 卖出了，惩罚
                _penalizeUser(account);
                // 重新注册
                _initUser(account, currentBalance);
            } else if (currentBalance > u.balance) {
                // 买入了更多，更新余额（时间戳不变，级别不变）
                _updateUserRewards(account);
                u.balance = currentBalance;
                emit BalanceSynced(account, u.balance, currentBalance);
            }
            // 余额不变，什么都不做
        } else {
            // 首次注册
            _initUser(account, currentBalance);
            if (!userRegistered[account]) {
                userList.push(account);
                userRegistered[account] = true;
            }
            activeUserCount++;
        }
    }

    function _initUser(address account, uint256 balance) internal {
        UserInfo storage u = users[account];
        // 结算旧的待领取奖励（如果有）
        // pendingMainReward 和 pendingDiaReward 保留（惩罚时已清零）

        u.balance   = balance;
        u.startTime = block.timestamp;
        // level保留（已惩罚降级）
        if (u.level == 0) u.level = 1;
        u.mainRewardDebt = mainAccPerPower;
        u.diaRewardDebt  = diaAccPerPower;
    }

    /// @notice 同步余额（买入更多代币后调用）
    function syncBalance() external nonReentrant {
        require(token != address(0), "Token not set");
        UserInfo storage u = users[msg.sender];
        require(u.balance > 0, "Not registered");

        uint256 currentBalance = IERC20(token).balanceOf(msg.sender);

        if (currentBalance < u.balance) {
            _penalizeUser(msg.sender);
            _initUser(msg.sender, currentBalance);
            return;
        }

        if (currentBalance > u.balance) {
            _updateUserRewards(msg.sender);
            u.balance = currentBalance;
            emit BalanceSynced(msg.sender, u.balance, currentBalance);
        }
    }

    /// @notice 领取分红
    function claim() external nonReentrant {
        require(token != address(0), "Token not set");
        UserInfo storage u = users[msg.sender];
        require(u.balance > 0, "Not registered");

        // 先检查是否被惩罚
        uint256 currentBalance = IERC20(token).balanceOf(msg.sender);
        if (currentBalance < u.balance) {
            _penalizeUser(msg.sender);
            return; // 惩罚后没有奖励可领
        }

        // 结算最新奖励
        _updateUserRewards(msg.sender);

        uint256 mainAmt = u.pendingMainReward;
        uint256 diaAmt  = u.pendingDiaReward;
        uint256 total   = mainAmt + diaAmt;

        require(total > 0, "Nothing to claim");
        require(address(this).balance >= total, "Insufficient BNB");

        u.pendingMainReward = 0;
        u.pendingDiaReward  = 0;
        u.totalClaimed     += total;
        totalMainDistributed += mainAmt;
        totalDiaDistributed  += diaAmt;

        emit Claimed(msg.sender, mainAmt, diaAmt);
        (bool sent,) = msg.sender.call{value: total}("");
        require(sent, "Transfer failed");
    }

    // ═══════════════════════════════════════════════════════════
    //  分红分发（内部）
    // ═══════════════════════════════════════════════════════════

    /// @notice 主分红（每2小时），面向所有注册用户
    function _distributeMain() internal {
        if (mainRewardPool == 0) return;
        if (activeUserCount == 0) return;

        uint256 totalPower = _calcTotalPower();
        if (totalPower == 0) return;

        uint256 amount = mainRewardPool;
        mainRewardPool = 0;
        lastMainDistributeTime = block.timestamp;

        // 更新全局累加器：每单位算力分得多少BNB
        mainAccPerPower += (amount * PRECISION) / totalPower;

        emit MainRewardDistributed(amount, totalPower, block.timestamp);
    }

    /// @notice 钻石王者额外分红（每48小时），仅Lv10
    function _distributeDiamond() internal {
        if (diaRewardPool == 0) return;

        uint256 diamondPower = _calcDiamondPower();
        if (diamondPower == 0) return;

        uint256 amount = diaRewardPool;
        diaRewardPool = 0;
        lastDiaDistributeTime = block.timestamp;

        diaAccPerPower += (amount * PRECISION) / diamondPower;

        emit DiaRewardDistributed(amount, diamondPower, block.timestamp);
    }

    /// @notice 公共触发分红（任何人可调用，让链外bot触发）
    function triggerDistribution() external nonReentrant {
        if (block.timestamp >= lastMainDistributeTime + MAIN_REWARD_INTERVAL && mainRewardPool > 0) {
            _distributeMain();
        }
        if (block.timestamp >= lastDiaDistributeTime + DIAMOND_REWARD_INTERVAL && diaRewardPool > 0) {
            _distributeDiamond();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  奖励结算（内部）
    // ═══════════════════════════════════════════════════════════

    function _updateUserRewards(address account) internal {
        UserInfo storage u = users[account];
        if (u.balance == 0) return;

        uint256 power = _userPower(account);

        // 主分红增量
        uint256 mainDelta = mainAccPerPower - u.mainRewardDebt;
        u.pendingMainReward += (power * mainDelta) / PRECISION;
        u.mainRewardDebt = mainAccPerPower;

        // 钻石王者分红增量（只有Lv10才参与）
        if (_currentLevel(account) == 10) {
            uint256 diaDelta = diaAccPerPower - u.diaRewardDebt;
            u.pendingDiaReward += (power * diaDelta) / PRECISION;
        }
        u.diaRewardDebt = diaAccPerPower;
    }

    // ═══════════════════════════════════════════════════════════
    //  惩罚逻辑
    // ═══════════════════════════════════════════════════════════

    function _penalizeUser(address account) internal {
        UserInfo storage u = users[account];
        _updateUserRewards(account);

        uint8 oldLevel = u.level;
        // 等级降1（最低1）
        if (u.level > 1) u.level--;

        // 没收未领奖励，回流分红池
        uint256 forfeitedMain = u.pendingMainReward;
        uint256 forfeitedDia  = u.pendingDiaReward;
        u.pendingMainReward = 0;
        u.pendingDiaReward  = 0;

        // 回流
        mainRewardPool += forfeitedMain;
        diaRewardPool  += forfeitedDia;

        // 清空注册状态（balance=0表示未注册，startTime会在_initUser中重设）
        uint256 oldBal = u.balance;
        u.balance   = 0;
        u.startTime = 0;

        if (activeUserCount > 0) activeUserCount--;

        emit UserPenalized(account, oldLevel, u.level, forfeitedMain, forfeitedDia);
        emit BalanceSynced(account, oldBal, 0);
    }

    // ═══════════════════════════════════════════════════════════
    //  回购销毁
    // ═══════════════════════════════════════════════════════════

    function _doBuybackBurn(uint256 bnbAmount) internal {
        if (bnbAmount == 0 || token == address(0) || pancakeRouter == address(0)) return;

        address[] memory path = new address[](2);
        path[0] = IPancakeRouter02(pancakeRouter).WETH();
        path[1] = token;

        try IPancakeRouter02(pancakeRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbAmount}(
            0,
            path,
            DEAD,
            block.timestamp + 300
        ) {
            totalBuybackBurned += bnbAmount;
            emit BuybackBurn(bnbAmount);
        } catch {
            // swap失败，BNB保留在合约，可手动处理
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  算力计算（View）
    // ═══════════════════════════════════════════════════════════

    /// @notice 用户当前等级（1~10）
    function _currentLevel(address account) internal view returns (uint8) {
        UserInfo storage u = users[account];
        if (u.startTime == 0) return u.level > 0 ? u.level : 1;

        uint256 heldHours = (block.timestamp - u.startTime) / 1 hours;
        uint8 lv = 1;
        for (uint8 i = 9; i >= 1; i--) {
            if (heldHours >= LEVEL_HOURS[i]) {
                lv = i + 1;
                break;
            }
        }
        // 等级不能超过因惩罚降级后的等级上限？
        // 设计：时间升级不受惩罚影响，惩罚只影响startTime重置→自然降级
        return lv;
    }

    /// @notice 用户算力 = min(balance, 500万) × 等级倍率 × 持有小时数
    function _userPower(address account) internal view returns (uint256) {
        UserInfo storage u = users[account];
        if (u.balance == 0 || u.startTime == 0) return 0;

        uint256 cappedBal = u.balance > MAX_WEIGHT_BALANCE ? MAX_WEIGHT_BALANCE : u.balance;
        uint8   lv        = _currentLevel(account);
        uint256 multiplier = LEVEL_MULTIPLIER[lv - 1]; // ×10精度
        uint256 heldHours = (block.timestamp - u.startTime) / 1 hours;
        if (heldHours == 0) return 0; // 持币不足1小时无算力

        // power = cappedBal * multiplier * heldHours / 10（除以10还原倍率精度）
        return (cappedBal * multiplier * heldHours) / 10;
    }

    function _calcTotalPower() internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < userList.length; i++) {
            address acc = userList[i];
            if (users[acc].balance > 0) {
                total += _userPower(acc);
            }
        }
        return total;
    }

    function _calcDiamondPower() internal view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < userList.length; i++) {
            address acc = userList[i];
            if (users[acc].balance > 0 && _currentLevel(acc) == 10) {
                total += _userPower(acc);
            }
        }
        return total;
    }

    // ═══════════════════════════════════════════════════════════
    //  批量操作（清理已卖出用户）
    // ═══════════════════════════════════════════════════════════

    function batchPenalizeSellers(address[] calldata accounts) external nonReentrant {
        require(token != address(0), "Token not set");
        for (uint256 i = 0; i < accounts.length; i++) {
            UserInfo storage u = users[accounts[i]];
            if (u.balance == 0) continue;
            uint256 current = IERC20(token).balanceOf(accounts[i]);
            if (current < u.balance) {
                _penalizeUser(accounts[i]);
                if (current > 0) _initUser(accounts[i], current);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  View Functions
    // ═══════════════════════════════════════════════════════════

    function getUserInfo(address account) external view returns (
        uint256 balance,
        uint256 cappedBalance,
        uint8   level,
        uint256 heldHours,
        uint256 power,
        uint256 pendingMain,
        uint256 pendingDia,
        uint256 totalClaimed_
    ) {
        UserInfo storage u = users[account];
        balance        = u.balance;
        cappedBalance  = u.balance > MAX_WEIGHT_BALANCE ? MAX_WEIGHT_BALANCE : u.balance;
        level          = _currentLevel(account);
        heldHours      = u.startTime > 0 ? (block.timestamp - u.startTime) / 1 hours : 0;
        power          = _userPower(account);

        // 计算待领取（含未结算增量）
        uint256 pw = _userPower(account);
        uint256 mainInc = pw > 0 ? (pw * (mainAccPerPower - u.mainRewardDebt)) / PRECISION : 0;
        pendingMain = u.pendingMainReward + mainInc;

        uint256 diaInc = (pw > 0 && _currentLevel(account) == 10)
            ? (pw * (diaAccPerPower - u.diaRewardDebt)) / PRECISION
            : 0;
        pendingDia = u.pendingDiaReward + diaInc;

        totalClaimed_ = u.totalClaimed;
    }

    function getLevelInfo(address account) external view returns (
        uint8  currentLevel_,
        string memory levelName,
        uint256 multiplier_,
        uint256 heldHours_,
        uint256 nextLevelHours
    ) {
        currentLevel_ = _currentLevel(account);
        multiplier_   = LEVEL_MULTIPLIER[currentLevel_ - 1];
        UserInfo storage u = users[account];
        heldHours_ = u.startTime > 0 ? (block.timestamp - u.startTime) / 1 hours : 0;

        string[10] memory names = [
            unicode"Lv1 散户", unicode"Lv2 铁杆", unicode"Lv3 坚守",
            unicode"Lv4 信仰", unicode"Lv5 长持", unicode"Lv6 恒心",
            unicode"Lv7 钻石新秀", unicode"Lv8 钻石手",
            unicode"Lv9 钻石长老", unicode"Lv10 钻石王者"
        ];
        levelName = names[currentLevel_ - 1];
        nextLevelHours = currentLevel_ < 10 ? LEVEL_HOURS[currentLevel_] : 0;
    }

    function getGlobalStats() external view returns (
        uint256 totalPower_,
        uint256 mainPool_,
        uint256 diaPool_,
        uint256 totalMainDist_,
        uint256 totalDiaDist_,
        uint256 totalBuyback_,
        uint256 activeUsers_,
        uint256 nextMainDistTime,
        uint256 nextDiaDistTime,
        uint256 contractBNB
    ) {
        totalPower_      = _calcTotalPower();
        mainPool_        = mainRewardPool;
        diaPool_         = diaRewardPool;
        totalMainDist_   = totalMainDistributed;
        totalDiaDist_    = totalDiaDistributed;
        totalBuyback_    = totalBuybackBurned;
        activeUsers_     = activeUserCount;
        nextMainDistTime = lastMainDistributeTime + MAIN_REWARD_INTERVAL;
        nextDiaDistTime  = lastDiaDistributeTime  + DIAMOND_REWARD_INTERVAL;
        contractBNB      = address(this).balance;
    }

    function getUserPower(address account) external view returns (uint256) {
        return _userPower(account);
    }

    function getTotalPower() external view returns (uint256) {
        return _calcTotalPower();
    }

    function getAllUsers() external view returns (address[] memory) {
        return userList;
    }

    // ═══════════════════════════════════════════════════════════
    //  Owner 函数
    // ═══════════════════════════════════════════════════════════

    function setToken(address _token) external onlyOwner {
        require(_token != address(0), "Zero address");
        token = _token;
    }

    function setTokenContract(address _tokenContract) external onlyOwner {
        tokenContract = _tokenContract;
    }

    function setPancakeRouter(address _router) external onlyOwner {
        pancakeRouter = _router;
    }

    function setBlacklist(address account, bool status) external onlyOwner {
        blacklisted[account] = status;
    }

    /// @notice 手动注入主分红池
    function fundMainPool() external payable onlyOwner {
        mainRewardPool += msg.value;
    }

    /// @notice 手动注入钻石王者池
    function fundDiaPool() external payable onlyOwner {
        diaRewardPool += msg.value;
    }

    /// @notice 手动触发回购销毁
    function manualBuybackBurn() external payable onlyOwner {
        _doBuybackBurn(msg.value);
    }

    /// @notice 紧急提取（防资金永久锁死）
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        (bool sent,) = owner().call{value: amount}("");
        require(sent, "Transfer failed");
    }
}
