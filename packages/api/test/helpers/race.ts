import type { Db } from '@udyamflow/db';

// Pause the lifecycle's first UPDATE until another writer has changed the
// row. Real SQL executes both operations; only their order is controlled.
export function updateAfter(db: Db, hook: () => Promise<void>): Db {
  let fired = false;
  // biome-ignore lint/suspicious/noExplicitAny: proxies arbitrary query builders
  function wrap(query: any): any {
    return new Proxy(query, {
      get(target, prop) {
        if (prop === 'returning')
          return async (...args: any[]) => {
            if (!fired) {
              fired = true;
              await hook();
            }
            return target.returning(...args);
          };
        if (prop === 'then')
          return (resolve: any, reject: any) =>
            (async () => {
              if (!fired) {
                fired = true;
                await hook();
              }
              return await target;
            })().then(resolve, reject);
        const value = Reflect.get(target, prop);
        return typeof value === 'function'
          ? (...args: any[]) => wrap(value.apply(target, args))
          : value;
      },
    });
  }
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'update') return (table: any) => wrap(target.update(table));
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
