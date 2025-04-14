const Tracker = require('./simpleTracker.js');

class LineCrossCounter {
    constructor(imageWidth, imageHeight, lines = [], tags = ['person']) {
        this.imageWidth = imageWidth;
        this.imageHeight = imageHeight;

        // Line configuration (default: two horizontal lines)
        this.lines = lines.length >= 2 ? lines : [
            { start: { x: 0, y: 194 }, end: { x: imageWidth, y: 194 } },
            { start: { x: 0, y: 220 }, end: { x: imageWidth, y: 220 } }
        ];

        this.tags = Array.isArray(tags) ? tags : [tags];
        this.offset = 6;
        this.tracker = new Tracker();

        // Tracking state
        this.resetCounters();
        this.frameCount = 0;
        this.startTime = new Date();
        this.lastFrameTime = null;
        this.autoResetEnabled = false;
        this.resetHour = 0; // Midnight (12:00 AM)
        this.resetMinute = 0;
        this.lastResetCheck = null;
        
        this.calculateLineEquations();
    }

    enableDailyReset(hour = 0, minute = 0) {
        this.autoResetEnabled = true;
        this.resetHour = hour;
        this.resetMinute = minute;
        this.lastResetCheck = new Date();
        return `Daily reset enabled at ${hour}:${minute.toString().padStart(2, '0')}`;
    }

    disableDailyReset() {
        this.autoResetEnabled = false;
        return "Daily reset disabled";
    }

    checkForDailyReset() {
        if (!this.autoResetEnabled) return false;

        const now = new Date();
        this.lastResetCheck = now;

        // Check if we've crossed the reset time
        if (now.getHours() === this.resetHour &&
            now.getMinutes() === this.resetMinute) {

            // Don't reset multiple times in the same minute
            const lastReset = this.lastDailyReset || new Date(0);
            if (now.getTime() - lastReset.getTime() > 60000) {
                this.resetCounters();
                this.lastDailyReset = now;
                return true;
            }
        }
        return false;
    }

    resetCounters() {
        this.counts = {
            total: { down: 0, up: 0 },
            byTag: this.createEmptyTagCounts()
        };
        this.currentNearLine1 = new Set(); // Format: `${id}:${tag}`
        this.currentNearLine2 = new Set();
    }

    createEmptyTagCounts() {
        return this.tags.reduce((acc, tag) => {
            acc[tag] = { down: 0, up: 0 };
            return acc;
        }, {});
    }

    calculateLineEquations() {
        this.lineEqs = this.lines.map(line => {
            const { start, end } = line;
            const A = end.y - start.y;
            const B = start.x - end.x;
            const C = (end.x * start.y) - (start.x * end.y);

            return {
                A, B, C,
                minX: Math.min(start.x, end.x),
                maxX: Math.max(start.x, end.x),
                minY: Math.min(start.y, end.y),
                maxY: Math.max(start.y, end.y)
            };
        });
    }

    isPointNearLine(x, y, lineIndex) {
        const line = this.lineEqs[lineIndex];
        if (x < line.minX - this.offset || x > line.maxX + this.offset ||
            y < line.minY - this.offset || y > line.maxY + this.offset) {
            return false;
        }
        const distance = Math.abs(line.A * x + line.B * y + line.C) /
                       Math.sqrt(line.A * line.A + line.B * line.B);
        return distance <= this.offset;
    }

    processDetections(detections) {
        this.checkForDailyReset();
        this.lastFrameTime = new Date();
        this.frameCount++;

        if (this.frameCount % 3 !== 0) {
            return {
                frameResult: this.getCounts(),
                changedCount: {
                    total: { down: 0, up: 0 },
                    byTag: {} // Empty when no changes
                }
            };
        }

        const filtered = detections.filter(d => d.tag && this.tags.includes(d.tag));
        const rects = filtered.map(d => [d.x, d.y, d.width, d.height]);
        const bboxId = this.tracker.update(rects);

        const newNearLine1 = new Set();
        const newNearLine2 = new Set();
        const changedCount = {
            total: { down: 0, up: 0 },
            byTag: this.createEmptyTagCounts()
        };

        // Process each detection
        bboxId.forEach(([x, y, w, h, id], index) => {
            const detection = filtered[index];
            const cx = Math.floor(x + w / 2);
            const cy = Math.floor(y + h / 2);
            const idTag = `${id}:${detection.tag}`;

            // Check line proximity
            const nearLine1 = this.isPointNearLine(cx, cy, 0);
            const nearLine2 = this.isPointNearLine(cx, cy, 1);

            if (nearLine1) newNearLine1.add(idTag);
            if (nearLine2) newNearLine2.add(idTag);

            // Count crossings
            if (nearLine2 && this.currentNearLine1.has(idTag)) {
                this.counts.total.down++;
                this.counts.byTag[detection.tag].down++;
                changedCount.total.down++;
                changedCount.byTag[detection.tag].down++;
            }
            if (nearLine1 && this.currentNearLine2.has(idTag)) {
                this.counts.total.up++;
                this.counts.byTag[detection.tag].up++;
                changedCount.total.up++;
                changedCount.byTag[detection.tag].up++;
            }
        });

        this.currentNearLine1 = newNearLine1;
        this.currentNearLine2 = newNearLine2;

        const filteredChangedTags = Object.fromEntries(
            Object.entries(changedCount.byTag).filter(
                ([_, counts]) => counts.down !== 0 || counts.up !== 0
            )
        );

        return {
            frameResult: this.getCounts(),
            changedCount: {
                total: changedCount.total,
                byTag: filteredChangedTags
            }
        };
    }

    getCounts() {
        return {
            total: this.counts.total,
            byTag: this.counts.byTag,
            lines: this.lines,
            frameCount: this.frameCount,
            activeTags: this.tags,
            timestamps: {
                start: this.startTime.toISOString(),
                lastFrame: this.lastFrameTime?.toISOString() || null
            }
        };
    }

    updateLines(newLines) {
        if (newLines.length >= 2) {
            this.lines = newLines;
            this.calculateLineEquations();
            return true;
        }
        return false;
    }

    updateTags(newTags) {
        this.tags = Array.isArray(newTags) ? newTags : [newTags];
        // Initialize counts for new tags
        this.tags.forEach(tag => {
            if (!this.counts.byTag[tag]) {
                this.counts.byTag[tag] = { down: 0, up: 0 };
            }
        });
        // Remove old tags
        Object.keys(this.counts.byTag).forEach(tag => {
            if (!this.tags.includes(tag)) {
                delete this.counts.byTag[tag];
            }
        });
    }
}

module.exports = LineCrossCounter;
