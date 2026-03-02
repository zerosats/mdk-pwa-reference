let lockCount = 0;

function applyBodyScrollLockState(): void {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = lockCount > 0 ? 'hidden' : '';
}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  lockCount += 1;
  applyBodyScrollLockState();

  let released = false;

  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    applyBodyScrollLockState();
  };
}
