// Display helpers shared by the public and settings membership UIs.

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function formatCadence(interval: string, count: number): string {
  return count <= 1 ? `/ ${interval}` : `every ${count} ${interval}s`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'initialized':
      return 'Awaiting approval';
    case 'pending_approval':
      return 'Bank approval pending';
    case 'on_hold':
      return 'On hold (payment failed)';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
