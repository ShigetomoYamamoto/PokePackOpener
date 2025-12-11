import { useState } from 'react'
import { fetchRandomCards, normalizeCard } from '../utils/api'
import { addToCollection } from '../utils/storage'
import CardGrid from '../components/CardGrid'
import './HomePage.css'

function HomePage() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [debugLogs, setDebugLogs] = useState([])
  const [showDebug, setShowDebug] = useState(true)
  const [progress, setProgress] = useState(null)

  const addDebugLog = (message, data = null) => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = {
      timestamp,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    }
    setDebugLogs(prev => [...prev, logEntry])
    console.log(`[${timestamp}] ${message}`, data || '')
  }

  const handleOpenPack = async () => {
    setLoading(true)
    setError(null)
    setCards([])
    setDebugLogs([])

    addDebugLog('パック開封処理を開始')

    try {
      addDebugLog('fetchRandomCardsを呼び出し')
      const fetchedCards = await fetchRandomCards(addDebugLog, (progressInfo) => {
        setProgress(progressInfo)
        addDebugLog('プログレス更新', progressInfo)
      })
      
      addDebugLog('カード取得完了', { count: fetchedCards?.length })
      
      if (!fetchedCards || fetchedCards.length === 0) {
        throw new Error('カードが取得できませんでした')
      }
      
      addDebugLog('カードを正規化中')
      const normalizedCards = fetchedCards.map(normalizeCard)
      addDebugLog('カード正規化完了', { count: normalizedCards.length })
      
      // コレクションに追加
      addDebugLog('コレクションに追加中')
      addToCollection(normalizedCards)
      addDebugLog('コレクションへの追加完了')
      
      setCards(normalizedCards)
      addDebugLog('パック開封処理が正常に完了しました')
    } catch (err) {
      console.error('パック開封エラー:', err)
      addDebugLog('エラー発生', { 
        message: err.message, 
        stack: err.stack,
        name: err.name 
      })
      // エラーメッセージを詳細に表示
      const errorMessage = err.message || 'パックの開封に失敗しました。もう一度お試しください。'
      setError(errorMessage)
    } finally {
      setLoading(false)
      setProgress(null)
      addDebugLog('パック開封処理終了')
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
          {loading ? (progress ? progress.message : '開封中...') : 'パックを開封する'}
        </button>

        {loading && progress && (
          <div className="progress-info">
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <p className="progress-text">{progress.message}</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="debug-section">
          <button 
            className="debug-toggle-button"
            onClick={() => setShowDebug(!showDebug)}
          >
            {showDebug ? '▼' : '▶'} デバッグログ {showDebug ? '（非表示）' : '（表示）'}
          </button>
          
          {showDebug && debugLogs.length > 0 && (
            <div className="debug-log-container">
              <div className="debug-log-header">
                <span>デバッグログ（{debugLogs.length}件）</span>
                <button 
                  className="debug-clear-button"
                  onClick={() => setDebugLogs([])}
                >
                  クリア
                </button>
              </div>
              <div className="debug-log-content">
                {debugLogs.map((log, index) => (
                  <div key={index} className="debug-log-entry">
                    <span className="debug-log-time">[{log.timestamp}]</span>
                    <span className="debug-log-message">{log.message}</span>
                    {log.data && (
                      <pre className="debug-log-data">{log.data}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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
