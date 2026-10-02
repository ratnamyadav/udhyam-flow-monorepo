# Dependency advisory triage

The original `pnpm audit --prod --json` and explicit-public-registry retry exhausted the Node 25 heap near 4 GB and produced no JSON. Both processes ended; no audit fix command was run. A fallback used npm's [documented public bulk advisory endpoint](https://docs.npmjs.com/cli/v11/commands/npm-audit/#bulk-advisory-endpoint) for every exact package version in the lockfile, including development, optional and platform-specific dependencies. Exact semver matches and dependency paths are recorded in the adjacent JSON. Graph reachability through production dependency manifests is not evidence that CLI code is shipped or reachable in the app.

Initial result: 56 package-version/advisory matches across 13 families (1 critical, 42 high, 13 moderate); these are not 56 demonstrated exploitable application defects. Final raw result: 4 matches, including the fixed decoder's declared legacy version. No clean audit claim.

| Package/path | Action / remaining condition |
|---|---|
| shell-quote 1.8.3 ← react-devtools-core | Same-major 1.12.0 override fixes critical shell operator/newline injection and parser DoS. Attack needs untrusted operator/command text passed to tooling; no server call path demonstrated. |
| xmldom 0.8.13 / 0.9.10 ← Expo plist / plist | Separate same-branch 0.8.15 / 0.9.12 fixes for XML injection and malformed-input DoS; native config/build parsers, not demonstrated appointment API exposure. |
| ws 7.5.10 / 8.20.0 ← RN/Metro/devtools/Expo CLI | Separate 7.5.13 / 8.22.0 fixes for fragmented-message DoS/memory disclosure. Do not expose Metro/devtool sockets to untrusted networks. No production application WebSocket endpoint from these packages was demonstrated. |
| image-size 1.2.1 ← Metro 0.84.3 | Align Metro family to compatible upstream 0.84.5 patch, removing old image-size dependency. Avoid forced image-size v2 because old Metro expects a callable default export. Malformed local/bundled image parsing was the build-time condition. |
| js-yaml 4.1.1 ← Expo xcpretty | Same-major 4.3.2 fixes YAML DoS; local build parser, no untrusted server YAML endpoint found. |
| fast-uri 3.1.2 ← AJV | Same-major 3.1.8 URI-validation fixes. |
| browser mapping 2.10.23 / browserslist 4.28.2 / brace-expansion 5.0.5 | Same-major 2.11.27 / 4.29.3 / 5.0.12 fixes in build/config tooling. |
| decode-uri-component 0.2.2 ← query-string 7 ← Expo Linking | Upstream fixed scanner backported with CommonJS contract preserved. Relevant to attacker-supplied malformed deep-link queries; actual consumer regression passed. See patches/README.md for exact provenance. Raw audit retains a version-based flag. |
| **node-forge 1.4.0 ← Expo CLI / code-signing-certificates** | **High unresolved:** latest published version remains 1.4.0. Advisory requires crafted RSA PKCS#1 v1.5 signature verification. No native update code-signing configuration or application verification call was found; the dependency remains and must be rechecked/remediated upstream before using that signature-verification path. Not removed or certified unexploitable. |
| esbuild 0.18.20 ← legacy @esbuild-kit/core-utils ← Drizzle tooling | Moderate residual dev-server cross-origin read advisory. No esbuild development server was run or application serve path found. Keep local tooling off untrusted networks; replacing this legacy dependency across 0.x API branches needs upstream/toolchain migration. |
| uuid 7.0.3 ← xcode 3.0.1 | Moderate residual concerns v3/v5/v6 with caller-provided buffers. Inspected Xcode generator calls v4() without a buffer. No applicable call found; retain visible rather than force incompatible major. |

Narrow version-selecting overrides and the patch are committed, reproducible in the lockfile and install. Verification after these changes: full tests 196 (188 API +8 storage), 11 typecheck tasks, Biome331 files, Expo SDK install check. Native compilation and final build/export evidence are recorded separately; none of this certifies store approval or external gateway accounts.
