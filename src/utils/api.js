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
 * @returns {Promise<Array>} カードデータの配列
 */
export async function fetchRandomCards() {
  try {
    // まず、利用可能なカードの総数を取得
    const countResponse = await fetch(`${API_BASE_URL}?pageSize=1`, {
      headers: getHeaders()
    })
    
    if (!countResponse.ok) {
      const errorText = await countResponse.text()
      console.error('APIレスポンスエラー:', {
        status: countResponse.status,
        statusText: countResponse.statusText,
        body: errorText
      })
      throw new Error(`APIエラー: ${countResponse.status} ${countResponse.statusText}`)
    }

    const countData = await countResponse.json()
    
    // APIレスポンスの形式を確認
    if (!countData || typeof countData !== 'object') {
      throw new Error('APIレスポンスの形式が不正です')
    }
    
    // totalCountが存在しない場合は、デフォルト値を使用
    const totalCount = countData.totalCount || 250
    const maxPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    
    // ランダムな5枚のカードを取得するため、ランダムなページを選択
    const randomPages = []
    for (let i = 0; i < 5; i++) {
      randomPages.push(Math.floor(Math.random() * maxPage) + 1)
    }

    // 各ページからランダムに1枚ずつ取得
    const cardPromises = randomPages.map(async (page) => {
      try {
        const response = await fetch(
          `${API_BASE_URL}?page=${page}&pageSize=${PAGE_SIZE}`,
          {
            headers: getHeaders()
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`ページ ${page} の取得エラー:`, {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          })
          throw new Error(`カード取得エラー: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        
        // レスポンスの形式を確認
        if (!data || !Array.isArray(data.data)) {
          console.warn(`ページ ${page} のレスポンス形式が不正です:`, data)
          return null
        }
        
        const cards = data.data || []
        
        if (cards.length === 0) {
          return null
        }
        
        // ページ内からランダムに1枚選択
        const randomIndex = Math.floor(Math.random() * cards.length)
        return cards[randomIndex]
      } catch (error) {
        console.error(`ページ ${page} の取得エラー:`, error)
        return null
      }
    })

    const cards = await Promise.all(cardPromises)
    let validCards = cards.filter(card => card !== null)
    
    // 5枚未満の場合は、不足分を再取得（無限ループを防ぐため、最大3回まで）
    if (validCards.length < 5) {
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
      throw new Error('カードを取得できませんでした。APIへの接続を確認してください。')
    }
    
    return validCards.slice(0, 5)
  } catch (error) {
    console.error('カード取得エラー:', error)
    
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
