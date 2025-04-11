/* eslint-disable prefer-const */
import { BigInt, log } from '@graphprotocol/graph-ts'
import { PairCreated } from '../../../generated/Factory/Factory'
import { Bundle, Pair, PairTokenLookup, Token, UniswapFactory } from '../../../generated/schema'
import { Pair as PairTemplate } from '../../../generated/templates'
import { FACTORY_ADDRESS } from '../../common/chain'
import { ZERO_BD, ZERO_BI } from '../../common/constants'
import {
  fetchTokenDecimals,
  fetchTokenName,
  fetchTokenSymbol,
  fetchTokenTotalSupply
} from '../../common/helpers'

export function handleNewPair(event: PairCreated): void {
  let factory = UniswapFactory.load(FACTORY_ADDRESS)
  if (!factory) {
    factory = new UniswapFactory(FACTORY_ADDRESS)
    factory.pairCount = 0
    factory.totalVolumeETH = ZERO_BD
    factory.totalLiquidityETH = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalLiquidityUSD = ZERO_BD
    factory.txCount = ZERO_BI

    let bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
    bundle.save()
  }
  factory.pairCount = factory.pairCount + 1
  factory.save()

  // token0
  let token0 = Token.load(event.params.token0.toHexString())
  if (!token0) {
    token0 = new Token(event.params.token0.toHexString())
    token0.symbol = fetchTokenSymbol(event.params.token0)
    token0.name = fetchTokenName(event.params.token0)
    token0.totalSupply = fetchTokenTotalSupply(event.params.token0)
    let decimals = fetchTokenDecimals(event.params.token0)

    if (decimals.equals(ZERO_BI)) {
      log.debug('Could not fetch decimals for token0 => skipping pair', [])
      return
    }
    token0.decimals = decimals
    token0.derivedETH = ZERO_BD
    token0.tradeVolume = ZERO_BD
    token0.tradeVolumeUSD = ZERO_BD
    token0.untrackedVolumeUSD = ZERO_BD
    token0.totalLiquidity = ZERO_BD

    // REMOVE the lines with lastMinuteArchived, minuteArray, etc.

    token0.txCount = ZERO_BI
    token0.save()
  }

  // token1
  let token1 = Token.load(event.params.token1.toHexString())
  if (!token1) {
    token1 = new Token(event.params.token1.toHexString())
    token1.symbol = fetchTokenSymbol(event.params.token1)
    token1.name = fetchTokenName(event.params.token1)
    token1.totalSupply = fetchTokenTotalSupply(event.params.token1)
    let decimals = fetchTokenDecimals(event.params.token1)

    if (decimals.equals(ZERO_BI)) {
      log.debug('Could not fetch decimals for token1 => skipping pair', [])
      return
    }
    token1.decimals = decimals
    token1.derivedETH = ZERO_BD
    token1.tradeVolume = ZERO_BD
    token1.tradeVolumeUSD = ZERO_BD
    token1.untrackedVolumeUSD = ZERO_BD
    token1.totalLiquidity = ZERO_BD

    // REMOVE the lines with lastHourArchived, hourArray, etc.

    token1.txCount = ZERO_BI
    token1.save()
  }

  let pair = new Pair(event.params.pair.toHexString())
  pair.token0 = token0.id
  pair.token1 = token1.id
  pair.liquidityProviderCount = ZERO_BI
  pair.createdAtTimestamp = event.block.timestamp
  pair.createdAtBlockNumber = event.block.number
  pair.txCount = ZERO_BI
  pair.reserve0 = ZERO_BD
  pair.reserve1 = ZERO_BD
  pair.trackedReserveETH = ZERO_BD
  pair.reserveETH = ZERO_BD
  pair.reserveUSD = ZERO_BD
  pair.totalSupply = ZERO_BD
  pair.volumeToken0 = ZERO_BD
  pair.volumeToken1 = ZERO_BD
  pair.volumeUSD = ZERO_BD
  pair.untrackedVolumeUSD = ZERO_BD
  pair.token0Price = ZERO_BD
  pair.token1Price = ZERO_BD
  pair.save()

  factory.save()

  let pairLookup0 = new PairTokenLookup(
    event.params.token0
      .toHexString()
      .concat('-')
      .concat(event.params.token1.toHexString())
  )
  pairLookup0.pair = pair.id
  pairLookup0.save()

  let pairLookup1 = new PairTokenLookup(
    event.params.token1
      .toHexString()
      .concat('-')
      .concat(event.params.token0.toHexString())
  )
  pairLookup1.pair = pair.id
  pairLookup1.save()

  PairTemplate.create(event.params.pair)
}
