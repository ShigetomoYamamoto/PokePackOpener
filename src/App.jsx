import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import HomePage from './pages/HomePage'
import CollectionPage from './pages/CollectionPage'
import './App.css'

function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-header">
          <h1>PokéPack Opener</h1>
          <nav>
            <Link to="/">ホーム</Link>
            <Link to="/collection">コレクション</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/collection" element={<CollectionPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}

export default App
