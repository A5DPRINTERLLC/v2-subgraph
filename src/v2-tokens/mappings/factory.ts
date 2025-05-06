/* eslint-disable prefer-const */
import { BigInt, log } from '@graphprotocol/graph-ts'
import {
  PairCreated
} from '../../../generated/Factory/Factory'
import {
  Bundle,
  Pair,
  PairTokenLookup,
  Token,
  UniswapFactory
} from '../../../generated/schema'
import { Pair as PairTemplate } from '../../../generated/templates'
import { ERC20 } from '../../../generated/Factory/ERC20'
import { FACTORY_ADDRESS } from '../../common/chain'
import {
  ZERO_BD,
  ZERO_BI
} from '../../common/constants'

export function handleNewPair(event: PairCreated): void {
  // Load or create the UniswapFactory entity
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

    // Also create the initial Bundle, used to store global ETH price data
    let bundle = new Bundle('1')
    bundle.ethPrice = ZERO_BD
    bundle.save()
  }

  // Increment factory.pairCount for the newly created pair
  factory.pairCount = factory.pairCount + 1
  factory.save()

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN 0
  // ─────────────────────────────────────────────────────────────────────────────
  let token0 = Token.load(event.params.token0.toHexString())
  if (!token0) {
    token0 = new Token(event.params.token0.toHexString())

    let token0Contract = ERC20.bind(event.params.token0)

    // Symbol
    let symbol0Result = token0Contract.try_symbol()
    if (!symbol0Result.reverted) {
      token0.symbol = symbol0Result.value
    } else {
      token0.symbol = 'UNKNOWN'
    }

    // Name
    let name0Result = token0Contract.try_name()
    token0.name = name0Result.reverted ? 'UNKNOWN' : name0Result.value

    // Decimals
    let decimals0Result = token0Contract.try_decimals()
    if (decimals0Result.reverted) {
      // Fallback to 18 if decimals call fails
      log.debug('Could not fetch decimals for token0 => defaulting to 18', [])
      token0.decimals = 18
    } else {
      token0.decimals = decimals0Result.value
    }

      // OR APPROACH B: Provide a fallback, e.g. 18
      // token0.decimals = 18
      // log.debug('Could not fetch decimals for token0 => defaulting to 18', [])
    } else {
      token0.decimals = decimals0Result.value
    }

    token0.totalSupply = BigInt.zero()
    token0.derivedETH = ZERO_BD
    token0.tradeVolume = ZERO_BD
    token0.tradeVolumeUSD = ZERO_BD
    token0.untrackedVolumeUSD = ZERO_BD
    token0.totalLiquidity = ZERO_BD
    token0.txCount = ZERO_BI
    token0.save()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN 1
  // ─────────────────────────────────────────────────────────────────────────────
  let token1 = Token.load(event.params.token1.toHexString())
  if (!token1) {
    token1 = new Token(event.params.token1.toHexString())

    let token1Contract = ERC20.bind(event.params.token1)

    // Symbol
    let symbol1Result = token1Contract.try_symbol()
    if (!symbol1Result.reverted) {
      token1.symbol = symbol1Result.value
    } else {
      token1.symbol = 'UNKNOWN'
    }

    // Name
    let name1Result = token1Contract.try_name()
    token1.name = name1Result.reverted ? 'UNKNOWN' : name1Result.value

    // Decimals
    let decimals1Result = token1Contract.try_decimals()
    if (decimals1Result.reverted) {
      // Fallback to 18 if decimals call fails
      log.debug('Could not fetch decimals for token1 => defaulting to 18', [])
      token1.decimals = 18
    } else {
      token1.decimals = decimals1Result.value
    }


    token1.totalSupply = BigInt.zero()
    token1.derivedETH = ZERO_BD
    token1.tradeVolume = ZERO_BD
    token1.tradeVolumeUSD = ZERO_BD
    token1.untrackedVolumeUSD = ZERO_BD
    token1.totalLiquidity = ZERO_BD
    token1.txCount = ZERO_BI
    token1.save()
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PAIR ENTITY
  // ─────────────────────────────────────────────────────────────────────────────
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

  // Re-save factory in case you want to track additional data
  factory.save()

  // ─────────────────────────────────────────────────────────────────────────────
  // PAIR LOOKUPS (helpful for quick searching by tokens)
  // ─────────────────────────────────────────────────────────────────────────────
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

  // Create the pair template so The Graph will watch & handle events for this pair
  PairTemplate.create(event.params.pair)
}
