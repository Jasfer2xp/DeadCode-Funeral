# Release setup

This project supports publishing the npm package and a VS Code extension VSIX. The CI `release.yml` expects these secrets to be configured in the repository settings:

- `NPM_TOKEN` — token with publish rights for npm (used as `NODE_AUTH_TOKEN`).
- `MARKETPLACE_TOKEN` — Personal Access Token for the Visual Studio Marketplace (used by `vsce publish`). Optional.

Steps to configure:
1. Create an npm automation token in your npm account and add it as `NPM_TOKEN` in repository secrets.
2. Create a publisher and Personal Access Token for Visual Studio Marketplace and add it as `MARKETPLACE_TOKEN`.
3. Tag a release locally and push the tag, e.g.: `git tag v1.2.3 && git push origin v1.2.3`.

The release workflow will run tests, publish to npm, and attempt to publish the VSIX if `MARKETPLACE_TOKEN` is present.
