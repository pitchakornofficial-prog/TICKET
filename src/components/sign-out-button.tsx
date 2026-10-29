'use client';

import { useState } from 'react';
import { AlertIcon } from './alert-icon';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('sign-out failed');
      window.location.href = '/login';
    } catch {
      setError('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
      setPending(false);
    }
  }

  return (
    <div>
      <button
        className="secondary-button"
        type="button"
        disabled={pending}
        onClick={signOut}
      >
        {pending ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          <AlertIcon />
          {error}
        </p>
      )}
    </div>
  );
}
