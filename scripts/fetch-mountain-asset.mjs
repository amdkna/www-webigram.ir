import { mkdir, writeFile } from 'node:fs/promises';

// Runtime must not depend on a third-party image host. During the static build
// we cache this CC0 photograph locally in /public, so the deployed site serves
// it from webigram.ir itself.
// Source: Wikimedia Commons, "Himalaya sunrise" by Ali Sabbagh (CC0 1.0)
// https://commons.wikimedia.org/wiki/File:Himalaya_sunrise.jpg
const source = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Himalaya_sunrise.jpg/1280px-Himalaya_sunrise.jpg';
const outputDir = new URL('../public/images/', import.meta.url);
const outputFile = new URL('../public/images/mountain-stage3.jpg', import.meta.url);

try {
  const response = await fetch(source, {
    headers: {
      'user-agent': 'Webigram static-site build (https://webigram.ir)'
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10_000) {
    throw new Error(`Downloaded image is unexpectedly small (${bytes.length} bytes)`);
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, bytes);
  console.log(`Mountain asset cached locally (${Math.round(bytes.length / 1024)} KiB).`);
} catch (error) {
  // The real composition also has a built-in mountain fallback, so a temporary
  // upstream outage must not make the whole production build fail.
  console.warn(`Could not cache mountain photograph: ${error.message}`);
  console.warn('Continuing with the built-in mountain fallback.');
}
