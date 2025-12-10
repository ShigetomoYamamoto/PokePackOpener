import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getCollection, clearCollection, exportCollection, importCollection } from '../utils/storage'
import CardGrid from '../components/CardGrid'
import './CollectionPage.css'

function CollectionPage() {
  const [collection, setCollection] = useState([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  useEffect(() => {
    loadCollection()
  }, [])

  const loadCollection = () => {
    const saved = getCollection()
    setCollection(saved)
  }

  const handleClear = () => {
    if (window.confirm('本当にコレクションをすべて削除しますか？この操作は取り消せません。')) {
      clearCollection()
      setCollection([])
      setShowClearConfirm(false)
    }
  }

  const handleExport = () => {
    try {
      const json = exportCollection()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pokepack-collection-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      alert('エクスポートに失敗しました: ' + error.message)
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const imported = importCollection(event.target.result)
          setCollection(imported)
          alert('コレクションをインポートしました！')
        } catch (error) {
          alert('インポートに失敗しました: ' + error.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="collection-page">
      <div className="collection-header">
        <h2>マイコレクション</h2>
        <p className="collection-count">
          所持カード数: {collection.length}枚
        </p>
      </div>

      {collection.length === 0 ? (
        <div className="collection-empty">
          <p>まだカードがありません</p>
          <Link to="/" className="go-home-button">
            パックを開封する
          </Link>
        </div>
      ) : (
        <>
          <div className="collection-actions">
            <button onClick={handleExport} className="action-button export-button">
              エクスポート
            </button>
            <button onClick={handleImport} className="action-button import-button">
              インポート
            </button>
            <button 
              onClick={() => setShowClearConfirm(true)} 
              className="action-button clear-button"
            >
              すべて削除
            </button>
          </div>

          {showClearConfirm && (
            <div className="clear-confirm">
              <p>本当にすべて削除しますか？</p>
              <div className="confirm-buttons">
                <button onClick={handleClear} className="confirm-yes">はい</button>
                <button onClick={() => setShowClearConfirm(false)} className="confirm-no">いいえ</button>
              </div>
            </div>
          )}

          <CardGrid cards={collection} />
        </>
      )}
    </div>
  )
}

export default CollectionPage
