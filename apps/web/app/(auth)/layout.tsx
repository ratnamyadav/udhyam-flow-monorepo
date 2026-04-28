import { Logo } from '@udyamflow/ui';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg grid grid-cols-1 lg:grid-cols-[1fr_520px]">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-surface border-r border-border">
        <Link href="/">
          <Logo />
        </Link>
        <div className="max-w-[420px]">
          <div className="text-xs uppercase tracking-wider text-ink-mute mb-3">Customer story</div>
          <p
            className="text-[22px] text-ink leading-relaxed"
            style={{ fontFamily: '"Fraunces", Georgia, serif' }}
          >
            "We replaced three booking tools and a spreadsheet with UdyamFlow. Same evening we were
            taking patients again."
          </p>
          <div className="mt-5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#0f766e] text-white grid place-items-center text-[11px] font-semibold">
              AP
            </div>
            <div>
              <div className="text-[13px] font-medium text-ink">Dr. Anika Patel</div>
              <div className="text-xs text-ink-mute">Patel Clinic, Mumbai</div>
            </div>
          </div>
        </div>
        <div className="text-xs text-ink-soft">© 2026 UdyamFlow</div>
      </div>
      <div className="flex items-center justify-center p-8">{children}</div>
    </div>
  );
}
