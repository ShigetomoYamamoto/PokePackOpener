/**
 * ローカルストレージ管理ユーティリティ
 */

const STORAGE_KEY = 'pokepack_collection'

/**
 * コレクションを取得
 * @returns {Array} 保存されたカードの配列
 */
export function getCollection() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return []
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('コレクション読み込みエラー:', error)
    return []
  }
}

/**
 * カードをコレクションに追加
 * @param {Object|Array} cards - 追加するカード（単体または配列）
 */
export function addToCollection(cards) {
  try {
    const collection = getCollection()
    const cardsToAdd = Array.isArray(cards) ? cards : [cards]
    
    // 重複を避けるため、IDでチェック
    const existingIds = new Set(collection.map(card => card.id))
    const newCards = cardsToAdd.filter(card => !existingIds.has(card.id))
    
    const updatedCollection = [...collection, ...newCards]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCollection))
    return updatedCollection
  } catch (error) {
    console.error('コレクション保存エラー:', error)
    // ストレージが無効な場合（プライベートモードなど）のフォールバック
    if (error.name === 'QuotaExceededError') {
      alert('ストレージの容量が不足しています。')
    } else if (error.name === 'SecurityError') {
      alert('ローカルストレージへのアクセスが拒否されました。')
    }
    throw error
  }
}

/**
 * コレクションをクリア
 */
export function clearCollection() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('コレクション削除エラー:', error)
  }
}

/**
 * コレクションをエクスポート（JSON形式）
 * @returns {string} JSON文字列
 */
export function exportCollection() {
  const collection = getCollection()
  return JSON.stringify(collection, null, 2)
}

/**
 * コレクションをインポート（JSON形式）
 * @param {string} jsonString - JSON文字列
 */
export function importCollection(jsonString) {
  try {
    const imported = JSON.parse(jsonString)
    if (Array.isArray(imported)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported))
      return imported
    } else {
      throw new Error('無効なデータ形式です')
    }
  } catch (error) {
    console.error('コレクションインポートエラー:', error)
    throw error
  }
}
