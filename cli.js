#!/usr/bin/env node
'use strict'

const path = require('path')
const { program } = require('commander')
const { spawn } = require('child_process')
const { parseArgsStringToArgv } = require('string-argv')
const {
  awaitRelease,
  ReleaseMatchError,
  DEFAULTS,
  PACKAGE_SPEC_REGEX,
} = require('./index')
const packageJson = require(path.join(__dirname, 'package.json'))

const OUTPUT_STYLES = ['default', 'verbose', 'none', 'json']

const decimal = x => parseFloat(x)

const packages = []

program
  .version(packageJson.version)
  .description(
    'Poll the NPM registry until the requested package(s) has a new release.\n\n' +
    'Package identifiers may optionally include:\n' +
    '  * scope (@org/pkg)\n' +
    '  * semver version string (pkg@16, pkg@1.x, etc.)'
  )
  .arguments('<package> [package2@version...]')
  .action((pkg, additionalPackages) => {
    packages.push(pkg, ...additionalPackages)
  })
  .option('-i, --install',
    `execute 'npm install' on release`)
  .option('-e, --exec <command>',
    `execute shell command on release (interpolates %p, %s, %t, %v)`)
  .option('-o, --output <format>',
    `output format (${OUTPUT_STYLES.join('/')})`,
    OUTPUT_STYLES[0])
  .option('-g, --grace <seconds>',
    'accept versions released up to X seconds before invocation',
    decimal, DEFAULTS.grace)
  .option('-t, --timeout <seconds>',
    'exit if no release matches after X seconds',
    decimal, DEFAULTS.timeout)
  .option('-d, --delay <seconds>',
    'time between polling requests',
    decimal, DEFAULTS.delay)

if (process.argv.length < 3) {
  return program.help()
}

program.parse(process.argv)

// Validate package input
if (!packages.length) {
  return program.help()
}
packages.forEach(pkg => {
  if (pkg.indexOf('%') >= 0) {
    console.error(
      `error: Package identifiers may not contain %: '${pkg}'\n\n` +
      `If it was intended be part of the --exec command,\n` +
      `ensure that you quote the command correctly.`
    )
    process.exit(1)
  } else if (!PACKAGE_SPEC_REGEX.test(pkg)) {
    console.error(
      `error: Invalid package identifier: '${pkg}'`
    )
    process.exit(1)
  }
})

const args = program.opts()
if (args.output === 'verbose') {
  args.logger = (message) => console.log(message)
}

// Start polling for each package
const awaitReleasePromises = packages.map(pkg => {
  return awaitRelease(pkg, args).then(release => {
    switch (args.output) {
      case 'default':
      case 'verbose':
        console.log(
          `${release.spec} (released ${release.time.toLocaleString()})`
        )
        break
    }

    let result = Promise.resolve(release)
    if (args.install) {
      result = result.then(() => exec('npm install %s', release))
    }
    if (args.exec) {
      result = result.then(() => exec(args.exec, release))
    }
    return result
  })
})

Promise.all(awaitReleasePromises).then(packages => {
  switch (args.output) {
    case 'json':
      console.log(JSON.stringify(packages, null, 2))
      break
  }
  process.exit(0)
}).catch(error => {
  if (error instanceof ReleaseMatchError) {
    console.error(error.message)
    return process.exit(3)
  }

  console.error(error.stack)
  return process.exit(4)
})

function exec(cmdTemplate, release) {
  const interpolations = {
    p: release.name,
    s: release.spec,
    t: release.time.toJSON(),
    v: release.version,
  }
  const cmdString = cmdTemplate.replace(/%[%pstv]/g, (m) => (interpolations[m[1]] || '%'))
  const cmdArgs = parseArgsStringToArgv(cmdString)
  const cmd = cmdArgs.shift()

  if (args.output === 'verbose') {
    console.log('exec:', cmd, ...cmdArgs)
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, { shell: true })
    proc.stdout.pipe(process.stdout)
    proc.stderr.pipe(process.stderr)
    proc.on('error', (error) => {
      reject(new Error(`Error while executing ${release.spec}: ${error.message}`))
    })
    proc.on('exit', (code, signal) => {
      if (code > 0) {
        reject(new Error(`Exit code ${code} (signal ${signal}) while executing ${release.spec}`))
      } else {
        if (args.output === 'verbose') {
          console.log('exec completed:', cmd, ...cmdArgs)
        }
        resolve(release)
      }
    })
  })
}
