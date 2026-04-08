// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ═══════════════════════════════════════════════════════════════
//  DiamondVault v4 — 蚁群算力分红合约（分批持仓版）
//  BSC Mainnet
//
//  算力公式：总算力 = Σ(每批持仓算力)
//  每批算力 = min(该批数量, 剩余可用封顶额度) × 等级倍率 × 该批持有小时数
//
//  等级系统（10级，按最早一批持有时间升级）：
//  Lv1  散户      0~24h    × 1.0
//  Lv2  铁杆     24~60h    × 1.1
//  Lv3  坚守     60~96h    × 1.2
//  Lv4  信仰     96~132h   × 1.3
//  Lv5  长持    132~168h   × 1.4
//  Lv6  恒心    168~228h   × 1.6
//  Lv7  钻石新秀 228~288h  × 1.8
//  Lv8  钻石手  288~348h   × 2.0
//  Lv9  钻石长老 348~408h  × 2.2
//  Lv10 钻石王者  408h+    × 2.5
//
//  卖出/转出惩罚：所有持仓清零，等级降1级
//  分红周期：主分红 2小时，钻石王者额外分红 48小时
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

    // ─── 常量 ─────────────────────────────────────────────────
    uint256 public constant PRECISION               = 1e18;
    uint256 public constant MAX_WEIGHT_BALANCE      = 5_000_000 * 1e18;
    uint256 public constant MAIN_REWARD_INTERVAL    = 2 hours;
    uint256 public constant DIAMOND_REWARD_INTERVAL = 48 hours;
    uint256 public constant MAX_POSITIONS           = 50;
    address public constant DEAD                    = 0x000000000000000000000000000000000000dEaD;

    // BSC Mainnet PancakeSwap Router v2（写死，无需构造函数传入）
    address public constant PANCAKE_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    uint256[10] public LEVEL_HOURS      = [0, 24, 60, 96, 132, 168, 228, 288, 348, 408];
    uint256[10] public LEVEL_MULTIPLIER = [10, 11, 12, 13, 14, 16, 18, 20, 22, 25];

    // ─── 地址 ─────────────────────────────────────────────────
    address public token;

    // ─── 分批持仓结构 ─────────────────────────────────────────
    struct Position {
        uint256 amount;
        uint256 startTime;
    }

    struct UserInfo {
        Position[] positions;
        uint8   level;
        uint256 totalBalance;
        uint256 pendingMainReward;
        uint256 pendingDiaReward;
        uint256 totalClaimed;
        uint256 mainRewardDebt;
        uint256 diaRewardDebt;
    }

    mapping(address => UserInfo) public users;
    address[] public userList;
    mapping(address => bool) public userRegistered;
    uint256 public activeUserCount;

    // ─── 分红池 ───────────────────────────────────────────────
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

    // ─── Events ───────────────────────────────────────────────
    event Registered(address indexed user, uint256 amount, uint256 positionIndex);
    event PositionAdded(address indexed user, uint256 amount, uint256 positionIndex);
    event UserPenalized(address indexed user, uint8 oldLevel, uint8 newLevel, uint256 forfeitedMain, uint256 forfeitedDia);
    event MainRewardDistributed(uint256 amount, uint256 totalPower);
    event DiaRewardDistributed(uint256 amount, uint256 totalPower);
    event Claimed(address indexed user, uint256 mainAmount, uint256 diaAmount);
    event BuybackBurn(uint256 bnbAmount);
    event MainRewardReceived(uint256 amount);
    event DiaRewardReceived(uint256 amount);
    event BuybackReceived(uint256 amount);

    // ★ 构造函数无参数，直接部署即可
    constructor() Ownable(msg.sender) {
        lastMainDistributeTime = block.timestamp;
        lastDiaDistributeTime  = block.timestamp;
    }

    receive() external payable {}

    // ═══════════════════════════════════════════════════════════
    //  接收分红 BNB
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

    function register() external nonReentrant { _registerOrAdd(msg.sender); }

    function registerFor(address account) external nonReentrant {
        require(account != address(0), "Zero address");
        _registerOrAdd(account);
    }

    function syncBalance() external nonReentrant { _registerOrAdd(msg.sender); }

    function _registerOrAdd(address account) internal {
        require(token != address(0), "Token not set");
        require(!blacklisted[account], "Blacklisted");
        uint256 onChainBalance = IERC20(token).balanceOf(account);
        require(onChainBalance > 0, "No tokens held");
        UserInfo storage u = users[account];
        uint256 recorded = u.totalBalance;
        if (onChainBalance < recorded) {
            _penalizeUser(account);
            _addPosition(account, onChainBalance);
            return;
        }
        if (onChainBalance > recorded) {
            uint256 newAmount = onChainBalance - recorded;
            _updateUserRewards(account);
            _addPosition(account, newAmount);
            u.totalBalance = onChainBalance;
            emit PositionAdded(account, newAmount, u.positions.length - 1);
            return;
        }
    }

    function _addPosition(address account, uint256 amount) internal {
        UserInfo storage u = users[account];
        require(u.positions.length < MAX_POSITIONS, "Too many positions");
        bool isFirst = u.totalBalance == 0 && u.positions.length == 0;
        u.positions.push(Position({ amount: amount, startTime: block.timestamp }));
        u.mainRewardDebt = mainAccPerPower;
        u.diaRewardDebt  = diaAccPerPower;
        if (u.level == 0) u.level = 1;
        if (isFirst) {
            u.totalBalance = amount;
            if (!userRegistered[account]) {
                userList.push(account);
                userRegistered[account] = true;
            }
            activeUserCount++;
            emit Registered(account, amount, 0);
        }
    }

    function claim() external nonReentrant {
        require(token != address(0), "Token not set");
        UserInfo storage u = users[msg.sender];
        require(u.totalBalance > 0, "Not registered");
        uint256 onChainBalance = IERC20(token).balanceOf(msg.sender);
        if (onChainBalance < u.totalBalance) { _penalizeUser(msg.sender); return; }
        _updateUserRewards(msg.sender);
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
        (bool sent,) = msg.sender.call{value: total}("");
        require(sent, "Transfer failed");
    }

    // ═══════════════════════════════════════════════════════════
    //  分红分发
    // ═══════════════════════════════════════════════════════════

    function _distributeMain() internal {
        if (mainRewardPool == 0 || activeUserCount == 0) return;
        uint256 totalPower = _calcTotalPower();
        if (totalPower == 0) return;
        uint256 amount = mainRewardPool;
        mainRewardPool = 0;
        lastMainDistributeTime = block.timestamp;
        mainAccPerPower += (amount * PRECISION) / totalPower;
        emit MainRewardDistributed(amount, totalPower);
    }

    function _distributeDiamond() internal {
        if (diaRewardPool == 0) return;
        uint256 diamondPower = _calcDiamondPower();
        if (diamondPower == 0) return;
        uint256 amount = diaRewardPool;
        diaRewardPool = 0;
        lastDiaDistributeTime = block.timestamp;
        diaAccPerPower += (amount * PRECISION) / diamondPower;
        emit DiaRewardDistributed(amount, diamondPower);
    }

    function triggerDistribution() external nonReentrant {
        if (block.timestamp >= lastMainDistributeTime + MAIN_REWARD_INTERVAL && mainRewardPool > 0)
            _distributeMain();
        if (block.timestamp >= lastDiaDistributeTime + DIAMOND_REWARD_INTERVAL && diaRewardPool > 0)
            _distributeDiamond();
    }

    // ═══════════════════════════════════════════════════════════
    //  奖励结算 / 惩罚 / 算力
    // ═══════════════════════════════════════════════════════════

    function _updateUserRewards(address account) internal {
        UserInfo storage u = users[account];
        if (u.totalBalance == 0) return;
        uint256 power = _userPower(account);
        uint256 mainDelta = mainAccPerPower - u.mainRewardDebt;
        u.pendingMainReward += (power * mainDelta) / PRECISION;
        u.mainRewardDebt = mainAccPerPower;
        if (_oldestPositionLevel(account) == 10) {
            uint256 diaDelta = diaAccPerPower - u.diaRewardDebt;
            u.pendingDiaReward += (power * diaDelta) / PRECISION;
        }
        u.diaRewardDebt = diaAccPerPower;
    }

    function _penalizeUser(address account) internal {
        UserInfo storage u = users[account];
        _updateUserRewards(account);
        uint8 oldLevel = u.level;
        if (u.level > 1) u.level--;
        uint256 forfeitedMain = u.pendingMainReward;
        uint256 forfeitedDia  = u.pendingDiaReward;
        u.pendingMainReward = 0;
        u.pendingDiaReward  = 0;
        mainRewardPool += forfeitedMain;
        diaRewardPool  += forfeitedDia;
        delete u.positions;
        u.totalBalance = 0;
        if (activeUserCount > 0) activeUserCount--;
        emit UserPenalized(account, oldLevel, u.level, forfeitedMain, forfeitedDia);
    }

    function _oldestHeldHours(address account) internal view returns (uint256) {
        UserInfo storage u = users[account];
        if (u.positions.length == 0) return 0;
        uint256 oldest = u.positions[0].startTime;
        for (uint256 i = 1; i < u.positions.length; i++) {
            if (u.positions[i].startTime < oldest) oldest = u.positions[i].startTime;
        }
        return (block.timestamp - oldest) / 1 hours;
    }

    function _oldestPositionLevel(address account) internal view returns (uint8) {
        uint256 h = _oldestHeldHours(account);
        for (uint8 i = 9; i >= 1; i--) {
            if (h >= LEVEL_HOURS[i]) return i + 1;
        }
        return 1;
    }

    function _userPower(address account) internal view returns (uint256) {
        UserInfo storage u = users[account];
        if (u.positions.length == 0) return 0;
        uint8   lv         = _oldestPositionLevel(account);
        uint256 multiplier = LEVEL_MULTIPLIER[lv - 1];
        uint256 capUsed    = 0;
        uint256 totalPower = 0;
        for (uint256 i = 0; i < u.positions.length; i++) {
            Position storage p = u.positions[i];
            if (capUsed >= MAX_WEIGHT_BALANCE) break;
            uint256 remaining = MAX_WEIGHT_BALANCE - capUsed;
            uint256 effective = p.amount > remaining ? remaining : p.amount;
            capUsed += effective;
            uint256 heldHours = (block.timestamp - p.startTime) / 1 hours;
            if (heldHours == 0) continue;
            totalPower += (effective * multiplier * heldHours) / 10;
        }
        return totalPower;
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
            address acc = userList[i];
            if (users[acc].totalBalance > 0 && _oldestPositionLevel(acc) == 10)
                total += _userPower(acc);
        }
        return total;
    }

    // ═══════════════════════════════════════════════════════════
    //  回购销毁 / 批量操作
    // ═══════════════════════════════════════════════════════════

    function _doBuybackBurn(uint256 bnbAmount) internal {
        if (bnbAmount == 0 || token == address(0)) return;
        address[] memory path = new address[](2);
        path[0] = IPancakeRouter02(PANCAKE_ROUTER).WETH();
        path[1] = token;
        try IPancakeRouter02(PANCAKE_ROUTER).swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: bnbAmount
        }(0, path, DEAD, block.timestamp + 300) {
            totalBuybackBurned += bnbAmount;
            emit BuybackBurn(bnbAmount);
        } catch {}
    }

    function batchPenalizeSellers(address[] calldata accounts) external nonReentrant {
        require(token != address(0), "Token not set");
        for (uint256 i = 0; i < accounts.length; i++) {
            UserInfo storage u = users[accounts[i]];
            if (u.totalBalance == 0) continue;
            uint256 current = IERC20(token).balanceOf(accounts[i]);
            if (current < u.totalBalance) {
                _penalizeUser(accounts[i]);
                if (current > 0) {
                    _addPosition(accounts[i], current);
                    users[accounts[i]].totalBalance = current;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  View Functions
    // ═══════════════════════════════════════════════════════════

    function getUserInfo(address account) external view returns (
        uint256 totalBalance_,
        uint8   level,
        uint256 oldestHeldHours,
        uint256 power,
        uint256 pendingMain,
        uint256 pendingDia,
        uint256 totalClaimed_,
        uint256 positionCount
    ) {
        UserInfo storage u = users[account];
        totalBalance_   = u.totalBalance;
        level           = _oldestPositionLevel(account);
        oldestHeldHours = _oldestHeldHours(account);
        power           = _userPower(account);
        uint256 pw      = power;
        uint256 mainInc = pw > 0 ? (pw * (mainAccPerPower - u.mainRewardDebt)) / PRECISION : 0;
        pendingMain     = u.pendingMainReward + mainInc;
        uint256 diaInc  = (pw > 0 && _oldestPositionLevel(account) == 10)
                          ? (pw * (diaAccPerPower - u.diaRewardDebt)) / PRECISION : 0;
        pendingDia      = u.pendingDiaReward + diaInc;
        totalClaimed_   = u.totalClaimed;
        positionCount   = u.positions.length;
    }

    function getUserPositions(address account) external view returns (
        uint256[] memory amounts,
        uint256[] memory startTimes,
        uint256[] memory heldHoursArr
    ) {
        UserInfo storage u = users[account];
        uint256 len = u.positions.length;
        amounts      = new uint256[](len);
        startTimes   = new uint256[](len);
        heldHoursArr = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            amounts[i]      = u.positions[i].amount;
            startTimes[i]   = u.positions[i].startTime;
            heldHoursArr[i] = (block.timestamp - u.positions[i].startTime) / 1 hours;
        }
    }

    function getLevelInfo(address account) external view returns (
        uint8  currentLevel_,
        string memory levelName,
        uint256 multiplier_,
        uint256 heldHours_,
        uint256 nextLevelHours
    ) {
        currentLevel_ = _oldestPositionLevel(account);
        multiplier_   = LEVEL_MULTIPLIER[currentLevel_ - 1];
        heldHours_    = _oldestHeldHours(account);
        string[10] memory names = [
            unicode"Lv1 \u6563\u6237",   unicode"Lv2 \u9435\u6746",
            unicode"Lv3 \u575a\u5b88",   unicode"Lv4 \u4fe1\u4ef0",
            unicode"Lv5 \u957f\u6301",   unicode"Lv6 \u6052\u5fc3",
            unicode"Lv7 \u9493\u77f3\u65b0\u79c0", unicode"Lv8 \u9493\u77f3\u624b",
            unicode"Lv9 \u9493\u77f3\u957f\u8001", unicode"Lv10 \u9493\u77f3\u738b\u8005"
        ];
        levelName      = names[currentLevel_ - 1];
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

    // ═══════════════════════════════════════════════════════════
    //  Owner 管理函数
    // ═══════════════════════════════════════════════════════════

    function setToken(address _token) external onlyOwner {
        require(_token != address(0), "Zero address");
        token = _token;
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
        (bool sent,) = owner().call{value: amount}("");
        require(sent, "Transfer failed");
    }
}
