import { useState } from 'react'
import { fetchRandomCards, normalizeCard } from '../utils/api'
import { addToCollection } from '../utils/storage'
import CardGrid from '../components/CardGrid'
import './HomePage.css'

function HomePage() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleOpenPack = async () => {
    setLoading(true)
    setError(null)
    setCards([])

    try {
      const fetchedCards = await fetchRandomCards()
      
      if (!fetchedCards || fetchedCards.length === 0) {
        throw new Error('カードが取得できませんでした')
      }
      
      const normalizedCards = fetchedCards.map(normalizeCard)
      
      // コレクションに追加
      addToCollection(normalizedCards)
      
      setCards(normalizedCards)
    } catch (err) {
      console.error('パック開封エラー:', err)
      // エラーメッセージを詳細に表示
      const errorMessage = err.message || 'パックの開封に失敗しました。もう一度お試しください。'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-page">
      <div className="home-content">
        <h2>パックを開封しよう！</h2>
        <p className="home-description">
          ボタンをクリックすると、ランダムに5枚のポケモンカードが取得されます。
        </p>
        
        <button 
          className="open-pack-button"
          onClick={handleOpenPack}
          disabled={loading}
        >
          {loading ? '開封中...' : 'パックを開封する'}
        </button>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {cards.length > 0 && (
          <div className="opened-cards">
            <h3>開封されたカード（{cards.length}枚）</h3>
            <CardGrid cards={cards} />
            <p className="collection-notice">
              ✓ カードはコレクションに自動保存されました
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage
