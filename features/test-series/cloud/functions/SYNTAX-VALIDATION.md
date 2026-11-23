# Test Series Functions syntax validation

The isolated Functions package uses one recursive syntax checker:

```sh
cd features/test-series/cloud/functions
npm run lint
```

`scripts/check-syntax.js` discovers `.js`, `.cjs` and `.mjs` files beneath this package, including nested production modules and test fixtures. It skips only dependency and Git metadata directories (`node_modules` and `.git`) and invokes the current Node.js runtime with `--check` for each discovered file. The scan is deterministic and fails on the first syntax-check error.

The checker does **not** execute files. In particular, files under `tests/load/` are only parsed; neither synthetic load workflow nor capacity benchmark is started by `npm run lint`.

The checker itself has focused regression coverage:

```sh
node --test tests/check-syntax-script.test.js
```

Those tests verify nested `.js`/`.mjs`/`.cjs` discovery, dependency-directory exclusion, complete traversal and fail-closed behavior when a file check fails.

This is source-validation tooling for the isolated Railway Mitra Test Series Functions package. It does not change Firebase configuration, deploy functions, contact payment providers, send OTPs or alter the separate GDCE/root Functions code.
