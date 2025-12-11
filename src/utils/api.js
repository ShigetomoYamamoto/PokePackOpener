/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250 // APIの最大ページサイズ
const CARDS_NEEDED = 5 // 必要なカード枚数
const REQUEST_TIMEOUT = 20000 // 20秒でタイムアウト（モバイル環境を考慮）
const MAX_RETRIES = 3 // 最大リトライ回数（モバイル環境ではリトライが重要）
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // キャッシュ有効期限: 7日間（長めに設定してキャッシュ効率を向上）
const RETRY_DELAY_BASE = 1000 // リトライの基本遅延時間（ミリ秒）
const PARALLEL_REQUESTS = 5 // 並列リクエスト数（5枚を並列取得）
const MIN_PAGE_SIZE = 2 // APIでサポートされている最小ページサイズ（pageSize=1は失敗するため）

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
      const age = Date.now() - timestamp
      if (age < CACHE_EXPIRY) {
        console.log(`[Cache] キャッシュから取得 (${Math.floor(age / 1000)}秒前のキャッシュ)`)
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
    console.log(`[Cache] キャッシュに保存: ${url}`)
  } catch (error) {
    console.warn('キャッシュ保存エラー:', error)
    // ストレージが満杯の場合、古いキャッシュを削除
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter(key => key.startsWith('api_cache_'))
      if (cacheKeys.length > 100) {
        // 古いキャッシュを削除（100件を超える場合、より多く保持）
        // タイムスタンプでソートして古いものを削除
        const cacheEntries = cacheKeys.map(key => {
          try {
            const cached = localStorage.getItem(key)
            if (cached) {
              const { timestamp } = JSON.parse(cached)
              return { key, timestamp }
            }
          } catch (e) {
            return { key, timestamp: 0 }
          }
          return { key, timestamp: 0 }
        })
        
        cacheEntries.sort((a, b) => a.timestamp - b.timestamp)
        const toDelete = cacheEntries.slice(0, cacheEntries.length - 100)
        toDelete.forEach(({ key }) => localStorage.removeItem(key))
        console.log(`[Cache] 古いキャッシュを${toDelete.length}件削除`)
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
    
    // ネットワーク状態を確認
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('オフライン状態です')
    }
    
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
    
    // より詳細なエラー情報を取得
    const errorDetails = {
      name: error.name,
      message: error.message,
      duration: `${duration}ms`,
      retryCount,
      url,
      online: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'
    }
    
    // ネットワークエラーやタイムアウトの場合、リトライを試みる
    const isRetryableError = 
      error.name === 'AbortError' || 
      error.name === 'TypeError' ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Load failed') ||
      error.message.includes('NetworkError') ||
      error.message.includes('オフライン')
    
    if (isRetryableError && retryCount < MAX_RETRIES) {
      const nextRetry = retryCount + 1
      // 指数バックオフ: 1秒、2秒、4秒
      const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount)
      log(`リトライ可能なエラー: ${error.name}`, { 
        ...errorDetails,
        nextRetry,
        delay: `${delay}ms`
      })
      log(`リトライを${delay}ms後に実行`, { nextRetry, maxRetries: MAX_RETRIES })
      
      await new Promise(resolve => setTimeout(resolve, delay))
      // リトライ時はキャッシュを使用しない（ネットワーク問題の可能性があるため）
      return fetchWithTimeout(url, options, timeout, debugLog, nextRetry, false)
    }
    
    log(`エラー発生（リトライ不可）`, { 
      ...errorDetails,
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
    
    // カード総数の取得を省略し、直接ランダムカードを取得（高速化）
    // デバッグログから totalCount は約19818と判明しているため、固定値を使用
    const ESTIMATED_TOTAL_COUNT = 19818
    const ESTIMATED_MAX_PAGE = Math.ceil(ESTIMATED_TOTAL_COUNT / PAGE_SIZE) // 約80ページ
    
    log('並列リクエスト戦略', { 
      estimatedTotalCount: ESTIMATED_TOTAL_COUNT, 
      estimatedMaxPage: ESTIMATED_MAX_PAGE,
      parallelRequests: PARALLEL_REQUESTS,
      minPageSize: MIN_PAGE_SIZE
    })
    
    // 戦略: 5つの異なるページから各2枚ずつ並列取得（pageSize=1は失敗するため2枚に）
    // 各リクエストは軽量で、1つが失敗しても他のリクエストは続行できる
    const randomPages = []
    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      randomPages.push(Math.floor(Math.random() * ESTIMATED_MAX_PAGE) + 1)
    }
    
    log('ランダムページ選択', { pages: randomPages })
    
    // 並列リクエストを実行（各ページから2枚ずつ取得）
    const cardPromises = randomPages.map(async (page, index) => {
      const pageUrl = `${API_BASE_URL}?page=${page}&pageSize=${MIN_PAGE_SIZE}`
      log(`並列リクエスト ${index + 1}/${PARALLEL_REQUESTS}: 開始`, { page, url: pageUrl })
      
      if (progressCallback) {
        progressCallback({ 
          current: index + 1, 
          total: PARALLEL_REQUESTS, 
          message: `カード ${index + 1}/${PARALLEL_REQUESTS} を取得中...` 
        })
      }
      
      try {
        const response = await fetchWithTimeout(pageUrl, {
          headers: getHeaders()
        }, REQUEST_TIMEOUT, log)

        if (!response.ok) {
          const errorText = await response.text()
          log(`並列リクエスト ${index + 1}: エラー`, {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          })
          return null
        }

        const data = await response.json()
        
        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
          log(`並列リクエスト ${index + 1}: データなし`, { data })
          return null
        }
        
        // 2枚取得したら、ランダムに1枚選択
        const cards = data.data
        const randomIndex = Math.floor(Math.random() * cards.length)
        const card = cards[randomIndex]
        
        log(`並列リクエスト ${index + 1}: 成功`, { cardId: card.id, cardName: card.name })
        
        if (progressCallback) {
          progressCallback({ 
            current: index + 1, 
            total: PARALLEL_REQUESTS, 
            message: `カード ${index + 1}/${PARALLEL_REQUESTS} を取得完了` 
          })
        }
        
        return card
      } catch (error) {
        log(`並列リクエスト ${index + 1}: 例外`, { error: error.message })
        return null
      }
    })
    
    // すべての並列リクエストを待機
    const results = await Promise.all(cardPromises)
    const validCards = results.filter(card => card !== null)
    
    log('並列リクエスト完了', { 
      total: results.length,
      valid: validCards.length,
      invalid: results.length - validCards.length
    })
    
    if (validCards.length === 0) {
      throw new Error('カードが取得できませんでした。ネットワーク接続を確認してください。')
    }
    
    // 重複を除去（同じカードが複数取得された場合）
    const uniqueCards = []
    const seenIds = new Set()
    for (const card of validCards) {
      if (!seenIds.has(card.id)) {
        seenIds.add(card.id)
        uniqueCards.push(card)
      }
    }
    
    log('カード取得完了', { 
      selectedCount: uniqueCards.length, 
      requestedCount: CARDS_NEEDED,
      cardIds: uniqueCards.map(c => c.id),
      cardNames: uniqueCards.map(c => c.name)
    })
    
    // 必要な枚数に満たない場合は、取得できた分だけ返す
    return uniqueCards.slice(0, CARDS_NEEDED)
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
