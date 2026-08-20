// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * The ERC-20 the state patcher installs when you point it at an address that has
 * no code — a mainnet token address on a local chain, say. Deliberately minimal:
 * no owner, no pausing, no hooks, nothing that can get in the way of a test.
 *
 * The field order is part of the contract: slot 0 must stay the balances mapping
 * so `POST /api/patches/fund` can write balances without detecting the layout.
 * Re-run `bun run build:mock-erc20` after any change here.
 */
contract MockERC20 {
    mapping(address => uint256) public balanceOf;                      // slot 0
    mapping(address => mapping(address => uint256)) public allowance;  // slot 1
    uint256 public totalSupply;                                        // slot 2
    string public name;                                                // slot 3
    string public symbol;                                              // slot 4
    uint8 public decimals;                                             // slot 5

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals, uint256 _supply, address _holder) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        totalSupply = _supply;
        if (_supply > 0) {
            balanceOf[_holder] = _supply;
            emit Transfer(address(0), _holder, _supply);
        }
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) private {
        require(balanceOf[from] >= value, "balance");
        unchecked {
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}
