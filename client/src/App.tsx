import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useSocketStore } from './stores/socketStore';
import Home from './pages/Home';
import Room from './pages/Room';
import Game from './pages/Game';

function App() {
  const { connect, disconnect } = useSocketStore();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:code" element={<Room />} />
        <Route path="/game/:code" element={<Game />} />
      </Routes>
    </div>
  );
}

export default App;
