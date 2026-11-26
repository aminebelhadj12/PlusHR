import React from 'react';
import { AppProvider } from './contexts/AppContext';
import { AppRouter } from './routes/AppRouter';

export function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}

export default App;
