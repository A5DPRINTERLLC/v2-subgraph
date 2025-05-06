/* eslint-disable prefer-const */
import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts"

import { ERC20 } from "../../generated/Factory/ERC20"
import { ERC20NameBytes } from "../../generated/Factory/ERC20NameBytes"
import { ERC20SymbolBytes } from "../../generated/Factory/ERC20SymbolBytes"
import { User } from "../../generated/schema"
import { SKIP_TOTAL_SUPPLY, TokenDefinition } from "./chain"
import { ONE_BI, ZERO_BD, ZERO_BI } from "./constants"
import { getStaticDefinition } from "./tokenDefinition"

// -------------------------------------------------------------------
// Check if addressHex is in SKIP_TOTAL_SUPPLY
// -------------------------------------------------------------------
function isInSkipTotalSupply(addressHex: string): bool {
  for (let i = 0; i < SKIP_TOTAL_SUPPLY.length; i++) {
    if (SKIP_TOTAL_SUPPLY[i] == addressHex) {
      return true
    }
  }
  return false
}

// -------------------------------------------------------------------
// Big decimal exponent helper
// -------------------------------------------------------------------
export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString("1")
  for (let i = ZERO_BI; i.lt(decimals); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString("10"))
  }
  return bd
}

export function bigDecimalExp18(): BigDecimal {
  return BigDecimal.fromString("1000000000000000000")
}

// -------------------------------------------------------------------
// Convert ETH to decimal
// -------------------------------------------------------------------
export function convertEthToDecimal(eth: BigInt): BigDecimal {
  return eth.toBigDecimal().div(exponentToBigDecimal(BigInt.fromI32(18)))
}

// -------------------------------------------------------------------
// Convert token to decimal
// -------------------------------------------------------------------
export function convertTokenToDecimal(
  tokenAmount: BigInt,
  exchangeDecimals: BigInt
): BigDecimal {
  if (exchangeDecimals == ZERO_BI) {
    return tokenAmount.toBigDecimal()
  }
  return tokenAmount.toBigDecimal().div(exponentToBigDecimal(exchangeDecimals))
}

// -------------------------------------------------------------------
// Zero check
// -------------------------------------------------------------------
export function equalToZero(value: BigDecimal): boolean {
  return value.equals(ZERO_BD)
}

// -------------------------------------------------------------------
// Null ETH check
// -------------------------------------------------------------------
export function isNullEthValue(value: string): boolean {
  return (
    value ==
    "0x0000000000000000000000000000000000000000000000000000000000000001"
  )
}

// -------------------------------------------------------------------
// FETCH TOKEN SYMBOL – RE-EXPORTED
// -------------------------------------------------------------------
export function fetchTokenSymbol(tokenAddress: Address): string {
  // static definitions overrides
  let staticDefinition = getStaticDefinition(tokenAddress)
  if (staticDefinition != null) {
    return (staticDefinition as TokenDefinition).symbol
  }

  let contract = ERC20.bind(tokenAddress)
  let contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  let symbolValue = "unknown"
  let symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    let symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

// -------------------------------------------------------------------
// FETCH TOKEN NAME – RE-EXPORTED
// -------------------------------------------------------------------
export function fetchTokenName(tokenAddress: Address): string {
  let staticDefinition = getStaticDefinition(tokenAddress)
  if (staticDefinition != null) {
    return (staticDefinition as TokenDefinition).name
  }

  let contract = ERC20.bind(tokenAddress)
  let contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  let nameValue = "unknown"
  let nameResult = contract.try_name()
  if (nameResult.reverted) {
    let nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

// -------------------------------------------------------------------
// FETCH TOKEN TOTAL SUPPLY – RE-EXPORTED
// -------------------------------------------------------------------
export function fetchTokenTotalSupply(tokenAddress: Address): BigInt {
  if (isInSkipTotalSupply(tokenAddress.toHexString())) {
    return BigInt.fromI32(0)
  }

  let contract = ERC20.bind(tokenAddress)
  let totalSupplyValue = BigInt.fromI32(0)
  let totalSupplyResult = contract.try_totalSupply()
  if (!totalSupplyResult.reverted) {
    totalSupplyValue = totalSupplyResult.value
  }
  return totalSupplyValue
}

// -------------------------------------------------------------------
// FETCH TOKEN DECIMALS – RE-EXPORTED (Returns BigInt, never null)
// -------------------------------------------------------------------
export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  let staticDefinition = getStaticDefinition(tokenAddress)
  if (staticDefinition != null) {
    return (staticDefinition as TokenDefinition).decimals
  }

  let contract = ERC20.bind(tokenAddress)
  let decimalValue = 0
  let decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    decimalValue = decimalResult.value
  }
  return BigInt.fromI32(decimalValue)
}

// -------------------------------------------------------------------
// Create user if doesn't exist
// -------------------------------------------------------------------
export function createUser(address: Address): void {
  let user = User.load(address.toHexString())
  if (!user) {
    user = new User(address.toHexString())
    user.usdSwapped = ZERO_BD  // ✅ Prevents crash
    user.save()
  }
}
