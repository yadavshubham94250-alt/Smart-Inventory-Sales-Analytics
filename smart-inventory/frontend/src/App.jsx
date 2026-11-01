import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './components/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';

// Protected routes: anyone without a logged-in user is redirected to /login.
function Protected({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <Spinner label="Checking your session…" />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { user, checking } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={checking ? <Spinner /> : user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="sales" element={<Sales />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
