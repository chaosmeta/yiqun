// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ═══════════════════════════════════════════════════════════════
//  DiamondToken — ERC20 with 3%/3% Tax → Auto BNB → Vault
//  BSC Mainnet
//
//  税费分配 (买/卖各3%):
//    25% → 回购销毁 (buyback & burn)
//    62% → 主分红池 (every 2h)
//    13% → 钻石王者分红池 (every 48h)
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
        uint256 amountIn, uint256 amountOutMin,
        address[] calldata path, address to, uint256 deadline
    ) external;
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin, address[] calldata path,
        address to, uint256 deadline
    ) external payable;
    function factory() external pure returns (address);
}

interface IPancakeFactory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IDiamondVault {
    function receiveMainReward()    external payable;
    function receiveDiamondReward() external payable;
    function receiveBuybackBurn()   external payable;
}

contract DiamondToken is Context, Ownable, IERC20 {

    string  public constant name     = "Diamond";
    string  public constant symbol   = "DMD";
    uint8   public constant decimals = 18;
    uint256 public constant TOTAL_SUPPLY = 100_000_000 * 1e18; // 1亿枚

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    // 税费：买/卖各3% = 300/10000
    uint256 public constant TAX_RATE      = 300;
    uint256 public constant BUYBACK_SHARE = 25; // 25%
    uint256 public constant MAIN_SHARE    = 62; // 62%
    uint256 public constant DIAMOND_SHARE = 13; // 13%

    address public vault;
    // BSC Mainnet PancakeSwap Router v2
    address public pancakeRouter = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public pancakePair;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    bool private _inSwap;
    bool public swapEnabled = true;
    // 累积10万枚后触发换BNB
    uint256 public swapThreshold = 100_000 * 1e18;

    mapping(address => bool) public isExcludedFromFee;
    mapping(address => bool) public isAMMPair;

    event VaultSet(address indexed vault);
    event SwapAndDistribute(uint256 tokensSwapped, uint256 bnbReceived);
    event TaxCollected(address indexed from, address indexed to, uint256 taxAmount);
    event BuybackBurn(uint256 bnbUsed);

    modifier lockSwap() { _inSwap = true; _; _inSwap = false; }

    // BSC Mainnet PancakeSwap Router: 0x10ED43C718714eb63d5aA57B78B54704E256024E
    constructor() Ownable(msg.sender) {
        address factory = IPancakeRouter02(pancakeRouter).factory();
        pancakePair = IPancakeFactory(factory).createPair(
            address(this),
            IPancakeRouter02(pancakeRouter).WETH()
        );
        isAMMPair[pancakePair] = true;

        isExcludedFromFee[msg.sender] = true;
        isExcludedFromFee[address(this)] = true;
        isExcludedFromFee[DEAD] = true;

        _totalSupply = TOTAL_SUPPLY;
        _balances[msg.sender] = TOTAL_SUPPLY;
        emit Transfer(address(0), msg.sender, TOTAL_SUPPLY);
    }

    function totalSupply() public view override returns (uint256) { return _totalSupply; }
    function balanceOf(address a) public view override returns (uint256) { return _balances[a]; }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(_msgSender(), to, amount); return true;
    }
    function allowance(address o, address s) public view override returns (uint256) {
        return _allowances[o][s];
    }
    function approve(address spender, uint256 amount) public override returns (bool) {
        _approve(_msgSender(), spender, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 cur = _allowances[from][_msgSender()];
        require(cur >= amount, "Insufficient allowance");
        _approve(from, _msgSender(), cur - amount);
        _transfer(from, to, amount);
        return true;
    }
    function _approve(address o, address s, uint256 a) internal {
        _allowances[o][s] = a;
        emit Approval(o, s, a);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0) && to != address(0), "Zero address");
        require(amount > 0, "Zero amount");
        require(_balances[from] >= amount, "Insufficient balance");

        if (_inSwap) { _rawTransfer(from, to, amount); return; }

        bool isBuy  = isAMMPair[from] && !isExcludedFromFee[to];
        bool isSell = isAMMPair[to]   && !isExcludedFromFee[from];

        if (isSell && swapEnabled && vault != address(0)) {
            if (_balances[address(this)] >= swapThreshold)
                _swapAndDistribute(_balances[address(this)]);
        }

        if (isBuy || isSell) {
            uint256 tax = (amount * TAX_RATE) / 10000;
            _rawTransfer(from, address(this), tax);
            _rawTransfer(from, to, amount - tax);
            emit TaxCollected(from, to, tax);
        } else {
            _rawTransfer(from, to, amount);
        }
    }

    function _rawTransfer(address from, address to, uint256 amount) internal {
        _balances[from] -= amount;
        _balances[to]   += amount;
        emit Transfer(from, to, amount);
    }

    function _swapAndDistribute(uint256 tokenAmount) internal lockSwap {
        if (vault == address(0)) return;
        uint256 buybackTokens = (tokenAmount * BUYBACK_SHARE) / 100;
        uint256 mainTokens    = (tokenAmount * MAIN_SHARE)    / 100;
        uint256 diaTokens     = tokenAmount - buybackTokens - mainTokens;

        // 换主分红 + 钻石王者分红
        uint256 b0 = address(this).balance;
        _swapTokensForBNB(mainTokens + diaTokens);
        uint256 bnb = address(this).balance - b0;
        if (bnb > 0) {
            uint256 mainBNB = (bnb * MAIN_SHARE) / (MAIN_SHARE + DIAMOND_SHARE);
            uint256 diaBNB  = bnb - mainBNB;
            if (mainBNB > 0) IDiamondVault(vault).receiveMainReward{value: mainBNB}();
            if (diaBNB  > 0) IDiamondVault(vault).receiveDiamondReward{value: diaBNB}();
        }

        // 换回购销毁BNB
        uint256 b1 = address(this).balance;
        _swapTokensForBNB(buybackTokens);
        uint256 bbBNB = address(this).balance - b1;
        if (bbBNB > 0) IDiamondVault(vault).receiveBuybackBurn{value: bbBNB}();

        emit SwapAndDistribute(tokenAmount, bnb);
    }

    function _swapTokensForBNB(uint256 tokenAmount) internal {
        if (tokenAmount == 0) return;
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = IPancakeRouter02(pancakeRouter).WETH();
        _approve(address(this), pancakeRouter, tokenAmount);
        IPancakeRouter02(pancakeRouter).swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount, 0, path, address(this), block.timestamp + 300
        );
    }

    // ── Owner ────────────────────────────────────────────────
    function setVault(address _vault) external onlyOwner {
        require(_vault != address(0), "Zero address");
        vault = _vault;
        isExcludedFromFee[_vault] = true;
        emit VaultSet(_vault);
    }
    function setSwapEnabled(bool e)           external onlyOwner { swapEnabled = e; }
    function setSwapThreshold(uint256 t)      external onlyOwner { swapThreshold = t; }
    function setExcludedFromFee(address a, bool e) external onlyOwner { isExcludedFromFee[a] = e; }
    function setAMMPair(address pair, bool b) external onlyOwner { isAMMPair[pair] = b; }
    function manualSwap() external onlyOwner {
        require(_balances[address(this)] > 0, "No tokens");
        _swapAndDistribute(_balances[address(this)]);
    }
    receive() external payable {}
}
