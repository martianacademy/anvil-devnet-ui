/**
 * Build-time edits to Blockscout's next.config.js.
 *
 * Both exist because this image builds with webpack rather than Turbopack, and
 * on a machine small enough to need that, two of Next's defaults do not hold.
 * Each edit fails loudly if its anchor moves upstream, so a config that no
 * longer takes the patch stops the build rather than quietly producing an image
 * that OOMs or 500s on half its pages.
 */
const fs = require('fs');
const path = require('path');

const CONFIG = 'next.config.js';
const PNPM_DIR = path.join('node_modules', '.pnpm');

/**
 * Packages Next's webpack tracer does not follow.
 *
 * `output: standalone` ships only what the tracer can see, and it cannot see
 * through @libp2p/config's dynamic imports. The result is a server that throws
 * ERR_MODULE_NOT_FOUND on any page reaching the wallet stack — /address among
 * them — long after the build looked successful. Turbopack's tracer does find
 * them, which is why upstream never hits this.
 *
 * Naming the packages one by one does not work: each one dragged in reveals the
 * next missing dependency underneath it. The whole reachable set goes in.
 */
const UNTRACED_ROOTS = [ '@libp2p+config' ];

/**
 * Every pnpm store directory reachable from `roots`.
 *
 * Walks the symlinks pnpm actually created rather than reading package.json:
 * dependency lists miss peer and optional entries, and a store directory name
 * carries peer suffixes ("@libp2p+interface@2.0.0_react@19.0.0") that make the
 * package name ambiguous to parse. The links are the resolution pnpm chose, so
 * following them cannot disagree with what Node will do at runtime.
 */
function dependencyClosure(rootPrefixes) {
  const dirs = fs.readdirSync(PNPM_DIR);
  const roots = dirs.filter((dir) => rootPrefixes.some((prefix) => dir.startsWith(`${ prefix }@`)));

  const found = new Set();
  const queue = [ ...roots ];

  while (queue.length > 0) {
    const dir = queue.pop();
    if (found.has(dir)) continue;
    found.add(dir);

    // Each dependency of this package is a symlink into another store directory.
    const linkRoot = path.join(PNPM_DIR, dir, 'node_modules');
    if (!fs.existsSync(linkRoot)) continue;

    for (const entry of fs.readdirSync(linkRoot)) {
      // Scoped packages nest one level deeper: node_modules/@scope/name
      const candidates = entry.startsWith('@') ?
        fs.readdirSync(path.join(linkRoot, entry)).map((sub) => path.join(entry, sub)) :
        [ entry ];

      for (const candidate of candidates) {
        const target = fs.realpathSync.native(path.join(linkRoot, candidate));
        const marker = `${ path.sep }.pnpm${ path.sep }`;
        const at = target.indexOf(marker);
        if (at === -1) continue;

        const linked = target.slice(at + marker.length).split(path.sep)[0];
        if (!found.has(linked)) queue.push(linked);
      }
    }
  }
  return [ ...found ].sort();
}

function patch(source, anchor, addition, what) {
  if (!source.includes(anchor)) {
    throw new Error(`next.config.js has no ${ what } — the build cannot apply its patches`);
  }
  return source.replace(anchor, anchor + addition);
}

let source = fs.readFileSync(CONFIG, 'utf8');

// Next fans page-data collection out to one worker per CPU, each free to take
// the whole heap. That is what exhausts an 8 GB Docker VM, after the bundle has
// already compiled. There is no environment variable for it.
source = patch(
  source,
  'experimental: {',
  '\n    cpus: Number(process.env.NEXT_BUILD_CPUS) || 2,',
  'experimental block to cap cpus in'
);

const closure = dependencyClosure(UNTRACED_ROOTS);
if (closure.length === 0) {
  throw new Error(`no packages found under ${ UNTRACED_ROOTS.join(', ') } — has the wallet stack changed?`);
}

// Written out rather than fed to outputFileTracingIncludes, because tracing
// copies files and pnpm resolution needs its symlink farm: the package can be
// present and still unreachable from the module that imports it. The build
// copies these directories wholesale afterwards, links intact.
fs.writeFileSync(process.env.UNTRACED_LIST ?? 'untraced-packages.txt', closure.join('\n'));

fs.writeFileSync(CONFIG, source);
console.log(`patched next.config.js: cpu cap; ${ closure.length } untraced packages listed`);
