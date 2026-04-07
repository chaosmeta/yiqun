// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ═══════════════════════════════════════════════════════════════
//  DiamondToken — ERC20 with 3%/3% Tax → Auto BNB → Vault
//  BSC Testnet
//
//  税费分配 (买/卖各3%):
//    25% → 回购销毁 (buyback & burn)
//    62% → 主分红池 (every 2h)
//    13% → 钻石王者分红池 (every 48h)
//
//  自动将收集的代币通过 PancakeSwap 换成 BNB 后打入 Vault
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

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IPancakeRouter02 {
    function WETH() external pure returns (address);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
    function factory() external pure returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256, uint256, uint256);
}

interface IPancakeFactory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IDiamondVault {
    function receiveMainReward() external payable;
    function receiveDiamondReward() external payable;
    function receiveBuybackBurn() external payable;
}

contract DiamondToken is Context, Ownable, IERC20 {

    // ─── 基础信息 ─────────────────────────────────────────────
    string public constant name     = "Diamond";
    string public constant symbol   = "DMD";
    uint8  public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 1e18; // 1亿枚

    // ─── 余额与授权 ───────────────────────────────────────────
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    // ─── 税费参数 ─────────────────────────────────────────────
    // 买卖各3%，分配比例 (basis points, 总100)
    uint256 public constant TAX_RATE      = 300;  // 3% = 300/10000
    uint256 public constant BUYBACK_SHARE = 25;   // 25%
    uint256 public constant MAIN_SHARE    = 62;   // 62%
    uint256 public constant DIAMOND_SHARE = 13;   // 13%

    // ─── 合约地址 ─────────────────────────────────────────────
    address public vault;
    address public pancakeRouter;
    address public pancakePair;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ─── 状态 ─────────────────────────────────────────────────
    bool private _inSwap;
    bool public swapEnabled = true;
    uint256 public swapThreshold; // 累积多少代币后触发换BNB

    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isAMMPair;

    // ─── Events ───────────────────────────────────────────────
    event VaultSet(address indexed vault);
    event SwapAndDistribute(uint256 tokensSwapped, uint256 bnbReceived);
    event BuybackBurn(uint256 bnbUsed, uint256 tokensBurned);
    event TaxCollected(address indexed from, address indexed to, uint256 taxAmount);

    modifier lockSwap() {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    // ─── Constructor ──────────────────────────────────────────
    // BSC Testnet PancakeSwap Router: 0xD99D1c33F9fC3444f8101754aBC46c52416550D1
    constructor(address _router) Ownable(msg.sender) {
        pancakeRouter = _router;

        // 创建流动性对
        address factory = IPancakeRouter02(_router).factory();
        pancakePair = IPancakeFactory(factory).createPair(address(this), IPancakeRouter02(_router).WETH());
        isAMMPair[pancakePair] = true;

        // 阈值：累积 10万枚代币后触发换BNB
        swapThreshold = 100_000 * 1e18;

        // 豁免手续费
        isExcludedFromFee[msg.sender] = true;
        isExcludedFromFee[address(this)] = true;
        isExcludedFromFee[DEAD] = true;

        // 铸造
        _totalSupply = TOTAL_SUPPLY;
        _balances[msg.sender] = TOTAL_SUPPLY;
        emit Transfer(address(0), msg.sender, TOTAL_SUPPLY);
    }

    // ═══════════════════════════════════════════════════════════
    //  ERC20 标准
    // ═══════════════════════════════════════════════════════════

    function totalSupply() public view override returns (uint256) { return _totalSupply; }
    function balanceOf(address account) public view override returns (uint256) { return _balances[account]; }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(_msgSender(), to, amount);
        return true;
    }

    function allowance(address owner_, address spender) public view override returns (uint256) {
        return _allowances[owner_][spender];
    }

    function approve(address spender, uint256 amount) public override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 currentAllowance = _allowances[from][_msgSender()];
        require(currentAllowance >= amount, "Insufficient allowance");
        _approve(from, _msgSender(), currentAllowance - amount);
        _transfer(from, to, amount);
        return true;
    }

    function _approve(address owner_, address spender, uint256 amount) internal {
        _allowances[owner_][spender] = amount;
        emit Approval(owner_, spender, amount);
    }

    // ═══════════════════════════════════════════════════════════
    //  核心转账逻辑（含税费）
    // ═══════════════════════════════════════════════════════════

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        require(_balances[from] >= amount, "Insufficient balance");

        // 在swap过程中不再收税（防止递归）
        if (_inSwap) {
            _rawTransfer(from, to, amount);
            return;
        }

        // 判断是否收税：买（AMM→用户）或卖（用户→AMM）
        bool isBuy  = isAMMPair[from]  && !isExcludedFromFee[to];
        bool isSell = isAMMPair[to]    && !isExcludedFromFee[from];
        bool takeFee = isBuy || isSell;

        // 触发自动swap：卖出时检查
        if (isSell && swapEnabled && vault != address(0)) {
            uint256 contractTokens = _balances[address(this)];
            if (contractTokens >= swapThreshold) {
                _swapAndDistribute(contractTokens);
            }
        }

        if (takeFee) {
            uint256 taxAmount = (amount * TAX_RATE) / 10000;
            uint256 transferAmount = amount - taxAmount;

            _rawTransfer(from, address(this), taxAmount);
            _rawTransfer(from, to, transferAmount);

            emit TaxCollected(from, to, taxAmount);
        } else {
            _rawTransfer(from, to, amount);
        }
    }

    function _rawTransfer(address from, address to, uint256 amount) internal {
        _balances[from] -= amount;
        _balances[to]   += amount;
        emit Transfer(from, to, amount);
    }

    // ═══════════════════════════════════════════════════════════
    //  Swap 代币 → BNB → 分发给 Vault
    // ═══════════════════════════════════════════════════════════

    function _swapAndDistribute(uint256 tokenAmount) internal lockSwap {
        if (vault == address(0)) return;

        // 计算各份额对应的代币数
        uint256 buybackTokens = (tokenAmount * BUYBACK_SHARE) / 100;
        uint256 mainTokens    = (tokenAmount * MAIN_SHARE)    / 100;
        uint256 diamondTokens = tokenAmount - buybackTokens - mainTokens; // 剩余=13%

        uint256 bnbBefore = address(this).balance;

        // 把 mainTokens + diamondTokens 换成 BNB
        uint256 swapTokens = mainTokens + diamondTokens;
        _swapTokensForBNB(swapTokens);

        uint256 bnbReceived = address(this).balance - bnbBefore;
        emit SwapAndDistribute(swapTokens, bnbReceived);

        if (bnbReceived > 0) {
            uint256 mainBNB    = (bnbReceived * MAIN_SHARE)    / (MAIN_SHARE + DIAMOND_SHARE);
            uint256 diamondBNB = bnbReceived - mainBNB;

            // 打入 Vault 主分红池
            if (mainBNB > 0) {
                IDiamondVault(vault).receiveMainReward{value: mainBNB}();
            }
            // 打入 Vault 钻石王者池
            if (diamondBNB > 0) {
                IDiamondVault(vault).receiveDiamondReward{value: diamondBNB}();
            }
        }

        // 把 buybackTokens 换成 BNB 用于回购销毁
        if (buybackTokens > 0) {
            uint256 bnbBefore2 = address(this).balance;
            _swapTokensForBNB(buybackTokens);
            uint256 bnbForBuyback = address(this).balance - bnbBefore2;
            if (bnbForBuyback > 0) {
                IDiamondVault(vault).receiveBuybackBurn{value: bnbForBuyback}();
            }
        }
    }

    function _swapTokensForBNB(uint256 tokenAmount) internal {
        if (tokenAmount == 0) return;
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = IPancakeRouter02(pancakeRouter).WETH();

        _approve(address(this), pancakeRouter, tokenAmount);
        IPancakeRouter02(pancakeRouter).swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp + 300
        );
    }

    // ═══════════════════════════════════════════════════════════
    //  Owner 函数
    // ═══════════════════════════════════════════════════════════

    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        isExcludedFromFee[_vault] = true;
        emit VaultSet(_vault);
    }

    function setSwapEnabled(bool enabled) external onlyOwner {
        swapEnabled = enabled;
    }

    function setSwapThreshold(uint256 threshold) external onlyOwner {
        swapThreshold = threshold;
    }

    function setExcludedFromFee(address account, bool excluded) external onlyOwner {
        isExcludedFromFee[account] = excluded;
    }

    function setAMMPair(address pair, bool isAMM) external onlyOwner {
        isAMMPair[pair] = isAMM;
    }

    // 手动触发 swap（如果自动触发失败）
    function manualSwap() external onlyOwner {
        uint256 contractTokens = _balances[address(this)];
        require(contractTokens > 0, "No tokens");
        _swapAndDistribute(contractTokens);
    }

    receive() external payable {}
}
