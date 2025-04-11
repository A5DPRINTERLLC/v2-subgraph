/* eslint-disable prefer-const */
import { Address, BigDecimal, BigInt } from "@graphprotocol/graph-ts"
import { Bundle, Pair, PairTokenLookup, Token } from "../../generated/schema"
import {
  STABLECOINS,
  WHITELIST,
  STABLE_TOKEN_PAIRS,
  REFERENCE_TOKEN,
  MINIMUM_LIQUIDITY_THRESHOLD_ETH,
  MINIMUM_USD_THRESHOLD_NEW_PAIRS,
} from "./chain"
import {
  ADDRESS_ZERO,
  ONE_BD,
  ZERO_BD,
} from "./constants"

// -------------------------------------------------------------------
// isStablecoin – index-based loop
// -------------------------------------------------------------------
function isStablecoin(tokenId: string): bool {
  for (let i: i32 = 0; i < STABLECOINS.length; i++) {
    let stable: string = changetype<string>(STABLECOINS[i])
    if (stable == tokenId) {
      return true
    }
  }
  return false
}

// -------------------------------------------------------------------
// isWhitelisted – index-based loop
// -------------------------------------------------------------------
function isWhitelisted(tokenId: string): bool {
  for (let i: i32 = 0; i < WHITELIST.length; i++) {
    let w = WHITELIST[i] // ✅
    if (w == tokenId) {
      return true
    }
  }
  return false
}

// -------------------------------------------------------------------
// Safe division
// -------------------------------------------------------------------
function safeDiv(numerator: BigDecimal, denominator: BigDecimal): BigDecimal {
  if (denominator.equals(ZERO_BD)) {
    return ZERO_BD
  }
  return numerator.div(denominator)
}

// -------------------------------------------------------------------
// getEthPriceInUSD – Weighted average from stable pairs
// -------------------------------------------------------------------
export function getEthPriceInUSD(): BigDecimal {
  let totalLiquidityETH = ZERO_BD
  let stableTokenPrices = new Array<BigDecimal>(STABLE_TOKEN_PAIRS.length)
  let stableTokenReserves = new Array<BigDecimal>(STABLE_TOKEN_PAIRS.length)

  for (let i: i32 = 0; i < STABLE_TOKEN_PAIRS.length; i++) {
    let stablePair = Pair.load(STABLE_TOKEN_PAIRS[i])
    if (!stablePair) {
      stableTokenPrices[i] = ZERO_BD
      stableTokenReserves[i] = ZERO_BD
      continue
    }

    let token0IsRef = (stablePair.token0 == REFERENCE_TOKEN)
    let token1IsRef = (stablePair.token1 == REFERENCE_TOKEN)

    if (token0IsRef) {
      stableTokenPrices[i] = stablePair.token1Price
      stableTokenReserves[i] = stablePair.reserve0
      totalLiquidityETH = totalLiquidityETH.plus(stablePair.reserve0)
    } else if (token1IsRef) {
      stableTokenPrices[i] = stablePair.token0Price
      stableTokenReserves[i] = stablePair.reserve1
      totalLiquidityETH = totalLiquidityETH.plus(stablePair.reserve1)
    } else {
      stableTokenPrices[i] = ZERO_BD
      stableTokenReserves[i] = ZERO_BD
    }
  }

  let weightedPrice = ZERO_BD
  if (totalLiquidityETH.gt(ZERO_BD)) {
    for (let i: i32 = 0; i < STABLE_TOKEN_PAIRS.length; i++) {
      let weight = safeDiv(stableTokenReserves[i], totalLiquidityETH)
      weightedPrice = weightedPrice.plus(stableTokenPrices[i].times(weight))
    }
  }
  return weightedPrice
}

// -------------------------------------------------------------------
// findEthPerToken
// -------------------------------------------------------------------
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == REFERENCE_TOKEN) {
    return ONE_BD
  }

  // If stablecoin => invert the global ethPrice
  if (isStablecoin(token.id)) {
    let bundle = Bundle.load("1")
    if (!bundle) return ZERO_BD
    return safeDiv(ONE_BD, bundle.ethPrice)
  }

  // Loop over WHITELIST with index
  for (let i: i32 = 0; i < WHITELIST.length; i++) {
    let w = WHITELIST[i] // ✅
    let wlHex = Address.fromString(w).toHexString()
    let lookupId = token.id.concat("-").concat(wlHex)

    let pairLookup = PairTokenLookup.load(lookupId)
    if (!pairLookup) continue

    let pair = Pair.load(pairLookup.pair)
    if (!pair) continue

    if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      let t1 = Token.load(pair.token1)
      if (t1) {
        return pair.token1Price.times(t1.derivedETH)
      }
    }
    if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
      let t0 = Token.load(pair.token0)
      if (t0) {
        return pair.token0Price.times(t0.derivedETH)
      }
    }
  }

  return ZERO_BD
}

// -------------------------------------------------------------------
// getTrackedVolumeUSD
// -------------------------------------------------------------------
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load("1")
  if (!bundle) return ZERO_BD

  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // If fewer than 5 LP providers => higher threshold
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)

    if (isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    } else if (isWhitelisted(token0.id) && !isWhitelisted(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString("2")).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    } else if (!isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString("2")).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  if (isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString("2"))
  }

  if (isWhitelisted(token0.id) && !isWhitelisted(token1.id)) {
    return tokenAmount0.times(price0)
  }

  if (!isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
    return tokenAmount1.times(price1)
  }

  return ZERO_BD
}

// -------------------------------------------------------------------
// getTrackedLiquidityUSD
// -------------------------------------------------------------------
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load("1")
  if (!bundle) return ZERO_BD

  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  if (isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  if (isWhitelisted(token0.id) && !isWhitelisted(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString("2"))
  }

  if (!isWhitelisted(token0.id) && isWhitelisted(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString("2"))
  }

  return ZERO_BD
}

// -------------------------------------------------------------------
// getTokenTrackedLiquidityUSD
// -------------------------------------------------------------------
export function getTokenTrackedLiquidityUSD(
  tokenForPricing: Token,
  tokenForPricingAmount: BigDecimal,
  companionTokenAmount: BigDecimal,
  companionToken: Token
): BigDecimal {
  let bundle = Bundle.load("1")
  if (!bundle) return ZERO_BD

  let price0 = tokenForPricing.derivedETH.times(bundle.ethPrice)
  let price1 = companionToken.derivedETH.times(bundle.ethPrice)

  if (isWhitelisted(tokenForPricing.id) && isWhitelisted(companionToken.id)) {
    return tokenForPricingAmount.times(price0)
  }

  if (isWhitelisted(tokenForPricing.id) && !isWhitelisted(companionToken.id)) {
    return tokenForPricingAmount.times(price0)
  }

  if (!isWhitelisted(tokenForPricing.id) && isWhitelisted(companionToken.id)) {
    return companionTokenAmount.times(price1)
  }

  return ZERO_BD
}
