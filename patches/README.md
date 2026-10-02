# URI decoder security backport

`decode-uri-component@0.2.2.patch` is applied by pnpm `patchedDependencies`, with its content hash committed in the lockfile. It is not a manual node_modules edit.

Advisory: [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), CVE-2026-45822. Upstream fix: [fa479dafeede7bedf04e5c89aa78f2a78c664005](https://github.com/SamVerschueren/decode-uri-component/commit/fa479dafeede7bedf04e5c89aa78f2a78c664005), single-pass UTF-8 scanner. Source copied from MIT-licensed npm 0.5.0, release commit `a12fabaa28303cc8b5b07e93d128f4fc09fc31e5`.

The fixed upstream implementation is preserved; only its ESM default export becomes a callable CommonJS `module.exports`, required by unchanged `query-string@7.1.3` inside Expo Linking. The existing package license remains. Upgrading to 0.5.0 directly would change the module contract.

`packages/api/test/dependency-security.test.ts` uses the actual installed Expo Linking/query-string consumer. It checks ordinary query strings, valid UTF-8 and 10,000 malformed percent-encoded bytes with a bounded test timeout. Final full suite passed 188 API + 8 storage tests. The raw registry audit still flags the declared legacy version; that flag must be explained as a tested backport, not hidden as a clean audit.
