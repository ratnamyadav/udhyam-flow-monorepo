import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  context: vi.fn(),
  caller: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  headers: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@udyamflow/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@udyamflow/api', () => ({
  createTRPCContext: mocks.context,
  appRouter: { createCaller: mocks.caller },
}));
vi.mock('@udyamflow/db', async (original) => ({
  ...(await original<typeof import('@udyamflow/db')>()),
  db: { select: mocks.select, insert: mocks.insert },
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const adminPath = new URL('../../../apps/admin/lib/admin.ts', import.meta.url).pathname;
const { requireAdmin } = await import(adminPath);
const staffPath = new URL('../../../apps/admin/lib/staff.ts', import.meta.url).pathname;
const { getStaff, requireStaffCaller } = await import(staffPath);
const actionsPath = new URL('../../../apps/admin/app/gst/actions.ts', import.meta.url).pathname;
const { setPlatformGstThreshold, setStoreGstThreshold } = await import(actionsPath);
const session = (role?: string) => ({
  user: { id: 'synthetic-user', email: 'staff@example.test', role },
  session: { activeOrganizationId: 'foreign' },
});
const actions = [setPlatformGstThreshold, setStoreGstThreshold];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(
    new Headers({ 'x-role': 'admin', 'x-organization-id': 'foreign' }),
  );
  for (const f of [mocks.select, mocks.insert])
    f.mockImplementation(() => {
      throw new Error('fixture data unavailable');
    });
});
function noData() {
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
}
describe('actual Next admin guards and GST action entry points', () => {
  it('rejects unauthenticated page/action callers before data access', async () => {
    mocks.getSession.mockResolvedValue(null);
    for (const g of [getStaff, requireStaffCaller, requireAdmin])
      await expect(g()).rejects.toThrow('REDIRECT:/sign-in');
    for (const a of actions) await expect(a(new FormData())).rejects.toThrow('REDIRECT:/sign-in');
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.caller).not.toHaveBeenCalled();
    noData();
  });
  it.each(['user', 'owner', 'member', 'Admin', 'ADMIN', undefined])(
    'denies %s and foreign tenant/header claims',
    async (role) => {
      mocks.getSession.mockResolvedValue(session(role));
      expect((await getStaff()).caller).toBeNull();
      await expect(requireStaffCaller()).rejects.toThrow('REDIRECT:/sign-in');
      await expect(requireAdmin()).rejects.toThrow('REDIRECT:/dashboard');
      for (const a of actions)
        await expect(a(new FormData())).rejects.toThrow('REDIRECT:/dashboard');
      expect(mocks.context).not.toHaveBeenCalled();
      expect(mocks.caller).not.toHaveBeenCalled();
      noData();
    },
  );
  it('requires exact server admin and builds a fresh API context', async () => {
    const fresh = { session: session('user') },
      caller = {};
    mocks.getSession.mockResolvedValue(session('admin'));
    mocks.context.mockResolvedValue(fresh);
    mocks.caller.mockReturnValue(caller);
    expect((await getStaff()).caller).toBe(caller);
    expect(mocks.caller).toHaveBeenCalledWith(fresh);
    expect((await requireAdmin()).role).toBe('admin');
  });
  it('propagates authentication database failure without privileged results or writes', async () => {
    mocks.getSession.mockRejectedValue(new Error('fixture auth database unavailable'));
    for (const g of [getStaff, requireStaffCaller, requireAdmin])
      await expect(g()).rejects.toThrow('fixture auth database unavailable');
    for (const a of actions)
      await expect(a(new FormData())).rejects.toThrow('fixture auth database unavailable');
    expect(mocks.caller).not.toHaveBeenCalled();
    noData();
  });
  it('fails closed if fresh context authentication fails after first admin check', async () => {
    mocks.getSession.mockResolvedValue(session('admin'));
    mocks.context.mockRejectedValue(new Error('fixture context unavailable'));
    await expect(getStaff()).rejects.toThrow('fixture context unavailable');
    expect(mocks.caller).not.toHaveBeenCalled();
  });
  it('does not revalidate/report saved if an authorized GST write/query fails', async () => {
    mocks.getSession.mockResolvedValue(session('admin'));
    const f = new FormData();
    f.set('threshold', '100');
    f.set('organizationId', 'foreign');
    for (const a of actions) await expect(a(f)).rejects.toThrow('fixture data unavailable');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
