#!/usr/bin/env node
/**
 * Typecheck gate (DEV-396).
 *
 * Runs `vue-tsc --noEmit --pretty false` and compares every diagnostic against
 * `typecheck-baseline.json`. Entries are keyed by file + TS code + message with
 * a count per key; line numbers are never part of a key, so ordinary edits do
 * not churn the baseline. The list can only get shorter: when a fix removes
 * errors, the run fails until the entry is reduced or removed.
 *
 * Also guards the `paths` table in the root `tsconfig.json`: that table
 * replaces the one generated in `.wxt/tsconfig.json`, so every generated alias
 * must be restated (with paths rewritten relative to the root). A generated
 * alias that is missing or retargeted fails the run loudly instead of silently
 * breaking `@/` imports.
 *
 * Usage:
 *   npm run typecheck                     (the real gate)
 *   node scripts/typecheck.mjs --self-test-unparseable
 *     feeds the verifier a fixture that exits non-zero with a foreign format
 *     and asserts the gate refuses to pass on it
 *   node scripts/typecheck.mjs --self-test-incomplete
 *     feeds the verifier a run that was killed after reporting only allowlisted
 *     errors, and asserts the gate refuses to pass on it
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const baselinePath = path.join(root, 'typecheck-baseline.json')
const rootTsconfigPath = path.join(root, 'tsconfig.json')
const generatedTsconfigPath = path.join(root, '.wxt', 'tsconfig.json')
const vueTscBin = path.join(root, 'node_modules', '.bin', 'vue-tsc')

/** A diagnostic line from `vue-tsc --pretty false`, e.g.
 * `entrypoints/x.ts(12,3): error TS2532: Object is possibly 'undefined'.` */
const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
/** vue-tsc's own total, e.g. `Found 12 errors in 3 files.` */
const SUMMARY = /Found (\d+) error/
/** A crash rather than a diagnostic: V8's fatal banners, or a frame inside Node itself. */
const CRASH = /FATAL ERROR:|heap out of memory|^\s+at\s.*node:internal\//

function fail(messages) {
  for (const message of messages) {
    console.error(message)
  }
  console.error(
    `typecheck: FAILED (${messages.length} problem${messages.length === 1 ? '' : 's'})`,
  )
  process.exit(1)
}

/** Parse raw `vue-tsc --pretty false` output into diagnostic records. */
function parseDiagnostics(output) {
  const diagnostics = []
  for (const line of output.split('\n')) {
    const match = DIAGNOSTIC.exec(line)
    if (match) {
      const [, file, lineNum, , code, message] = match
      diagnostics.push({
        file: file.trim(),
        line: Number(lineNum),
        code,
        message: message.trimEnd(),
      })
    }
  }
  return diagnostics
}

const keyOf = (file, code, message) => `${file}|${code}|${message}`

/**
 * The single verifier for one vue-tsc run. Shared by the real gate and the
 * self-tests so the refusal logic cannot drift apart. Returns an array of
 * failure messages (empty means pass). `killedBy` is the signal that ended the
 * process, or null when it exited on its own.
 */
function verify(diagnostics, exitCode, rawOutput, allowlist, killedBy = null) {
  const failures = []
  const parsedCounts = new Map()
  const examples = new Map()
  for (const d of diagnostics) {
    const key = keyOf(d.file, d.code, d.message)
    parsedCounts.set(key, (parsedCounts.get(key) ?? 0) + 1)
    if (!examples.has(key)) examples.set(key, [])
    examples.get(key).push(d)
  }
  const lastLines = rawOutput.trimEnd().split('\n').slice(-5).join('\n')

  // A run that did not finish must never pass (the gate must be able to
  // fail). A killed run can have printed every allowlisted error before it
  // died and never reached the file that holds a new one.
  if (killedBy) {
    failures.push(
      `vue-tsc was killed by ${killedBy} before it finished; refusing to pass on an incomplete run. Last lines:\n${lastLines}`,
    )
  }
  const crash = rawOutput.split('\n').find(line => CRASH.test(line))
  if (crash) {
    failures.push(
      `vue-tsc did not finish cleanly; refusing to pass on a run that ended in a crash: ${crash.trim()}`,
    )
  }

  // A run whose output we could not read must never pass (the gate must be
  // able to fail).
  const summaryMatch = SUMMARY.exec(rawOutput)
  const summaryCount = summaryMatch ? Number(summaryMatch[1]) : null
  if (exitCode !== 0 && diagnostics.length === 0) {
    failures.push(
      `vue-tsc exited ${exitCode} but no diagnostic could be parsed; refusing to pass on unreadable output. Last lines:\n${lastLines}`,
    )
  }
  if (exitCode === 0 && diagnostics.length > 0) {
    failures.push(
      `vue-tsc exited 0 but ${diagnostics.length} diagnostics were parsed; inconsistent run, refusing to pass.`,
    )
  }
  if (summaryCount !== null && summaryCount !== diagnostics.length) {
    failures.push(
      `vue-tsc reports "Found ${summaryCount} errors" but ${diagnostics.length} diagnostics were parsed; refusing to pass on a partial read.`,
    )
  }

  const byKey = new Map(allowlist.map(e => [keyOf(e.file, e.code, e.message), e]))
  const seen = new Set()

  for (const [key, count] of parsedCounts) {
    seen.add(key)
    const entry = byKey.get(key)
    if (!entry) {
      for (const d of examples.get(key)) {
        failures.push(
          `unknown error (not allowlisted): ${d.file}:${d.line}: ${d.code} ${d.message}`,
        )
      }
    } else if (count > entry.count) {
      const extra = count - entry.count
      for (const d of examples.get(key).slice(-extra)) {
        failures.push(
          `exceeds allowlist (allowlisted ${entry.count}, found ${count}): ${d.file}:${d.line}: ${d.code} ${d.message}`,
        )
      }
    }
  }

  for (const entry of allowlist) {
    const key = keyOf(entry.file, entry.code, entry.message)
    const count = parsedCounts.get(key) ?? 0
    if (count < entry.count) {
      failures.push(
        `stale allowlist entry: ${entry.file} ${entry.code} "${entry.message}" is allowlisted ${entry.count} time${entry.count === 1 ? '' : 's'} but found ${count}. The fix landed: remove this entry or reduce its count, then rerun. Reason on record: ${entry.reason}`,
      )
    }
  }

  return failures
}

/** Validate the baseline file: shape, counts, unique keys, and a reason on every entry. */
function loadAllowlist() {
  const raw = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const allowlist = raw.allowlist
  if (!Array.isArray(allowlist)) {
    fail(['typecheck-baseline.json must contain an "allowlist" array.'])
  }
  const seen = new Set()
  for (const entry of allowlist) {
    for (const field of ['file', 'code', 'message']) {
      if (typeof entry[field] !== 'string' || entry[field].length === 0) {
        fail([`allowlist entry is missing "${field}": ${JSON.stringify(entry)}`])
      }
    }
    if (!Number.isInteger(entry.count) || entry.count < 1) {
      fail([`allowlist entry needs an integer "count" >= 1: ${JSON.stringify(entry)}`])
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      fail([
        `allowlist entry for ${entry.file} ${entry.code} has no "reason"; an error is never exempt without one.`,
      ])
    }
    const key = keyOf(entry.file, entry.code, entry.message)
    if (seen.has(key)) {
      fail([`duplicate allowlist entries for ${key}; merge them into one count.`])
    }
    seen.add(key)
  }
  return allowlist
}

/** Rewrite relative `paths` values as absolute, relative to the config's own directory. */
function normalizedPaths(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const paths = config.compilerOptions?.paths ?? {}
  const dir = path.dirname(configPath)
  const normalized = {}
  for (const [key, values] of Object.entries(paths)) {
    normalized[key] = values.map(value => path.resolve(dir, value))
  }
  return normalized
}

/** Every alias the generated config defines must be restated identically in the root config. */
function checkAliasTable() {
  const failures = []
  if (!existsSync(generatedTsconfigPath)) {
    failures.push(
      `${generatedTsconfigPath} not found; run \`wxt prepare\` (npm ci does this) before typechecking.`,
    )
    return failures
  }
  const generated = normalizedPaths(generatedTsconfigPath)
  const rootPaths = normalizedPaths(rootTsconfigPath)
  for (const [key, values] of Object.entries(generated)) {
    const restated = rootPaths[key]
    if (!restated) {
      failures.push(
        `tsconfig.json paths are missing the generated alias "${key}"; the root table replaces the generated one, so it must restate every alias.`,
      )
    } else if (JSON.stringify(restated) !== JSON.stringify(values)) {
      failures.push(
        `tsconfig.json alias "${key}" no longer matches the generated table: root points at ${JSON.stringify(restated)}, .wxt/tsconfig.json points at ${JSON.stringify(values)}. Update the restated table.`,
      )
    }
  }
  return failures
}

const selfTestUnparseable = process.argv.includes('--self-test-unparseable')
const selfTestIncomplete = process.argv.includes('--self-test-incomplete')

const aliasFailures = checkAliasTable()
if (aliasFailures.length > 0) {
  fail(aliasFailures)
}

if (selfTestUnparseable) {
  // A foreign tool that exits non-zero with output our parser cannot read.
  const fixture = 'EACCES: permission denied, open "/etc/shadow"\n    at readShadows\n'
  const refusals = verify(parseDiagnostics(fixture), 1, fixture, [])
  if (refusals.length === 0) {
    fail(['self-test failed: unparseable output was NOT refused; the gate could be silently bypassed.'])
  }
  console.log('self-test passed: unparseable output was refused:')
  for (const refusal of refusals) {
    console.log(`  ${refusal.split('\n')[0]}`)
  }
  process.exit(0)
}

if (selfTestIncomplete) {
  // A run that printed exactly the allowlisted errors and was then killed
  // before it could reach any other file. Every comparison against the
  // allowlist passes, so only the killed-run refusal stands in the way.
  const allowlist = loadAllowlist()
  const diagnostics = allowlist.flatMap(entry =>
    Array.from({ length: entry.count }, () => ({
      file: entry.file,
      line: 1,
      code: entry.code,
      message: entry.message,
    })),
  )
  const output = diagnostics.map(d => `${d.file}(1,1): error ${d.code}: ${d.message}`).join('\n')
  const refusals = verify(diagnostics, null, output, allowlist, 'SIGKILL')
  if (refusals.length === 0) {
    fail(['self-test failed: a killed run was NOT refused; the gate could vouch for a run that never finished.'])
  }
  console.log('self-test passed: a killed run was refused:')
  for (const refusal of refusals) {
    console.log(`  ${refusal.split('\n')[0]}`)
  }
  process.exit(0)
}

const allowlist = loadAllowlist()
const run = spawnSync(vueTscBin, ['--noEmit', '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
})
const output = (run.stdout ?? '') + (run.stderr ?? '')
const exitCode = run.status ?? -1
const killedBy = run.signal ?? null
const diagnostics = parseDiagnostics(output)

const failures = verify(diagnostics, exitCode, output, allowlist, killedBy)
if (failures.length > 0) {
  fail(failures)
}

const allowlistedCount = diagnostics.length
const files = new Set(diagnostics.map(d => d.file)).size
console.log(
  `typecheck: OK, ${allowlistedCount} error${allowlistedCount === 1 ? '' : 's'} allowlisted across ${files} file${files === 1 ? '' : 's'}; the list may only get shorter.`,
)
