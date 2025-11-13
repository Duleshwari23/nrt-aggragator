export function KeyboardHint({ show }: { show: boolean }) {
  if (!show) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-surface-100 dark:bg-surface-100 bg-light-surface-200 text-xs text-gray-400 dark:text-gray-400 text-light-text-secondary px-3 py-2 rounded-lg shadow-lg animate-pulse border border-surface-200 dark:border-surface-200 border-light-border">
      <span className="font-body">Press <kbd className="bg-surface-200 dark:bg-surface-200 bg-light-border px-1 py-0.5 rounded text-white dark:text-white text-light-text-primary">⌘B</kbd> to toggle sidebar</span>
    </div>
  );
}