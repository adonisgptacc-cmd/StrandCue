/**
 * Catalogue seed compiler command line (thin wrapper).
 *
 * Reads a reviewed catalogue intake, compiles it with the pure
 * `scripts/catalogue-compiler.ts` core, and writes the snapshot JSON and seed
 * SQL to explicit caller-supplied paths. Existing files are never overwritten
 * with different content unless `--replace-draft` is passed.
 *
 * The wrapper never accepts publish, deploy, or database options: compiling
 * seeds is offline file work, and any such flag is rejected as an error.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { compileCatalogueIntake, renderSnapshotJson } from './catalogue-compiler.ts';

const USAGE =
  'usage: node scripts/compile-catalogue-intake.ts --input <intake.json> --snapshot <snapshot.json> --sql <seed.sql> [--replace-draft]';

const FORBIDDEN_PREFIXES = [
  '--publish',
  '--deploy',
  '--database',
  '--db',
  '--connection',
  '--supabase',
];

function isForbiddenFlag(flag: string): boolean {
  if (flag.includes('DATABASE_URL')) return true;
  return FORBIDDEN_PREFIXES.some(prefix => flag === prefix || flag.startsWith(`${prefix}-`) || flag.startsWith(`${prefix}=`));
}

interface ParsedArgs {
  readonly input: string;
  readonly snapshot: string;
  readonly sql: string;
  readonly replaceDraft: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  for (const arg of argv) {
    if (arg.startsWith('--') && isForbiddenFlag(arg.split('=')[0]!)) {
      throw new Error(
        `refusing ${arg}: the compiler writes files only and never publishes, deploys, or touches a database`,
      );
    }
  }
  let input: string | null = null;
  let snapshot: string | null = null;
  let sql: string | null = null;
  let replaceDraft = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      throw new HelpRequested();
    }
    if (arg === '--replace-draft') {
      replaceDraft = true;
      continue;
    }
    if (arg === '--input' || arg === '--snapshot' || arg === '--sql') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${USAGE}: ${arg} needs a file path`);
      }
      if (arg === '--input') input = value;
      else if (arg === '--snapshot') snapshot = value;
      else sql = value;
      index += 1;
      continue;
    }
    throw new Error(`${USAGE}: unknown option '${arg}'`);
  }
  if (input === null || snapshot === null || sql === null) throw new Error(USAGE);
  return { input, snapshot, sql, replaceDraft };
}

class HelpRequested extends Error {
  constructor() {
    super('--help');
  }
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Write one output file, refusing to overwrite different content without
 * `--replace-draft`. Returns false when the write was refused.
 */
async function writeOutput(path: string, content: string, replaceDraft: boolean): Promise<boolean> {
  const existing = await readExisting(path);
  if (existing !== null && existing !== content && !replaceDraft) {
    process.stderr.write(
      `CATALOGUE-COMPILE-HOLD ${path} already exists with different content; rerun with --replace-draft to overwrite it\n`,
    );
    return false;
  }
  if (existing === content) return true;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  return true;
}

/**
 * Compile an intake file into snapshot and SQL files. The exit code is
 * returned rather than assigned, so the caller owns that global and a test
 * can assert the non-zero path without setting it.
 */
export async function runCompileCatalogue(
  argv: readonly string[] = process.argv.slice(2),
  cwd: string = process.cwd(),
): Promise<number> {
  try {
    const args = parseArgs(argv);
    const inputPath = resolve(cwd, args.input);
    const snapshotPath = resolve(cwd, args.snapshot);
    const sqlPath = resolve(cwd, args.sql);
    let raw: string;
    try {
      raw = await readFile(inputPath, 'utf8');
    } catch {
      process.stderr.write(`CATALOGUE-COMPILE-HOLD ${args.input} is not readable\n`);
      return 1;
    }
    let document: unknown;
    try {
      document = JSON.parse(raw);
    } catch (error) {
      process.stderr.write(
        `CATALOGUE-COMPILE-HOLD ${args.input} is not readable JSON (${error instanceof Error ? error.message : 'unreadable'})\n`,
      );
      return 1;
    }
    let compiled: ReturnType<typeof compileCatalogueIntake>;
    try {
      compiled = compileCatalogueIntake(document);
    } catch (error) {
      process.stderr.write(
        `CATALOGUE-COMPILE-HOLD ${error instanceof Error ? error.message : 'invalid intake'}\n`,
      );
      return 1;
    }
    const snapshotJson = renderSnapshotJson(compiled.snapshot);
    if (!(await writeOutput(snapshotPath, snapshotJson, args.replaceDraft))) return 1;
    if (!(await writeOutput(sqlPath, compiled.sql, args.replaceDraft))) return 1;
    process.stdout.write(
      `CATALOGUE-COMPILE-PASS products=${compiled.snapshot.products.length} tools=${compiled.snapshot.tools.length} sources=${compiled.snapshot.product_sources.length + compiled.snapshot.tool_sources.length}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof HelpRequested) return 0;
    process.stderr.write(
      `CATALOGUE-COMPILE-HOLD ${error instanceof Error ? error.message : 'compile failed'}\n`,
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCompileCatalogue();
}
