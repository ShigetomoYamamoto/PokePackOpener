/**
 * Pokémon TCG API クライアント
 * https://docs.pokemontcg.io/
 */

const API_BASE_URL = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250 // APIの最大ページサイズ

/**
 * ランダムに5枚のカードを取得
 * @returns {Promise<Array>} カードデータの配列
 */
export async function fetchRandomCards() {
  try {
    // まず、利用可能なカードの総数を取得
    const countResponse = await fetch(`${API_BASE_URL}?pageSize=1`, {
      headers: {
        'X-Api-Key': '' // APIキーは不要（無料プラン）
      }
    })
    
    if (!countResponse.ok) {
      throw new Error(`APIエラー: ${countResponse.status}`)
    }

    const countData = await countResponse.json()
    const totalCount = countData.totalCount || 250 // デフォルト値
    const maxPage = Math.ceil(totalCount / PAGE_SIZE)
    
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
            headers: {
              'X-Api-Key': ''
            }
          }
        )

        if (!response.ok) {
          throw new Error(`カード取得エラー: ${response.status}`)
        }

        const data = await response.json()
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
    const validCards = cards.filter(card => card !== null)
    
    // 5枚未満の場合は重複を許容して再度取得
    if (validCards.length < 5) {
      const additionalNeeded = 5 - validCards.length
      const additionalCards = await fetchRandomCards()
      return [...validCards, ...additionalCards.slice(0, additionalNeeded)].slice(0, 5)
    }
    
    return validCards.slice(0, 5)
  } catch (error) {
    console.error('カード取得エラー:', error)
    throw error
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
