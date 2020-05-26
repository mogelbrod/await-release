# await-release

CLI (and node module) which polls the NPM registry until a new package version
becomes available. The CLI will exit once a matching release is found, allowing
subsequent commands to run.

## Features

- [x] Supports private NPM registries (if `npm` can access it, so should this package)
- [ ] `--install` flag to automatically run `npm install $package` on release
- [ ] `--update` flag to automatically run `npm update $package` on release
- [ ] `--exec 'echo %p@%v'` to inject and run commands on release
- [ ] `--daemon` to keep listening for new releases (works with `--exec`)

## Installation

```sh
npm install -g await-release
```

## Usage

```sh
await-release [options] <package> [package2@version...]
```

Package identifiers may optionally include:

- scope (@org/pkg)
- semver version string (pkg@16, pkg@1.x, etc.)

### Options

```
-o, --output <format>    output format (default/verbose/none/json)
-g, --grace <seconds>    accept versions released up to X before invocation (default: 10)
-t, --timeout <seconds>  exit if no release matches after X seconds (default: 0)
-d, --delay <seconds>    time between polling requests (default: 2)
```

### In combination with other tools

#### Install new version of a dependency when it becomes available

```sh
await-release my-dependency && npm update my-dependency
```

#### Notify when a new package version is released

```sh
await-release package-name && npx -p node-notifier-cli notify -t 'package-name released'
```
