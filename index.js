'use strict'

const npmFetch = require('npm-registry-fetch')
const semver = require('semver')
const { read: getNpmConfig } = require('libnpmconfig')

const SECOND = 1e3
const ANY_VERSION = '>=0'
const DEFAULTS = {
  version: ANY_VERSION,
  timeout: 0,
  grace: 10,
  delay: 2,
  npmConfig: getNpmConfig().toJSON(),
  logger: () => {},
}

function awaitRelease(packageString, {
  grace = DEFAULTS.grace,
  timeout = DEFAULTS.timeout,
  delay = DEFAULTS.delay,
  npmConfig = DEFAULTS.npmConfig,
  logger = DEFAULTS.logger,
} = {}) {
  if (!Number.isFinite(grace)) { grace = DEFAULTS.grace }
  if (!Number.isFinite(timeout)) { timeout = DEFAULTS.timeout }
  if (!Number.isFinite(delay)) { delay = DEFAULTS.delay }

  const releasedAfter = new Date(Date.now() - grace * SECOND)

  const packageParts = packageString.match(/^((@[^/@]+)?([^@]+))(?:@([^@]+))?$/)
  if (!packageParts) {
    return Promise.reject(new ReleaseMatchError(
      `Invalid package string: '${packageString}'`,
      { packageName: packageString, targetVersion: '?', releasedAfter }
    ))
  }
  const packageName = packageParts[1]
  const scope = packageParts[2]
  const targetVersion = packageParts[4] || ANY_VERSION

  logger(`Looking up package '${packageName}' using version '${targetVersion}'`)

  const params = {
    packageName,
    targetVersion,
    releasedAfter,
    npmConfig,
    logger
  }

  return Promise.race([
    pollUntilMatchingRelease(packageName, params),
    new Promise((resolve, reject) => {
      if (timeout > 0) {
        setTimeout(() => {
          reject(new ReleaseMatchError(`Timeout after ${timeout}s`), params)
        }, timeout * SECOND)
      }
    })
  ])
}

function pollUntilMatchingRelease(packageName, options = {}, retries = 0) {
  const delay = (options.delay || 1) * SECOND
  options.logger && options.logger(
    `Polling ${packageName}` +
    (retries ? ` (retries=${retries})` : '')
  )

  return lookupLatestMatchingRelease(packageName, options).catch(error => {
    if (!(error instanceof ReleaseMatchError)) {
      throw error
    }
    return new Promise(resolve => {
      setTimeout(
        () => resolve(pollUntilMatchingRelease(packageName, options, retries + 1)),
        delay
      )
    })
  })
}

function lookupLatestMatchingRelease(packageName, {
  targetVersion = ANY_VERSION,
  releasedAfter = new Date(),
  npmConfig = {},
}) {
  const metadata = { packageName, targetVersion, releasedAfter }
  const scopeParts = packageName.match(/^@[^/@]+/)
  const opts = {
    ...npmConfig,
    spec: packageName,
    preferOffline: false,
    preferOnline: true,
    /*
      Having `cache` enabled when target registry is `npm.pkg.github.com`
      causes `Response.json()` to never resolve for some reason.
    */
    cache: null,
  }
  return npmFetch.json(`/${encodeURIComponent(packageName)}`, opts).then(data => {
    if (!data.time || !Object.keys(data.time).length) {
      throw new ReleaseMatchError('No releases found', metadata)
    }

    const matching = Object.entries(data.time)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .find(([version, time]) => {
        return semver.satisfies(version, targetVersion) &&
          new Date(time) >= releasedAfter
      })

    if (matching) {
      // Return a shallow cloned object excluding underscore prefixed keys
      const versionObject = Object.assign({
        name: packageName,
        version: matching[0],
      }, data.versions[matching[0]])
      for (let key in versionObject) {
        if (Object.prototype.hasOwnProperty.call(versionObject, key) && key[0] === '_') {
          delete versionObject[key]
        }
      }
      versionObject.time = new Date(matching[1])
      return versionObject
    } else {
      throw new ReleaseMatchError('No matching releases found', metadata)
    }
  })
}

class ReleaseMatchError extends Error {
  constructor(message, metadata) {
    super(message + ` (${metadata.packageName}@${metadata.targetVersion})`)
    this.name = this.constructor.name
    Object.assign(this, metadata)
    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = {
  awaitRelease,
  DEFAULTS,
  ANY_VERSION,
  ReleaseMatchError,
}
