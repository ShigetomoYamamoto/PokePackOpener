import './Card.css'

/**
 * カード表示コンポーネント
 * @param {Object} card - カードデータ
 */
function Card({ card }) {
  if (!card) {
    return null
  }

  return (
    <div className="card">
      <div className="card-image-container">
        {card.imageUrl ? (
          <img 
            src={card.imageUrl} 
            alt={card.name}
            className="card-image"
            loading="lazy"
          />
        ) : (
          <div className="card-image-placeholder">画像なし</div>
        )}
      </div>
      <div className="card-info">
        <h3 className="card-name">{card.name}</h3>
        {card.types && card.types.length > 0 && (
          <div className="card-types">
            {card.types.map((type, index) => (
              <span key={index} className="card-type">{type}</span>
            ))}
          </div>
        )}
        {card.rarity && (
          <div className="card-rarity">レア度: {card.rarity}</div>
        )}
        {card.set && (
          <div className="card-set">セット: {card.set}</div>
        )}
      </div>
    </div>
  )
}

export default Card
