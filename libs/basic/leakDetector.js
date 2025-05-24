// leakDetector.js
const inspector = require('node:inspector');
const fs        = require('node:fs');
const path      = require('node:path');

function takeHeapSnapshot(dir = '.', label = '') {
  const session = new inspector.Session();
  const ts   = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `heap-${label || ts}.heapsnapshot`);
  const fd   = fs.openSync(file, 'w');

  session.connect();
  session.on('HeapProfiler.addHeapSnapshotChunk',
             m => fs.writeSync(fd, m.params.chunk));
  session.post('HeapProfiler.takeHeapSnapshot', null, (err) => {
    session.disconnect();
    fs.closeSync(fd);
    console.log(`[leak-detector] heap snapshot written to ${file}`);
    if (err) console.error(err);
  });
}

function start({
  sampleInterval   = 30_000,   // how often to check (ms)
  absGrowthLimit   = 20 * 1024 * 1024, // 20 MiB
  consecutiveHits  = 3,        // how many times in a row before we cry “leak”
  snapshotDir      = '.',
} = {}) {
  if (typeof global.gc !== 'function') {
    console.warn('[leak-detector] Start Node with "--expose-gc" to get accurate data');
  }

  let baseline = process.memoryUsage().heapUsed;
  let hits     = 0;

  setInterval(() => {
    global.gc?.();                       // remove anything collectible
    const { heapUsed } = process.memoryUsage();
    const growth = heapUsed - baseline;

    if (growth > absGrowthLimit) {
      hits += 1;
      console.warn(`[leak-detector] heap grew by ${(growth/1e6).toFixed(1)} MiB (${hits}/${consecutiveHits})`);
      if (hits >= consecutiveHits) {
        console.warn('[leak-detector] possible leak – taking heap snapshot…');
        takeHeapSnapshot(snapshotDir);
        hits = 0;                        // reset so we don’t spam snapshots
        baseline = heapUsed;             // start tracking from the new level
      }
    } else {
      hits = 0;                          // growth subsided ➜ back to normal
    }
  }, sampleInterval);
}

module.exports = { start, takeHeapSnapshot };
