import { useState, useCallback } from 'react';
import ConfirmModal from '../components/ui/ConfirmModal';

/**
 * useConfirm - Hook for managing confirmation dialogs
 * 
 * Returns:
 * - confirm: function that returns a Promise<boolean>
 * - ConfirmDialog: React component to render in your JSX
 * 
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   
 *   const handleDelete = async () => {
 *     const confirmed = await confirm({
 *       title: "Delete item?",
 *       message: "This action cannot be undone.",
 *       confirmText: "Delete",
 *       confirmVariant: "danger"
 *     });
 *     
 *     if (confirmed) {
 *       // Perform delete
 *     }
 *   };
 *   
 *   // In JSX:
 *   return (
 *     <>
 *       <button onClick={handleDelete}>Delete</button>
 *       <ConfirmDialog />
 *     </>
 *   );
 */
export default function useConfirm() {
  const [state, setState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    confirmVariant: 'danger',
    resolve: null,
    loading: false,
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: options.title || 'Confirm',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        confirmVariant: options.confirmVariant || 'danger',
        resolve,
        loading: false,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (state.loading) return;
    
    setState((prev) => ({ ...prev, loading: true }));
    
    // Call resolve with true after a brief delay to show loading state
    setTimeout(() => {
      if (state.resolve) {
        state.resolve(true);
      }
      setState({
        open: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        confirmVariant: 'danger',
        resolve: null,
        loading: false,
      });
    }, 100);
  }, [state.loading, state.resolve]);

  const handleCancel = useCallback(() => {
    if (state.loading) return;
    
    if (state.resolve) {
      state.resolve(false);
    }
    setState({
      open: false,
      title: '',
      message: '',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
      resolve: null,
      loading: false,
    });
  }, [state.loading, state.resolve]);

  const ConfirmDialog = () => (
    <ConfirmModal
      open={state.open}
      title={state.title}
      message={state.message}
      confirmText={state.confirmText}
      cancelText={state.cancelText}
      confirmVariant={state.confirmVariant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      loading={state.loading}
    />
  );

  return { confirm, ConfirmDialog };
}

