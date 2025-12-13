import { useState } from 'react'
import { openPack } from '../utils/api'
import { addToCollection } from '../utils/storage'
import CardGrid from '../components/CardGrid'
import './HomePage.css'

function HomePage() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [saved, setSaved] = useState(false)

  const handleOpenPack = async () => {
    setLoading(true)
    setError(null)
    setNotice(null)
    setSaved(false)
    setCards([])

    try {
      const result = await openPack()

      if (!result?.cards || result.cards.length === 0) {
        throw new Error('カードが取得できませんでした')
      }

      setCards(result.cards)
      setNotice(result.notice || null)

      // NOTE: フォールバック（モックなど）の場合はコレクションを汚さない
      if (result.canSave) {
        addToCollection(result.cards)
        setSaved(true)
      }
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
            {notice && (
              <div className="notice-message">
                {notice}
              </div>
            )}
            <CardGrid cards={cards} />
            {saved ? (
              <p className="collection-notice">
                ✓ カードはコレクションに自動保存されました
              </p>
            ) : (
              <p className="collection-notice">
                ※ 今回の結果はコレクションへ保存しません
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage
