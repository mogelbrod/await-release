#!/usr/bin/env node
'use strict'

const path = require('path')
const { program } = require('commander')
const {
  awaitRelease,
  DEFAULTS,
  ReleaseMatchError,
} = require('./index')
const packageJson = require(path.join(__dirname, 'package.json'))

const OUTPUT_STYLES = ['default', 'verbose', 'none', 'json']

const decimal = x => parseFloat(x)

const packages = []

program
  .version(packageJson.version)
  .option('-o, --output <format>',
    `output format (${OUTPUT_STYLES.join('/')})`)
  .option('-g, --grace <seconds>',
    'accept versions released up to X seconds earlier',
    decimal, DEFAULTS.grace)
  .option('-t, --timeout <seconds>',
    'exit if no release matches after X seconds',
    decimal, DEFAULTS.timeout)
  .option('-d, --delay <seconds>',
    'time between polling requests',
    decimal, DEFAULTS.delay)
  .arguments('<package> [package2@version...]')
  .action((pkg, additionalPackages) => {
    packages.push(pkg, ...additionalPackages)
  })
  .parse(process.argv)

const args = program.opts()
if (args.output === 'verbose') {
  args.logger = (message) => console.log(message)
}

if (!packages.length) {
  return program.help()
}

const promises = packages.map(p => awaitRelease(p, args))
Promise.all(promises).then(packages => {
  switch (args.output) {
    case 'json':
      console.log(JSON.stringify(packages, null, 2))
      break
    default:
      console.log(packages.map(p => {
        return `- ${p.name}@${p.version} (released ${p.time.toLocaleString()})`
      }).join('\n'))
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
