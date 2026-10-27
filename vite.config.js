import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ビルド成果物の一覧とハッシュを埋め込んだ Service Worker を出力する。
// ファイルが変わるとキャッシュ名が変わり、古いファイルと新しいファイルが混在しない。
function swPlugin() {
  return {
    name: 'emit-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(template);
      for (const name of files.sort()) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const version = hash.digest('hex').slice(0, 12);
      const precache = ['./', 'index.html', ...files, 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
      const source = template
        .replaceAll('__CACHE_VERSION__', version)
        .replaceAll('__PRECACHE__', JSON.stringify([...new Set(precache)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [swPlugin()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.js'] },
});
