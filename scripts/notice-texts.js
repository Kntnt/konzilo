#!/usr/bin/env node
// Write src/cms/notice-texts.json: the license texts the editor's notices need and no installed
// package holds (ADR 0072). A package within another's own bundle, as Sveltia's holds Svelte,
// React and many more, is nowhere installed, and a few installed packages ship no text. Each
// text is taken once, from the package's tarball at the registry, checked against the integrity
// the registry gives, else from its repository at the commit or tag of its version, else, for a
// package that ships none anywhere, as the standard text of its license from SPDX's list, with a
// note that says so. Each is kept with where it came from, so that the build reads no network,
// and a text already kept is not fetched again. Run it after a raise that the build refuses.
//
//   notice-texts    write src/cms/notice-texts.json for what the editor's build bundles

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEditor } from './build-editor.js';
import { isLicenseFile, licenseOf } from './notices.js';
import { matchesIntegrity } from './wasm-reader.js';

const store = fileURLToPath(new URL('../src/cms/notice-texts.json', import.meta.url));
const REGISTRY = 'https://registry.npmjs.org';

// By code units, since a sort by the machine's language would differ between machines.
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const get = async (address) => {
  const answer = await fetch(address);
  return answer.ok ? answer : null;
};

// The license files at the root of a package's tarball, as the registry has it for this version.
async function fromTarball({ dist }) {
  const answer = await get(dist.tarball);
  if (!answer) throw new Error(`${dist.tarball}: no answer`);
  const bytes = Buffer.from(await answer.arrayBuffer());
  if (!matchesIntegrity(bytes, dist.integrity)) throw new Error(`${dist.tarball} does not match its integrity at the registry`);
  const scratch = mkdtempSync(join(tmpdir(), 'konzilo-notice-'));
  try {
    writeFileSync(join(scratch, 'package.tgz'), bytes);
    const run = spawnSync('tar', ['-xzf', 'package.tgz'], { cwd: scratch, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`tar: ${run.stderr}`);
    const top = readdirSync(scratch, { withFileTypes: true }).find((entry) => entry.isDirectory());
    const folder = join(scratch, top.name);
    const files = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && isLicenseFile(entry.name)).map((entry) => entry.name).sort(byText);
    return { source: dist.tarball, texts: files.map((file) => ({ file, text: readFileSync(join(folder, file), 'utf8') })) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// A license file in the package's repository on GitHub, at the commit it was published from, else
// at the tag of its version, in its own folder of a repository of several packages, else at the
// repository's root.
async function fromRepository({ name, version, repository, gitHead }) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  const found = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:#.*)?$/.exec(url ?? '') ?? /^(?:github:)?([^/:]+)\/([^/]+)$/.exec(url ?? '');
  if (!found) return null;
  const [, owner, repo] = found;
  const folders = [...new Set([repository?.directory, ''].filter((folder) => folder !== undefined))];
  const tags = [gitHead, `v${version}`, version, `${name}@${version}`, `${name.split('/').pop()}@${version}`].filter(Boolean);
  for (const tag of tags) {
    for (const folder of folders) {
      for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'license', 'LICENSE-MIT']) {
        const source = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(tag)}/${folder ? `${folder}/` : ''}${file}`;
        const answer = await get(source);
        if (answer) return { source, texts: [{ file, text: await answer.text() }] };
      }
    }
  }
  return null;
}

// A package that ships no license text anywhere, and names one license, gets that license's
// standard text from SPDX's list, at the release versions.env pins, with a note that says so and
// names the author its manifest gives, since such a text holds no copyright line of its own.
const SPDX_RELEASE = execFileSync('sh', [fileURLToPath(new URL('versions', import.meta.url)), 'SPDX_LICENSE_LIST'], { encoding: 'utf8' }).trim();
const SPDX = `https://raw.githubusercontent.com/spdx/license-list-data/${SPDX_RELEASE}/text`;

async function fromSpdx(license, { author }) {
  if (!/^[A-Za-z0-9.+-]+$/.test(license)) return null;
  const source = `${SPDX}/${license}.txt`;
  const answer = await get(source);
  if (!answer) return null;
  const by = typeof author === 'string' ? author : author?.name;
  return {
    source,
    note: `The package ships no license text, and its repository holds none: this is the standard text of the license its manifest names${by ? `, whose author it names as ${by.replace(/\s*<[^>]*>|\s*\([^)]*\)/g, '')}` : ''}.`,
    texts: [{ file: `${license}.txt`, text: await answer.text() }],
  };
}

async function take({ name, version }) {
  const answer = await get(`${REGISTRY}/${name.replace('/', '%2f')}/${version}`);
  if (!answer) throw new Error(`${name} ${version}: not at the registry`);
  const manifest = await answer.json();
  const license = licenseOf(manifest);
  if (license === null) throw new Error(`${name} ${version}: no license it can name`);
  const tarball = await fromTarball(manifest);
  const found = tarball.texts.length > 0 ? tarball : ((await fromRepository(manifest)) ?? (await fromSpdx(license, manifest)));
  if (!found) throw new Error(`${name} ${version}: no license text in its tarball, at its repository or in SPDX's list`);
  return { license, ...found };
}

if (import.meta.main) {
  const out = mkdtempSync(join(tmpdir(), 'konzilo-editor-'));
  let missing;
  try {
    await buildEditor(out, { kept: {}, onMissing: (found) => (missing = found) });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  const other = missing.filter(({ lacks }) => lacks !== 'text');
  if (other.length > 0) {
    console.error(`what no kept text puts right:\n${other.map((entry) => `  ${entry.name} ${entry.version ?? ''}: ${entry.lacks}`).join('\n')}`);
    process.exit(1);
  }
  const held = JSON.parse(readFileSync(store, 'utf8'));
  const kept = {};
  const failed = [];
  await Promise.all(
    missing.map(async (entry) => {
      const key = `${entry.name}@${entry.version}`;
      try {
        kept[key] = held[key] ?? (await take(entry));
      } catch (error) {
        failed.push(error.message);
      }
    }),
  );
  if (failed.length > 0) {
    console.error(failed.sort(byText).join('\n'));
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(kept).sort(([a], [b]) => byText(a, b)));
  writeFileSync(store, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`src/cms/notice-texts.json: ${Object.keys(sorted).length} packages`);
}
