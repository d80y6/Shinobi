/**
 * Bundle mediasoup-client for browser usage
 * Run: node tools/bundleMediasoupClient.js
 */
const esbuild = require('esbuild');
const path = require('path');

const outFile = path.join(__dirname, '../web/assets/vendor/js/mediasoup-client.bundle.js');

esbuild.build({
    entryPoints: [path.join(__dirname, 'mediasoup-client-entry.js')],
    bundle: true,
    outfile: outFile,
    format: 'iife',
    globalName: 'mediasoupClient',
    platform: 'browser',
    target: ['chrome80', 'firefox78', 'safari13', 'edge80'],
    minify: true,
    sourcemap: false,
}).then(() => {
    console.log(`Successfully bundled mediasoup-client to: ${outFile}`);
}).catch((err) => {
    console.error('Bundle failed:', err);
    process.exit(1);
});
