'use client';

import { signOut } from '@udyamflow/auth/client';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        router.push('/sign-in');
      }}
      className="text-[13px] text-ink-mute hover:text-ink"
    >
      Sign out
    </button>
  );
}
