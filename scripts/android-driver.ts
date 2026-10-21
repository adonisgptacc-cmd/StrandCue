import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A small adb + uiautomator driver for the Android acceptance journeys. It reads the accessibility tree the screen
 * reader would (content descriptions and text), so a step can only succeed on something a person could find. It
 * is not a screen reader: TalkBack evidence is recorded separately.
 *
 *   node scripts/android-driver.ts dump                      list what is on screen
 *   node scripts/android-driver.ts tap "<label>"             tap an element by exact label or text
 *   node scripts/android-driver.ts type "<label>" "<text>"   tap a field and type into it
 *   node scripts/android-driver.ts has "<fragment>"          exit 0 when a label or text contains it
 *   node scripts/android-driver.ts wait "<fragment>" [secs]  wait for it
 *   node scripts/android-driver.ts scrollto "<fragment>"     scroll down until it is on screen
 *
 * Evidence (screenshots, raw dumps) goes to STRANDCUE_EVIDENCE_DIR, outside the repository. Nothing here prints a
 * credential: `type` is given the text by the caller and echoes only its length.
 */
export interface UiNode { readonly label: string; readonly text: string; readonly className: string; readonly clickable: boolean; readonly enabled: boolean;
  readonly checked: boolean; readonly focused: boolean; readonly bounds: readonly [number, number, number, number] }

const SDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? `${process.env.LOCALAPPDATA ?? ''}/Android/Sdk`;
export const ADB = `${SDK}/platform-tools/adb.exe`;
export const PACKAGE = 'za.co.strandcue.app';

const decode = (value: string): string => value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');

export function parseUiXml(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attributes = match[1];
    const attribute = (name: string): string => decode(new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? '');
    const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(attribute('bounds'));
    if (!bounds) continue;
    nodes.push({
      label: attribute('content-desc'), text: attribute('text'), className: attribute('class'), clickable: attribute('clickable') === 'true',
      enabled: attribute('enabled') === 'true', checked: attribute('checked') === 'true', focused: attribute('focused') === 'true',
      bounds: [Number(bounds[1]), Number(bounds[2]), Number(bounds[3]), Number(bounds[4])],
    });
  }
  return nodes;
}

const adb = (args: string[], input?: string): string => execFileSync(ADB, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });

export function dump(): UiNode[] {
  adb(['shell', 'uiautomator', 'dump', '--compressed', '/sdcard/ui.xml']);
  return parseUiXml(adb(['shell', 'cat', '/sdcard/ui.xml']));
}

const named = (node: UiNode): string => node.label || node.text;
const centre = (node: UiNode): [number, number] => [Math.round((node.bounds[0] + node.bounds[2]) / 2), Math.round((node.bounds[1] + node.bounds[3]) / 2)];

export function findExact(nodes: readonly UiNode[], name: string): UiNode | undefined {
  const matches = nodes.filter(node => named(node) === name || node.text === name || node.label === name);
  return matches.find(node => node.clickable) ?? matches[0];
}

export const findContaining = (nodes: readonly UiNode[], fragment: string): UiNode | undefined =>
  nodes.find(node => node.label.includes(fragment) || node.text.includes(fragment));

export function tapNode(node: UiNode): void {
  const [x, y] = centre(node);
  adb(['shell', 'input', 'tap', String(x), String(y)]);
}

/** `adb shell input text` needs spaces as %s and refuses some characters; the synthetic values used here avoid those. */
export function typeText(text: string): void {
  if (/[^A-Za-z0-9 ._@:-]/.test(text)) throw new Error('UNSUPPORTED_CHARACTER');
  adb(['shell', 'input', 'text', text.replace(/ /g, '%s')]);
}

export function clearField(length: number): void {
  adb(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END']);
  for (let remaining = length; remaining > 0; remaining -= 20) adb(['shell', 'input', 'keyevent', ...Array.from({ length: Math.min(20, remaining) }, () => 'KEYCODE_DEL')]);
}

export function screenshot(path: string): void {
  const result = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('SCREENSHOT_FAILED');
  writeFileSync(path, result.stdout);
}

export const scroll = (direction: 'down' | 'up' = 'down'): void => {
  const [from, to] = direction === 'down' ? [1700, 600] : [600, 1700];
  adb(['shell', 'input', 'swipe', '540', String(from), '540', String(to), '350']);
};

const sleep = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms));

export async function waitFor(fragment: string, seconds = 15): Promise<UiNode | undefined> {
  for (let waited = 0; waited <= seconds; waited++) {
    const found = findContaining(dump(), fragment);
    if (found) return found;
    await sleep(1000);
  }
  return undefined;
}

function evidenceDir(): string {
  const dir = process.env.STRANDCUE_EVIDENCE_DIR;
  if (!dir) throw new Error('STRANDCUE_EVIDENCE_DIR_REQUIRED');
  mkdirSync(dir, { recursive: true });
  return resolve(dir);
}

function describeNode(node: UiNode, index: number): string {
  const flags = [node.clickable ? 'click' : '', node.enabled ? '' : 'disabled', node.checked ? 'checked' : '', node.focused ? 'focused' : ''].filter(Boolean).join(',');
  const size = `${node.bounds[2] - node.bounds[0]}x${node.bounds[3] - node.bounds[1]}`;
  return `${String(index).padStart(3)} [${node.className.split('.').at(-1)}] ${JSON.stringify(named(node))}${node.label && node.text && node.label !== node.text ? ` text=${JSON.stringify(node.text)}` : ''} ${size}${flags ? ` (${flags})` : ''}`;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, first, second] = argv;
  switch (command) {
    case 'dump': {
      const nodes = dump().filter(node => named(node) !== '');
      process.stdout.write(`${nodes.map(describeNode).join('\n')}\n`);
      return 0;
    }
    case 'tap': {
      const node = findExact(dump(), first ?? '');
      if (!node) { process.stdout.write(`NOT-FOUND ${JSON.stringify(first)}\n`); return 1; }
      tapNode(node);
      return 0;
    }
    case 'type': {
      const nodes = dump();
      const node = findExact(nodes, first ?? '');
      if (!node) { process.stdout.write(`NOT-FOUND ${JSON.stringify(first)}\n`); return 1; }
      tapNode(node);
      await sleep(400);
      clearField(node.text.length + 2);
      typeText(second ?? '');
      process.stdout.write(`TYPED length=${(second ?? '').length}\n`);
      return 0;
    }
    case 'has': return findContaining(dump(), first ?? '') ? 0 : 1;
    case 'wait': return (await waitFor(first ?? '', Number(second ?? 15))) ? 0 : 1;
    case 'scrollto': {
      for (let attempt = 0; attempt < 12; attempt++) {
        const found = findContaining(dump(), first ?? '');
        if (found) { process.stdout.write('FOUND\n'); return 0; }
        scroll('down');
        await sleep(500);
      }
      process.stdout.write('NOT-FOUND\n');
      return 1;
    }
    case 'scroll': scroll(first === 'up' ? 'up' : 'down'); return 0;
    case 'shot': screenshot(join(evidenceDir(), `${first ?? 'screen'}.png`)); return 0;
    case 'rawdump': writeFileSync(join(evidenceDir(), `${first ?? 'ui'}.xml`), adb(['shell', 'cat', '/sdcard/ui.xml'])); return 0;
    case 'key': adb(['shell', 'input', 'keyevent', first ?? 'KEYCODE_BACK']); return 0;
    case 'net': {
      const on = first === 'on';
      adb(['shell', 'svc', 'wifi', on ? 'enable' : 'disable']);
      adb(['shell', 'svc', 'data', on ? 'enable' : 'disable']);
      return 0;
    }
    case 'stop': adb(['shell', 'am', 'force-stop', PACKAGE]); return 0;
    case 'launch': adb(['shell', 'monkey', '-p', PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1']); return 0;
    case 'logcat': {
      const log = adb(['logcat', '-d', '-v', 'time']);
      const lines = log.split(/\r?\n/).filter(line => /FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ANR in|cleartext|Cleartext/i.test(line)).slice(-200);
      writeFileSync(join(evidenceDir(), `${first ?? 'logcat'}.txt`), `${lines.join('\n')}\n`);
      process.stdout.write(`LOGCAT lines=${lines.length}\n`);
      return 0;
    }
    default:
      process.stdout.write('USAGE dump|tap|type|has|wait|scroll|scrollto|shot|rawdump|key|net|stop|launch|logcat\n');
      return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
