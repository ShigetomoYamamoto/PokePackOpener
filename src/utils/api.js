/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250 // APIの最大ページサイズ
const REQUEST_TIMEOUT = 15000 // 15秒でタイムアウト

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
 * タイムアウト付きフェッチ
 * @param {string} url - リクエストURL
 * @param {Object} options - フェッチオプション
 * @param {number} timeout - タイムアウト時間（ミリ秒）
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`リクエストがタイムアウトしました（${timeout}ms）`)
    }
    throw error
  }
}

/**
 * ランダムに5枚のカードを取得
 * @param {Function} debugLog - デバッグログを追加するコールバック関数（オプション）
 * @returns {Promise<Array>} カードデータの配列
 */
export async function fetchRandomCards(debugLog = null) {
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
    
    // まず、利用可能なカードの総数を取得
    const countUrl = `${API_BASE_URL}?pageSize=1`
    log('リクエスト: カード総数を取得', { url: countUrl })
    
    const countResponse = await fetchWithTimeout(countUrl, {
      headers: getHeaders()
    })
    
    log('レスポンス: ステータス', { status: countResponse.status, statusText: countResponse.statusText, ok: countResponse.ok })
    
    if (!countResponse.ok) {
      const errorText = await countResponse.text()
      log('エラー: APIレスポンスエラー', {
        status: countResponse.status,
        statusText: countResponse.statusText,
        body: errorText
      })
      throw new Error(`APIエラー: ${countResponse.status} ${countResponse.statusText} - ${errorText}`)
    }

    const countData = await countResponse.json()
    log('レスポンス: データ取得完了', { totalCount: countData.totalCount, page: countData.page })
    
    // APIレスポンスの形式を確認
    if (!countData || typeof countData !== 'object') {
      log('エラー: APIレスポンスの形式が不正', countData)
      throw new Error('APIレスポンスの形式が不正です')
    }
    
    // totalCountが存在しない場合は、デフォルト値を使用
    const totalCount = countData.totalCount || 19818
    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    log('カード総数情報', { totalCount, maxPage, pageSize: PAGE_SIZE })
    
    // 1つのランダムページから5枚取得する方式に変更（効率化）
    const randomPage = Math.floor(Math.random() * maxPage) + 1
    log('ランダムページ選択', { page: randomPage })
    
    const pageUrl = `${API_BASE_URL}?page=${randomPage}&pageSize=${PAGE_SIZE}`
    log('リクエスト: カードページを取得', { url: pageUrl })
    
    const response = await fetchWithTimeout(pageUrl, {
      headers: getHeaders()
    })

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
    
    // ページ内からランダムに5枚選択（重複なし）
    const selectedCards = []
    const selectedIndices = new Set()
    
    while (selectedCards.length < 5 && selectedCards.length < cards.length) {
      const randomIndex = Math.floor(Math.random() * cards.length)
      if (!selectedIndices.has(randomIndex)) {
        selectedIndices.add(randomIndex)
        selectedCards.push(cards[randomIndex])
      }
    }
    
    log('カード選択完了', { 
      selectedCount: selectedCards.length, 
      cardIds: selectedCards.map(c => c.id),
      cardNames: selectedCards.map(c => c.name)
    })
    
    if (selectedCards.length === 0) {
      throw new Error('カードを選択できませんでした')
    }
    
    return selectedCards
  } catch (error) {
    log('エラー: カード取得処理で例外発生', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    })
    
    // より詳細なエラーメッセージを提供
    if (error.message.includes('タイムアウト')) {
      throw new Error(`タイムアウトエラー: APIへの接続がタイムアウトしました（${REQUEST_TIMEOUT}ms）。ネットワーク接続を確認してください。`)
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('ネットワークエラー: APIに接続できませんでした。インターネット接続を確認してください。')
    } else if (error.message.includes('CORS')) {
      throw new Error('CORSエラー: ブラウザのセキュリティ設定により、APIへのアクセスがブロックされました。')
    } else {
      throw error
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
