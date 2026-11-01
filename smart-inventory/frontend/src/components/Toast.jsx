import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

// Success / error notifications. Usage: const toast = useToast(); toast.success('Saved'); toast.error('Failed');
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((type, text) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs, { id, type, text }]);
    setTimeout(() => remove(id), type === 'error' ? 7000 : 3500);
  }, [remove]);
  const api = { success: (t) => push('success', t), error: (t) => push('error', t) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast-x ${t.type === 'error' ? 'error' : ''}`}>
            <span>{t.text}</span>
            <button className="btn-close" aria-label="Dismiss" onClick={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
