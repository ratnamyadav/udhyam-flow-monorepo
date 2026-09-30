'use client';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-[13px] px-3 py-1.5 rounded-md border border-neutral-300 text-neutral-800 hover:bg-neutral-100 print:hidden"
    >
      Download / print PDF
    </button>
  );
}
