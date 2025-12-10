import Card from './Card'
import './CardGrid.css'

/**
 * カードグリッド表示コンポーネント
 * @param {Array} cards - カードデータの配列
 */
function CardGrid({ cards }) {
  if (!cards || cards.length === 0) {
    return <div className="card-grid-empty">カードがありません</div>
  }

  return (
    <div className="card-grid">
      {cards.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </div>
  )
}

export default CardGrid
