# await-release

CLI (and node module) which polls the NPM registry until a new package version
becomes available. The CLI will exit once a matching release is found, allowing
subsequent commands to run.

## Features

- [x] Supports private NPM registries (if `npm` can access it, so should this package)
- [x] `--exec 'npm install %s'` to inject and run commands on release
- [x] `--install` flag to automatically run `npm install $package` on release
- [ ] `--update` flag to automatically run `npm update $package` on release
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
-i, --install            execute 'npm install' on release
-e, --exec <command>     execute shell command on release (interpolates %p, %s, %t, %v)
-o, --output <format>    output format (default/verbose/none/json)
-g, --grace <seconds>    accept versions released up to X seconds before invocation (default: 10)
-t, --timeout <seconds>  exit if no release matches after X seconds (default: 0)
-d, --delay <seconds>    time between polling requests (default: 2)
```

### Using `--exec`

Other processes can be invoked when a release is discovered using the `--exec`
option. The provided string will be executed within a basic shell environment
after interpolation of the following placeholders:

- `%p`: package name (`my-package`, `@scope/package`, etc.)
- `%s`: package name and version (`my-package@1.0.1`, `@scope/package@2.3.0`, etc.)
- `%t`: time of release in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
  format (`2020-05-26T22:01:02Z`)
- `%v`: released version (`1.0.1`)

#### Install new version of a dependency when it becomes available

```sh
await-release my-dependency -i
# or via --exec:
await-release my-dependency --exec 'npm install %s'
```

#### Notify when a new package version is released

```sh
await-release package-name --exec "npx -p node-notifier-cli notify -t '%p released %v'"
```
