/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250 // APIの最大ページサイズ

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
    log('リクエスト1: カード総数を取得', { url: countUrl, headers: getHeaders() })
    
    const countResponse = await fetch(countUrl, {
      headers: getHeaders()
    })
    
    log('レスポンス1: ステータス', { status: countResponse.status, statusText: countResponse.statusText, ok: countResponse.ok })
    
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
    log('レスポンス1: データ取得完了', countData)
    
    // APIレスポンスの形式を確認
    if (!countData || typeof countData !== 'object') {
      log('エラー: APIレスポンスの形式が不正', countData)
      throw new Error('APIレスポンスの形式が不正です')
    }
    
    // totalCountが存在しない場合は、デフォルト値を使用
    const totalCount = countData.totalCount || 250
    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    log('カード総数情報', { totalCount, maxPage, pageSize: PAGE_SIZE })
    
    // ランダムな5枚のカードを取得するため、ランダムなページを選択
    const randomPages = []
    for (let i = 0; i < 5; i++) {
      randomPages.push(Math.floor(Math.random() * maxPage) + 1)
    }
    log('ランダムページ選択', { randomPages })

    // 各ページからランダムに1枚ずつ取得
    const cardPromises = randomPages.map(async (page) => {
      log(`ページ ${page}: リクエスト開始`)
      try {
        const pageUrl = `${API_BASE_URL}?page=${page}&pageSize=${PAGE_SIZE}`
        log(`ページ ${page}: リクエスト送信`, { url: pageUrl })
        
        const response = await fetch(pageUrl, {
          headers: getHeaders()
        })

        log(`ページ ${page}: レスポンス受信`, { status: response.status, statusText: response.statusText, ok: response.ok })

        if (!response.ok) {
          const errorText = await response.text()
          log(`ページ ${page}: エラー`, {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          })
          throw new Error(`カード取得エラー: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        log(`ページ ${page}: データ取得`, { dataKeys: Object.keys(data), dataArrayLength: data.data?.length })
        
        // レスポンスの形式を確認
        if (!data || !Array.isArray(data.data)) {
          log(`ページ ${page}: レスポンス形式が不正`, data)
          return null
        }
        
        const cards = data.data || []
        log(`ページ ${page}: カード数`, { count: cards.length })
        
        if (cards.length === 0) {
          log(`ページ ${page}: カードが0枚`)
          return null
        }
        
        // ページ内からランダムに1枚選択
        const randomIndex = Math.floor(Math.random() * cards.length)
        const selectedCard = cards[randomIndex]
        log(`ページ ${page}: カード選択`, { index: randomIndex, cardId: selectedCard?.id, cardName: selectedCard?.name })
        return selectedCard
      } catch (error) {
        log(`ページ ${page}: 例外発生`, { error: error.message, stack: error.stack })
        return null
      }
    })

    const cards = await Promise.all(cardPromises)
    let validCards = cards.filter(card => card !== null)
    log('初期取得完了', { total: cards.length, valid: validCards.length, invalid: cards.length - validCards.length })
    
    // 5枚未満の場合は、不足分を再取得（無限ループを防ぐため、最大3回まで）
    if (validCards.length < 5) {
      log('カードが不足しています。追加取得を開始', { current: validCards.length, needed: 5 - validCards.length })
      const additionalNeeded = 5 - validCards.length
      let attempts = 0
      const maxAttempts = 3
      
      while (validCards.length < 5 && attempts < maxAttempts) {
        attempts++
        try {
          // 追加のランダムページから取得
          const additionalPage = Math.floor(Math.random() * maxPage) + 1
          const response = await fetch(
            `${API_BASE_URL}?page=${additionalPage}&pageSize=${PAGE_SIZE}`,
            {
              headers: getHeaders()
            }
          )
          
          if (response.ok) {
            const data = await response.json()
            if (data && Array.isArray(data.data) && data.data.length > 0) {
              const existingIds = new Set(validCards.map(card => card.id))
              const newCards = data.data.filter(card => !existingIds.has(card.id))
              
              if (newCards.length > 0) {
                const randomIndex = Math.floor(Math.random() * newCards.length)
                validCards.push(newCards[randomIndex])
              }
            }
          }
        } catch (error) {
          console.error('追加カード取得エラー:', error)
        }
      }
    }
    
    // 5枚未満でも取得できた分を返す
    if (validCards.length === 0) {
      log('エラー: カードが1枚も取得できませんでした')
      throw new Error('カードを取得できませんでした。APIへの接続を確認してください。')
    }
    
    const result = validCards.slice(0, 5)
    log('完了: カード取得成功', { count: result.length, cardIds: result.map(c => c.id) })
    return result
  } catch (error) {
    log('エラー: カード取得処理で例外発生', { 
      message: error.message, 
      stack: error.stack,
      name: error.name 
    })
    
    // より詳細なエラーメッセージを提供
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
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
