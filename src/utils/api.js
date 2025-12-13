/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

import { getCollection } from './storage'

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
// NOTE: 以前は 250 件/ページを前提にしていましたが、APIが重い/不安定な時に
// 1回のレスポンスが大きいほど失敗しやすくなるため、ここでは小さめに絞ります。
const PAGE_SIZE = 50

// API接続が不安定な場合に備えた制御値
// NOTE: APIが遅い場合は待ちすぎるとUXが悪化するため、まずは短めで打ち切ってフォールバックします
const REQUEST_TIMEOUT_MS = 10000
const RETRY_COUNT = 1
const RETRY_BASE_DELAY_MS = 500
const MAX_PAGE_GUESS = 200 // totalCount取得をせず「当たりそうな範囲」を推定

// APIフォールバック用のキャッシュ（正規化済みカードを保存）
const API_CACHE_KEY = 'pokepack_api_card_pool_v1'
const API_CACHE_LIMIT = 200

// APIキーを環境変数から取得（GitHub Pagesでは環境変数が使えないため、空文字列の場合はヘッダーを送信しない）
const API_KEY = import.meta.env.VITE_POKEMON_TCG_API_KEY || ''

/**
 * フェッチリクエストの共通ヘッダーを取得
 * @returns {Object} ヘッダーオブジェクト
 */
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  
  // APIキーが設定されている場合のみ追加
  if (API_KEY) {
    headers['X-Api-Key'] = API_KEY
  }
  
  return headers
}

/**
 * 指定ミリ秒だけ待機
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * タイムアウト付きfetch（AbortController）
 * @param {string} url
 * @param {Object} options
 * @param {number} timeoutMs
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

function isRetryableError(error) {
  if (!error) return false
  // ネットワーク断・DNS・CORSなどはブラウザによって例外メッセージが揺れるため幅広く拾う
  const message = String(error.message || '')
  return (
    error.name === 'AbortError' ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Load failed') ||
    message.includes('fetch') // 保守的
  )
}

/**
 * JSON取得（HTTPエラー時は本文もログ）
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchJson(url) {
  const response = await fetchWithTimeout(url, { headers: getHeaders() }, REQUEST_TIMEOUT_MS)

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error('APIレスポンスエラー:', {
      url,
      status: response.status,
      statusText: response.statusText,
      body: errorText
    })
    throw new Error(`APIエラー: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

/**
 * リトライ付きJSON取得（指数バックオフ）
 * @param {string} url
 * @returns {Promise<any>}
 */
async function fetchJsonWithRetry(url) {
  let lastError = null

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      return await fetchJson(url)
    } catch (error) {
      lastError = error
      const message = String(error.message || '')
      const statusMatch = message.match(/APIエラー:\s*(\d{3})/)
      const status = statusMatch ? Number(statusMatch[1]) : null
      const retryableHttp = status === 429 || status === 408 || (typeof status === 'number' && status >= 500)
      const retryable = isRetryableError(error) || retryableHttp
      if (!retryable || attempt === RETRY_COUNT) {
        throw error
      }
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      await sleep(delay)
    }
  }

  throw lastError || new Error('不明なエラーが発生しました')
}

function pickRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sampleUnique(cards, count, existingIds = new Set()) {
  const result = []
  const pool = Array.isArray(cards) ? [...cards] : []

  while (pool.length > 0 && result.length < count) {
    const idx = Math.floor(Math.random() * pool.length)
    const candidate = pool.splice(idx, 1)[0]
    if (!candidate || !candidate.id) continue
    if (existingIds.has(candidate.id)) continue
    existingIds.add(candidate.id)
    result.push(candidate)
  }

  return result
}

function readApiCachePool() {
  try {
    const raw = localStorage.getItem(API_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('APIキャッシュ読み込みエラー:', error)
    return []
  }
}

function writeApiCachePool(pool) {
  try {
    const trimmed = Array.isArray(pool) ? pool.slice(-API_CACHE_LIMIT) : []
    localStorage.setItem(API_CACHE_KEY, JSON.stringify(trimmed))
  } catch (error) {
    console.warn('APIキャッシュ保存エラー:', error)
  }
}

function getMockPack() {
  // NOTE: オフラインでも最低限 UI を動かすためのモック（画像URLは空＝プレースホルダ表示）
  const now = new Date().toISOString()
  return [
    { id: 'mock-001', name: 'ピカチュウ', imageUrl: '', types: ['雷'], rarity: 'コモン', set: 'モックセット', fetchedAt: now },
    { id: 'mock-002', name: 'ヒトカゲ', imageUrl: '', types: ['炎'], rarity: 'コモン', set: 'モックセット', fetchedAt: now },
    { id: 'mock-003', name: 'ゼニガメ', imageUrl: '', types: ['水'], rarity: 'コモン', set: 'モックセット', fetchedAt: now },
    { id: 'mock-004', name: 'フシギダネ', imageUrl: '', types: ['草'], rarity: 'コモン', set: 'モックセット', fetchedAt: now },
    { id: 'mock-005', name: 'イーブイ', imageUrl: '', types: ['無色'], rarity: 'コモン', set: 'モックセット', fetchedAt: now },
  ]
}

function buildUserFacingErrorMessage(error) {
  const message = String(error?.message || '')
  if (message.includes('AbortError')) {
    return 'タイムアウト: Pokémon TCG API の応答が遅いため、取得に失敗しました。'
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Load failed')) {
    return 'ネットワークエラー: Pokémon TCG API に接続できませんでした。'
  }
  if (message.includes('CORS')) {
    return 'CORSエラー: ブラウザのセキュリティ設定により API へのアクセスがブロックされました。'
  }
  if (message.includes('APIエラー: 401') || message.includes('APIエラー: 403')) {
    return '認証エラー: APIキーが無効、または権限が不足している可能性があります。'
  }
  if (message.includes('APIエラー: 429')) {
    return 'レート制限: APIの呼び出し回数上限に達した可能性があります。'
  }
  return message || 'カード取得に失敗しました。'
}

async function fetchPackFromApi() {
  // NOTE: APIが重い時の失敗を減らすため、基本は「1ページ取得→ページ内から5枚抽選」
  const existingIds = new Set()
  let selected = []
  let lastError = null
  const pagesToTry = [pickRandomInt(1, MAX_PAGE_GUESS), pickRandomInt(1, MAX_PAGE_GUESS)]

  for (const page of pagesToTry) {
    if (selected.length >= 5) break
    const url = `${API_BASE_URL}?page=${page}&pageSize=${PAGE_SIZE}`

    try {
      const data = await fetchJsonWithRetry(url)
      if (!data || !Array.isArray(data.data)) {
        console.warn('APIレスポンス形式が不正です:', data)
        continue
      }
      const picked = sampleUnique(data.data, 5 - selected.length, existingIds)
      selected = [...selected, ...picked]
    } catch (error) {
      lastError = error
      console.error(`API取得エラー（page=${page}）:`, error)
    }
  }

  if (selected.length === 0) {
    throw lastError || new Error('カードを取得できませんでした。')
  }

  const normalized = selected.slice(0, 5).map(normalizeCard)

  // 成功時はキャッシュプールを更新（オフライン時のフォールバック用）
  const pool = readApiCachePool()
  const existing = new Set(pool.map((c) => c.id))
  const merged = [...pool, ...normalized.filter((c) => c?.id && !existing.has(c.id))]
  writeApiCachePool(merged)

  return normalized
}

function getPackFromApiCache() {
  const pool = readApiCachePool()
  if (!pool || pool.length < 5) return null
  const picked = sampleUnique(pool, 5, new Set())
  return picked.length > 0 ? picked : null
}

function getPackFromCollection() {
  try {
    const collection = getCollection()
    if (!Array.isArray(collection) || collection.length < 5) return null
    const picked = sampleUnique(collection, 5, new Set())
    return picked.length > 0 ? picked : null
  } catch (error) {
    console.warn('コレクションフォールバック取得エラー:', error)
    return null
  }
}

/**
 * パックを開封（正規化済みカードを返す）
 *
 * - APIが落ちている/遅い場合でも、キャッシュ/コレクション/モックにフォールバックして動作を継続します
 * - 開発・テスト用に `?mock=1` または `VITE_POKEMON_TCG_USE_MOCK=1` で強制モックにできます
 *
 * @returns {Promise<{cards: Array, source: 'api'|'cache'|'collection'|'mock', notice: string|null, canSave: boolean}>}
 */
export async function openPack() {
  const forceMockByEnv = String(import.meta.env.VITE_POKEMON_TCG_USE_MOCK || '') === '1'
  const forceMockByQuery = (() => {
    try {
      if (typeof window === 'undefined') return false
      const params = new URLSearchParams(window.location.search || '')
      return params.get('mock') === '1'
    } catch {
      return false
    }
  })()

  if (forceMockByEnv || forceMockByQuery) {
    return {
      cards: getMockPack(),
      source: 'mock',
      notice: 'モックデータで表示しています（開発/テスト用）。',
      canSave: false,
    }
  }

  try {
    const cards = await fetchPackFromApi()
    return { cards, source: 'api', notice: null, canSave: true }
  } catch (error) {
    const userMessage = buildUserFacingErrorMessage(error)

    const cached = getPackFromApiCache()
    if (cached) {
      return {
        cards: cached,
        source: 'cache',
        notice: `${userMessage} 代わりにキャッシュから表示しています。`,
        canSave: true,
      }
    }

    const fromCollection = getPackFromCollection()
    if (fromCollection) {
      return {
        cards: fromCollection,
        source: 'collection',
        notice: `${userMessage} 代わりにコレクションから表示しています。`,
        canSave: false,
      }
    }

    return {
      cards: getMockPack(),
      source: 'mock',
      notice: `${userMessage} 代わりにモックデータで表示しています。`,
      canSave: false,
    }
  }
}

/**
 * カードデータを正規化
 * @param {Object} card - APIから取得したカードデータ
 * @returns {Object} 正規化されたカードデータ
 */
export function normalizeCard(card) {
  return {
    id: card.id,
    name: card.name,
    imageUrl: card.images?.large || card.images?.small || '',
    types: card.types || [],
    supertype: card.supertype || '',
    subtypes: card.subtypes || [],
    rarity: card.rarity || '',
    set: card.set?.name || '',
    number: card.number || '',
    artist: card.artist || '',
    fetchedAt: new Date().toISOString()
  }
}
