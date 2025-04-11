/* eslint-disable prefer-const */
import { BigDecimal } from '@graphprotocol/graph-ts'

import { Bundle, Pair, Token, UniswapFactory } from '../../../generated/schema'
import { Swap, Sync } from '../../../generated/templates/Pair/Pair'
import { FACTORY_ADDRESS } from '../../common/chain'
import { ONE_BI, ZERO_BD } from '../../common/constants'
import { convertTokenToDecimal } from '../../common/helpers'
import {
  updatePairDayData,
  updatePairHourData,
  updateTokenDayData,
  updateTokenHourData,
  updateUniswapDayData,
} from '../../common/hourDayUpdates'
import {
  findEthPerToken,
  getEthPriceInUSD,
  getTrackedLiquidityUSD,
  getTrackedVolumeUSD,
} from '../../common/pricing'
import { updateTokenMinuteData } from './minuteUpdates'

export function handleSync(event: Sync): void {
  let pair = Pair.load(event.address.toHexString())
  if (!pair) return

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (!token0 || !token1) return

  let uniswap = UniswapFactory.load(FACTORY_ADDRESS)
  if (!uniswap) return

  // reset factory liquidity by subtracting only tracked liquidity
  uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.minus(pair.trackedReserveETH as BigDecimal)

  // reset token total liquidity amounts
  token0.totalLiquidity = token0.totalLiquidity.minus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.minus(pair.reserve1)

  // update pair reserves
  pair.reserve0 = convertTokenToDecimal(event.params.reserve0, token0.decimals)
  pair.reserve1 = convertTokenToDecimal(event.params.reserve1, token1.decimals)

  if (pair.reserve1.notEqual(ZERO_BD)) {
    pair.token0Price = pair.reserve0.div(pair.reserve1)
  } else {
    pair.token0Price = ZERO_BD
  }
  if (pair.reserve0.notEqual(ZERO_BD)) {
    pair.token1Price = pair.reserve1.div(pair.reserve0)
  } else {
    pair.token1Price = ZERO_BD
  }
  pair.save()

  // update ETH price now that reserves changed
  let bundle = Bundle.load('1')
  if (!bundle) {
    bundle = new Bundle('1')
  }
  bundle.ethPrice = getEthPriceInUSD()
  bundle.save()

  // update derivedETH
  token0.derivedETH = findEthPerToken(token0 as Token)
  token1.derivedETH = findEthPerToken(token1 as Token)
  token0.save()
  token1.save()

  // get tracked liquidity
  let trackedLiquidityETH: BigDecimal
  if (bundle.ethPrice.notEqual(ZERO_BD)) {
    trackedLiquidityETH = getTrackedLiquidityUSD(
      pair.reserve0,
      token0 as Token,
      pair.reserve1,
      token1 as Token
    ).div(bundle.ethPrice)
  } else {
    trackedLiquidityETH = ZERO_BD
  }

  // set reserves
  pair.trackedReserveETH = trackedLiquidityETH
  pair.reserveETH = pair.reserve0
    .times(token0.derivedETH as BigDecimal)
    .plus(pair.reserve1.times(token1.derivedETH as BigDecimal))
  pair.reserveUSD = pair.reserveETH.times(bundle.ethPrice)

  // update global factory stats
  uniswap.totalLiquidityETH = uniswap.totalLiquidityETH.plus(trackedLiquidityETH)
  uniswap.totalLiquidityUSD = uniswap.totalLiquidityETH.times(bundle.ethPrice)

  // set token liquidity
  token0.totalLiquidity = token0.totalLiquidity.plus(pair.reserve0)
  token1.totalLiquidity = token1.totalLiquidity.plus(pair.reserve1)

  // update hourly/minute stats
  let token0HourData = updateTokenHourData(token0 as Token, event)
  let token1HourData = updateTokenHourData(token1 as Token, event)
  let token0MinuteData = updateTokenMinuteData(token0 as Token, event)
  let token1MinuteData = updateTokenMinuteData(token1 as Token, event)

  token0HourData.volume = token0.tradeVolume
  token0HourData.volumeUSD = token0.tradeVolumeUSD
  token0HourData.untrackedVolumeUSD = token0.untrackedVolumeUSD
  token0HourData.save()

  token1HourData.volume = token1.tradeVolume
  token1HourData.volumeUSD = token1.tradeVolumeUSD
  token1HourData.untrackedVolumeUSD = token1.untrackedVolumeUSD
  token1HourData.save()

  token0MinuteData.volume = token0.tradeVolume
  token0MinuteData.volumeUSD = token0.tradeVolumeUSD
  token0MinuteData.untrackedVolumeUSD = token0.untrackedVolumeUSD
  token0MinuteData.save()

  token1MinuteData.volume = token1.tradeVolume
  token1MinuteData.volumeUSD = token1.tradeVolumeUSD
  token1MinuteData.untrackedVolumeUSD = token1.untrackedVolumeUSD
  token1MinuteData.save()

  // save
  pair.save()
  uniswap.save()
  token0.save()
  token1.save()
}

export function handleSwap(event: Swap): void {
  let pair = Pair.load(event.address.toHexString())
  if (!pair) return

  let token0 = Token.load(pair.token0)
  let token1 = Token.load(pair.token1)
  if (!token0 || !token1) return

  let amount0In = convertTokenToDecimal(event.params.amount0In, token0.decimals)
  let amount1In = convertTokenToDecimal(event.params.amount1In, token1.decimals)
  let amount0Out = convertTokenToDecimal(event.params.amount0Out, token0.decimals)
  let amount1Out = convertTokenToDecimal(event.params.amount1Out, token1.decimals)

  let amount0Total = amount0Out.plus(amount0In)
  let amount1Total = amount1Out.plus(amount1In)

  let bundle = Bundle.load('1')
  if (!bundle) return

  // total derived amounts
  let derivedAmountETH = token1.derivedETH
    .times(amount1Total)
    .plus(token0.derivedETH.times(amount0Total))
    .div(BigDecimal.fromString('2'))
  let derivedAmountUSD = derivedAmountETH.times(bundle.ethPrice)

  // track volume
  let trackedAmountUSD = getTrackedVolumeUSD(amount0Total, token0 as Token, amount1Total, token1 as Token, pair as Pair)
  let trackedAmountETH = bundle.ethPrice.equals(ZERO_BD) ? ZERO_BD : trackedAmountUSD.div(bundle.ethPrice)

  // update token volumes
  token0.tradeVolume = token0.tradeVolume.plus(amount0Total)
  token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(trackedAmountUSD)
  token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(derivedAmountUSD)

  token1.tradeVolume = token1.tradeVolume.plus(amount1Total)
  token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(trackedAmountUSD)
  token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(derivedAmountUSD)

  // update tx counts
  token0.txCount = token0.txCount.plus(ONE_BI)
  token1.txCount = token1.txCount.plus(ONE_BI)

  // update pair volume
  pair.volumeUSD = pair.volumeUSD.plus(trackedAmountUSD)
  pair.volumeToken0 = pair.volumeToken0.plus(amount0Total)
  pair.volumeToken1 = pair.volumeToken1.plus(amount1Total)
  pair.untrackedVolumeUSD = pair.untrackedVolumeUSD.plus(derivedAmountUSD)
  pair.txCount = pair.txCount.plus(ONE_BI)
  pair.save()

  // update factory
  let uniswap = UniswapFactory.load(FACTORY_ADDRESS)
  if (!uniswap) return

  uniswap.totalVolumeUSD = uniswap.totalVolumeUSD.plus(trackedAmountUSD)
  uniswap.totalVolumeETH = uniswap.totalVolumeETH.plus(trackedAmountETH)
  uniswap.untrackedVolumeUSD = uniswap.untrackedVolumeUSD.plus(derivedAmountUSD)
  uniswap.txCount = uniswap.txCount.plus(ONE_BI)

  pair.save()
  token0.save()
  token1.save()
  uniswap.save()

  // day/hour stats
  let pairDayData = updatePairDayData(pair, event)
  let pairHourData = updatePairHourData(pair, event)
  let uniswapDayData = updateUniswapDayData(event)
  let token0DayData = updateTokenDayData(token0 as Token, event)
  let token1DayData = updateTokenDayData(token1 as Token, event)

  uniswapDayData.dailyVolumeUSD = uniswapDayData.dailyVolumeUSD.plus(trackedAmountUSD)
  uniswapDayData.dailyVolumeETH = uniswapDayData.dailyVolumeETH.plus(trackedAmountETH)
  uniswapDayData.dailyVolumeUntracked = uniswapDayData.dailyVolumeUntracked.plus(derivedAmountUSD)
  uniswapDayData.save()

  pairDayData.dailyVolumeToken0 = pairDayData.dailyVolumeToken0.plus(amount0Total)
  pairDayData.dailyVolumeToken1 = pairDayData.dailyVolumeToken1.plus(amount1Total)
  pairDayData.dailyVolumeUSD = pairDayData.dailyVolumeUSD.plus(trackedAmountUSD)
  pairDayData.save()

  pairHourData.hourlyVolumeToken0 = pairHourData.hourlyVolumeToken0.plus(amount0Total)
  pairHourData.hourlyVolumeToken1 = pairHourData.hourlyVolumeToken1.plus(amount1Total)
  pairHourData.hourlyVolumeUSD = pairHourData.hourlyVolumeUSD.plus(trackedAmountUSD)
  pairHourData.save()

  token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total)
  token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0Total.times(token0.derivedETH as BigDecimal))
  token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(
    amount0Total.times(token0.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token0DayData.save()

  token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total)
  token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1Total.times(token1.derivedETH as BigDecimal))
  token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(
    amount1Total.times(token1.derivedETH as BigDecimal).times(bundle.ethPrice)
  )
  token1DayData.save()

  let token0HourData = updateTokenHourData(token0 as Token, event)
  let token1HourData = updateTokenHourData(token1 as Token, event)
  let token0MinuteData = updateTokenMinuteData(token0 as Token, event)
  let token1MinuteData = updateTokenMinuteData(token1 as Token, event)

  token0HourData.volume = token0.tradeVolume
  token0HourData.volumeUSD = token0.tradeVolumeUSD
  token0HourData.untrackedVolumeUSD = token0.untrackedVolumeUSD
  token0HourData.save()

  token0MinuteData.volume = token0.tradeVolume
  token0MinuteData.volumeUSD = token0.tradeVolumeUSD
  token0MinuteData.untrackedVolumeUSD = token0.untrackedVolumeUSD
  token0MinuteData.save()

  token1HourData.volume = token1.tradeVolume
  token1HourData.volumeUSD = token1.tradeVolumeUSD
  token1HourData.untrackedVolumeUSD = token1.untrackedVolumeUSD
  token1HourData.save()

  token1MinuteData.volume = token1.tradeVolume
  token1MinuteData.volumeUSD = token1.tradeVolumeUSD
  token1MinuteData.untrackedVolumeUSD = token1.untrackedVolumeUSD
  token1MinuteData.save()
}
