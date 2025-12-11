/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250 // APIの最大ページサイズ
const CARDS_NEEDED = 5 // 必要なカード枚数
const REQUEST_TIMEOUT = 20000 // 20秒でタイムアウト（モバイル環境を考慮）
const MAX_RETRIES = 3 // 最大リトライ回数（モバイル環境ではリトライが重要）
const CACHE_EXPIRY = 24 * 60 * 60 * 1000 // キャッシュ有効期限: 24時間
const RETRY_DELAY_BASE = 1000 // リトライの基本遅延時間（ミリ秒）

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
 * キャッシュからデータを取得
 * @param {string} url - リクエストURL
 * @returns {Object|null} キャッシュされたデータ、またはnull
 */
function getCachedData(url) {
  try {
    const cacheKey = `api_cache_${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_EXPIRY) {
        return data
      }
      // 期限切れのキャッシュを削除
      localStorage.removeItem(cacheKey)
    }
  } catch (error) {
    console.warn('キャッシュ読み込みエラー:', error)
  }
  return null
}

/**
 * データをキャッシュに保存
 * @param {string} url - リクエストURL
 * @param {Object} data - キャッシュするデータ
 */
function setCachedData(url, data) {
  try {
    const cacheKey = `api_cache_${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`
    const cacheData = {
      data,
      timestamp: Date.now()
    }
    localStorage.setItem(cacheKey, JSON.stringify(cacheData))
  } catch (error) {
    console.warn('キャッシュ保存エラー:', error)
    // ストレージが満杯の場合、古いキャッシュを削除
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter(key => key.startsWith('api_cache_'))
      if (cacheKeys.length > 50) {
        // 古いキャッシュを削除（50件を超える場合）
        cacheKeys.sort().slice(0, cacheKeys.length - 50).forEach(key => {
          localStorage.removeItem(key)
        })
      }
    } catch (cleanError) {
      console.warn('キャッシュクリーンアップエラー:', cleanError)
    }
  }
}

/**
 * タイムアウト付きフェッチ（リトライ機能付き、キャッシュ対応）
 * @param {string} url - リクエストURL
 * @param {Object} options - フェッチオプション
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @param {Function} debugLog - デバッグログ関数
 * @param {number} retryCount - 現在のリトライ回数
 * @param {boolean} useCache - キャッシュを使用するか
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT, debugLog = null, retryCount = 0, useCache = true) {
  const log = (message, data = null) => {
    if (debugLog) {
      debugLog(message, data)
    }
    console.log(`[Fetch] ${message}`, data || '')
  }
  
  // キャッシュチェック（初回リクエストのみ）
  if (useCache && retryCount === 0) {
    const cached = getCachedData(url)
    if (cached) {
      log('キャッシュから取得', { url })
      // キャッシュされたデータをResponseオブジェクトとして返す
      return new Response(JSON.stringify(cached), {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
  
  const controller = new AbortController()
  const startTime = Date.now()
  const timeoutId = setTimeout(() => {
    log(`タイムアウト: ${timeout}ms経過`, { url, retryCount })
    controller.abort()
  }, timeout)
  
  try {
    log(`リクエスト開始${retryCount > 0 ? ` (リトライ ${retryCount}/${MAX_RETRIES})` : ''}`, { url })
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    
    const duration = Date.now() - startTime
    clearTimeout(timeoutId)
    log(`リクエスト完了`, { duration: `${duration}ms`, status: response.status })
    
    // 成功したレスポンスをキャッシュ（初回リクエストのみ）
    if (useCache && retryCount === 0 && response.ok) {
      const clonedResponse = response.clone()
      clonedResponse.json().then(data => {
        setCachedData(url, data)
        log('キャッシュに保存', { url })
      }).catch(err => {
        console.warn('キャッシュ保存失敗:', err)
      })
    }
    
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    const duration = Date.now() - startTime
    
    // ネットワークエラーやタイムアウトの場合、リトライを試みる
    const isRetryableError = 
      error.name === 'AbortError' || 
      error.name === 'TypeError' ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Load failed') ||
      error.message.includes('NetworkError')
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1
      // 指数バックオフ: 1秒、2秒、4秒
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount)
      log(`リトライ可能なエラー: ${error.name}`, { 
        duration: `${duration}ms`, 
        error: error.message,
        retryCount,
        nextRetry,
        delay: `${delay}ms`
      })
      log(`リトライを${delay}ms後に実行`, { nextRetry, maxRetries: MAX_RETRIES })
      
      await new Promise(resolve => setTimeout(resolve, delay))
      // リトライ時はキャッシュを使用しない（ネットワーク問題の可能性があるため）
      return fetchWithTimeout(url, options, timeout, debugLog, nextRetry, false)
    }
    
    log(`エラー発生（リトライ不可）`, { 
      error: error.message, 
      name: error.name, 
      duration: `${duration}ms`,
      retryCount,
      isRetryable: isRetryableError
    })
    throw error
  }
}

/**
 * ランダムに5枚のカードを取得
 * @param {Function} debugLog - デバッグログを追加するコールバック関数（オプション）
 * @param {Function} progressCallback - プログレスコールバック関数（オプション）
 * @returns {Promise<Array>} カードデータの配列
 */
export async function fetchRandomCards(debugLog = null, progressCallback = null) {
  const log = (message, data = null) => {
    if (debugLog) {
      debugLog(message, data)
    }
    console.log(`[API] ${message}`, data || '')
  }
  
  try {
    log('開始: カード取得処理を開始します')
    log('APIキー設定状態', { hasApiKey: !!API_KEY, apiKeyLength: API_KEY ? API_KEY.length : 0 })
    log('APIベースURL', API_BASE_URL)
    
    // カード総数の取得を省略し、直接ランダムページを取得（高速化）
    // デバッグログから totalCount は約19818と判明しているため、固定値を使用
    const ESTIMATED_TOTAL_COUNT = 19818
    
    // pageSize=1はAPIでサポートされていない可能性があるため、
    // 必要最小限のページサイズ（5枚）で1つのリクエストから取得する方式に戻す
    const OPTIMAL_PAGE_SIZE = CARDS_NEEDED // 5枚取得
    const ESTIMATED_MAX_PAGE = Math.ceil(ESTIMATED_TOTAL_COUNT / OPTIMAL_PAGE_SIZE)
    
    log('最適化されたリクエスト戦略', { 
      estimatedTotalCount: ESTIMATED_TOTAL_COUNT, 
      optimalPageSize: OPTIMAL_PAGE_SIZE,
      estimatedMaxPage: ESTIMATED_MAX_PAGE
    })
    
    // 1つのランダムページから5枚取得
    const randomPage = Math.floor(Math.random() * ESTIMATED_MAX_PAGE) + 1
    log('ランダムページ選択', { page: randomPage, maxPage: ESTIMATED_MAX_PAGE, pageSize: OPTIMAL_PAGE_SIZE })
    
    const pageUrl = `${API_BASE_URL}?page=${randomPage}&pageSize=${OPTIMAL_PAGE_SIZE}`
    log('リクエスト: カードページを取得', { url: pageUrl })
    
    if (progressCallback) {
      progressCallback({ 
        current: 1, 
        total: 1, 
        message: 'カードを取得中...' 
      })
    }
    
    const response = await fetchWithTimeout(pageUrl, {
      headers: getHeaders()
    }, REQUEST_TIMEOUT, log)

    log('レスポンス: ステータス', { status: response.status, statusText: response.statusText, ok: response.ok })

    if (!response.ok) {
      const errorText = await response.text()
      log('エラー: カード取得エラー', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      })
      throw new Error(`カード取得エラー: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    log('レスポンス: データ取得', { dataKeys: Object.keys(data), dataArrayLength: data.data?.length })
    
    // レスポンスの形式を確認
    if (!data || !Array.isArray(data.data)) {
      log('エラー: レスポンス形式が不正', data)
      throw new Error('APIレスポンスの形式が不正です')
    }
    
    const cards = data.data || []
    log('カード数', { count: cards.length })
    
    if (cards.length === 0) {
      log('エラー: カードが0枚')
      throw new Error('カードが取得できませんでした')
    }
    
    // ページ内からランダムに必要な枚数選択（重複なし）
    const selectedCards = []
    const availableIndices = Array.from({ length: cards.length }, (_, i) => i)
    
    while (selectedCards.length < CARDS_NEEDED && availableIndices.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableIndices.length)
      const cardIndex = availableIndices.splice(randomIndex, 1)[0]
      selectedCards.push(cards[cardIndex])
    }
    
    if (progressCallback) {
      progressCallback({ 
        current: 1, 
        total: 1, 
        message: 'カード取得完了' 
      })
    }
    
    log('カード選択完了', { 
      selectedCount: selectedCards.length, 
      requestedCount: CARDS_NEEDED,
      cardIds: selectedCards.map(c => c.id),
      cardNames: selectedCards.map(c => c.name)
    })
    
    if (selectedCards.length < CARDS_NEEDED) {
      log('警告: 必要な枚数に満たない', { 
        selected: selectedCards.length, 
        needed: CARDS_NEEDED 
      })
    }
    
    return selectedCards
  } catch (error) {
    log('エラー: カード取得処理で例外発生', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    })
    
    // より詳細なエラーメッセージを提供
    if (error.message.includes('タイムアウト') || error.message.includes('AbortError')) {
      throw new Error(`接続タイムアウト: ネットワーク接続が不安定な可能性があります。電車内や移動中の場合、しばらく待ってから再度お試しください。`)
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Load failed')) {
      // オフライン状態をチェック
      const isOffline = !navigator.onLine
      if (isOffline) {
        throw new Error('オフライン状態です。インターネット接続を確認してください。')
      }
      throw new Error('ネットワークエラー: APIに接続できませんでした。電車内や移動中の場合、ネットワークが不安定な可能性があります。しばらく待ってから再度お試しください。')
    } else if (error.message.includes('CORS')) {
      throw new Error('CORSエラー: ブラウザのセキュリティ設定により、APIへのアクセスがブロックされました。')
    } else {
      // 元のエラーメッセージを含めて、より詳細な情報を提供
      const errorMessage = error.message || '不明なエラーが発生しました'
      throw new Error(`APIエラー: ${errorMessage}`)
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
