//
// Shinobi - WebRTC Streaming Module
// Copyright (C) 2020 Moe Alam, moeiscool
//
// WebRTC streaming using mediasoup SFU for ultra-low latency viewing
//
const os = require('os');

module.exports = async (s, config, lang, app, io) => {
    // Default WebRTC configuration
    if (!config.webrtc) config.webrtc = {};
    if (config.webrtc.enabled === undefined) config.webrtc.enabled = false;
    if (!config.webrtc.listenIp) config.webrtc.listenIp = '0.0.0.0';
    if (!config.webrtc.announcedIp) config.webrtc.announcedIp = null;
    if (!config.webrtc.rtcMinPort) config.webrtc.rtcMinPort = 40000;
    if (!config.webrtc.rtcMaxPort) config.webrtc.rtcMaxPort = 49999;
    if (!config.webrtc.rtpPortBase) config.webrtc.rtpPortBase = 50000;
    if (!config.webrtc.logLevel) config.webrtc.logLevel = 'warn';

    // Check if WebRTC is enabled
    if (!config.webrtc.enabled) {
        s.debugLog('WebRTC', 'WebRTC streaming is disabled in configuration');
        return;
    }

    // Try to load mediasoup
    let mediasoup;
    try {
        mediasoup = require('mediasoup');
    } catch (err) {
        s.systemLog('WebRTC: mediasoup not installed. Run: npm install mediasoup');
        s.debugLog('WebRTC', 'mediasoup load error:', err.message);
        return;
    }

    // Media codecs supported by the router
    const mediaCodecs = [
        {
            kind: 'video',
            mimeType: 'video/H264',
            clockRate: 90000,
            parameters: {
                'packetization-mode': 1,
                'profile-level-id': '42e01f',
                'level-asymmetry-allowed': 1
            }
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000
        },
        {
            kind: 'video',
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters: {
                'profile-id': 0  // Profile 0 is most compatible
            }
        },
        {
            kind: 'video',
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters: {
                'profile-id': 2
            }
        },
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
        }
    ];

    // Initialize WebRTC state storage
    s.webrtc = {
        workers: [],
        routers: new Map(),           // groupKey -> router
        producers: new Map(),         // `${groupKey}_${monitorId}` -> { producer, transport }
        transports: new Map(),        // transportId -> transport
        consumers: new Map(),         // consumerId -> consumer
        rtpPorts: new Map(),          // `${groupKey}_${monitorId}` -> rtpPort
        bweState: new Map(),          // consumerId -> { bandwidth, loss, score, lastDowngrade, lastUpgrade }
        bweIntervals: new Map(),      // consumerId -> intervalId (for cleanup)
        nextWorkerIdx: 0,
        nextRtpPortIndex: 0,          // Counter for port allocation (prevents collision on restart)
        webrtcServers: new Map(),     // workerPid -> webRtcServer (for port sharing)
        mediaCodecs: mediaCodecs
    };

    // Create mediasoup workers (one per CPU core for optimal performance)
    const numWorkers = Math.min(os.cpus().length, config.webrtc.maxWorkers || os.cpus().length);
    s.debugLog('WebRTC', `Creating ${numWorkers} mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
        try {
            const worker = await mediasoup.createWorker({
                logLevel: config.webrtc.logLevel,
                logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
                rtcMinPort: config.webrtc.rtcMinPort,
                rtcMaxPort: config.webrtc.rtcMaxPort
            });

            // Create WebRtcServer for this worker (enables port sharing across transports)
            try {
                const tcpPort = (config.webrtc.rtcMinPort || 40000) + i;
                const listenInfos = [{
                    protocol: 'tcp',
                    ip: config.webrtc.listenIp || '0.0.0.0',
                    announcedAddress: config.webrtc.announcedIp || undefined,
                    port: tcpPort
                }];

                // Optional UDP support (doubles port requirement)
                if (config.webrtc.enableUdp === true) {
                    listenInfos.push({
                        protocol: 'udp',
                        ip: config.webrtc.listenIp || '0.0.0.0',
                        announcedAddress: config.webrtc.announcedIp || undefined,
                        port: tcpPort + numWorkers
                    });
                }

                const webRtcServer = await worker.createWebRtcServer({ listenInfos });
                s.webrtc.webrtcServers.set(worker.pid, webRtcServer);
                s.debugLog('WebRTC', `Worker ${worker.pid}: WebRtcServer on port ${tcpPort}`);
            } catch (err) {
                s.systemLog(`WebRTC: Failed to create WebRtcServer for worker ${i}: ${err.message}`);
            }

            worker.on('died', (error) => {
                s.systemLog(`WebRTC: Worker ${worker.pid} died! Error: ${error?.message || 'unknown'}`);

                // Cleanup WebRtcServer for dead worker
                const deadPid = worker.pid;
                const webRtcServer = s.webrtc.webrtcServers.get(deadPid);
                if (webRtcServer) {
                    try { webRtcServer.close(); } catch (e) {}
                    s.webrtc.webrtcServers.delete(deadPid);
                }

                // Remove dead worker
                const idx = s.webrtc.workers.indexOf(worker);
                if (idx !== -1) {
                    s.webrtc.workers.splice(idx, 1);
                }

                // Attempt to restart worker after delay
                setTimeout(async () => {
                    try {
                        const newWorker = await mediasoup.createWorker({
                            logLevel: config.webrtc.logLevel,
                            rtcMinPort: config.webrtc.rtcMinPort,
                            rtcMaxPort: config.webrtc.rtcMaxPort
                        });

                        // Create WebRtcServer for replacement worker
                        const tcpPort = (config.webrtc.rtcMinPort || 40000) + s.webrtc.workers.length;
                        try {
                            const listenInfos = [{
                                protocol: 'tcp',
                                ip: config.webrtc.listenIp || '0.0.0.0',
                                announcedAddress: config.webrtc.announcedIp || undefined,
                                port: tcpPort
                            }];
                            const webRtcServer = await newWorker.createWebRtcServer({ listenInfos });
                            s.webrtc.webrtcServers.set(newWorker.pid, webRtcServer);
                            s.debugLog('WebRTC', `Replacement worker ${newWorker.pid}: WebRtcServer on port ${tcpPort}`);
                        } catch (err) {
                            s.systemLog(`WebRTC: Failed to create WebRtcServer for replacement: ${err.message}`);
                        }

                        s.webrtc.workers.push(newWorker);
                        s.debugLog('WebRTC', `Replacement worker ${newWorker.pid} created`);
                    } catch (err) {
                        s.systemLog(`WebRTC: Failed to create replacement worker: ${err.message}`);
                    }
                }, 2000);
            });

            s.webrtc.workers.push(worker);
            s.debugLog('WebRTC', `Worker ${worker.pid} created`);
        } catch (err) {
            s.systemLog(`WebRTC: Failed to create worker ${i}: ${err.message}`);
        }
    }

    if (s.webrtc.workers.length === 0) {
        s.systemLog('WebRTC: No workers could be created. WebRTC disabled.');
        return;
    }

    /**
     * Get the next available worker using round-robin selection
     * @returns {Object} mediasoup Worker
     */
    s.getNextMediasoupWorker = () => {
        if (s.webrtc.workers.length === 0) {
            throw new Error('No mediasoup workers available');
        }
        const worker = s.webrtc.workers[s.webrtc.nextWorkerIdx];
        s.webrtc.nextWorkerIdx = (s.webrtc.nextWorkerIdx + 1) % s.webrtc.workers.length;
        return worker;
    };

    /**
     * Get or create a router for a group
     * @param {string} groupKey - The group identifier
     * @returns {Promise<Object>} mediasoup Router
     */
    s.getOrCreateRouter = async (groupKey) => {
        if (s.webrtc.routers.has(groupKey)) {
            return s.webrtc.routers.get(groupKey);
        }

        const worker = s.getNextMediasoupWorker();
        const router = await worker.createRouter({ mediaCodecs });

        // Store worker PID for WebRtcServer lookup
        router.appData = { workerPid: worker.pid };

        router.on('workerclose', () => {
            s.debugLog('WebRTC', `Router for group ${groupKey} closed due to worker close`);
            s.webrtc.routers.delete(groupKey);
        });

        s.webrtc.routers.set(groupKey, router);
        s.debugLog('WebRTC', `Router created for group ${groupKey}`);
        return router;
    };

    /**
     * Allocate an RTP port for a monitor
     * Uses a counter to ensure unique ports even after monitor restarts
     * Each monitor gets 2 ports (RTP + RTCP)
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @returns {number} Allocated RTP port
     */
    s.allocateRtpPort = (groupKey, monitorId) => {
        const key = `${groupKey}_${monitorId}`;
        if (!s.webrtc.rtpPorts.has(key)) {
            // Use a counter instead of map size to avoid port collisions on restart
            const port = config.webrtc.rtpPortBase + (s.webrtc.nextRtpPortIndex * 2);
            s.webrtc.nextRtpPortIndex++;
            s.webrtc.rtpPorts.set(key, port);
        }
        return s.webrtc.rtpPorts.get(key);
    };

    /**
     * Generate a deterministic SSRC for a monitor
     * Uses a simple incrementing scheme based on port allocation
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @returns {number} Deterministic SSRC
     */
    s.generateSsrc = (groupKey, monitorId) => {
        const port = s.allocateRtpPort(groupKey, monitorId);
        // SSRC based on port number - deterministic and unique per monitor
        return 0x10000000 + (port - config.webrtc.rtpPortBase);
    };

    /**
     * Release an allocated RTP port - keeps port reserved for this monitor
     * This prevents port collisions when monitors restart
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     */
    s.releaseRtpPort = (groupKey, monitorId) => {
        // Don't delete - keep the port reserved so the same monitor gets the same port on restart
        // This prevents port collision issues when multiple monitors restart
    };

    /**
     * Create a PlainTransport for RTP ingestion from FFmpeg
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @returns {Promise<Object>} { transport, rtpPort, rtcpPort }
     */
    s.createRtpTransport = async (groupKey, monitorId) => {
        const rtpPort = s.allocateRtpPort(groupKey, monitorId);
        return s.createRtpTransportOnPort(groupKey, monitorId, rtpPort);
    };

    /**
     * Create a PlainTransport for RTP ingestion on a specific port
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @param {number} rtpPort - The specific RTP port to use
     * @returns {Promise<Object>} { transport, rtpPort, rtcpPort }
     */
    s.createRtpTransportOnPort = async (groupKey, monitorId, rtpPort) => {
        const key = `${groupKey}_${monitorId}`;

        // Close any existing producer/transport for this monitor first
        const existingProducer = s.webrtc.producers.get(key);
        if (existingProducer) {
            try {
                s.debugLog('WebRTC', `Closing existing producer/transport for ${key} before creating new one`);
                existingProducer.producer.close();
                existingProducer.transport.close();
                s.webrtc.producers.delete(key);
            } catch (err) {
                s.debugLog('WebRTC', `Error closing existing producer: ${err.message}`);
            }
            // Small delay to ensure port is released
            await new Promise(r => setTimeout(r, 100));
        }

        const router = await s.getOrCreateRouter(groupKey);
        const rtcpPort = rtpPort + 1;

        // Retry logic in case port is briefly in use
        let transport;
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                transport = await router.createPlainTransport({
                    listenInfo: {
                        protocol: 'udp',
                        ip: config.webrtc.listenIp,
                        port: rtpPort
                    },
                    rtcpListenInfo: {
                        protocol: 'udp',
                        ip: config.webrtc.listenIp,
                        port: rtcpPort
                    },
                    rtcpMux: false,
                    comedia: true // Auto-detect source address from first RTP packet
                });
                break; // Success, exit retry loop
            } catch (err) {
                lastError = err;
                s.debugLog('WebRTC', `PlainTransport creation attempt ${attempt + 1} failed for ${key}: ${err.message}`);
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 200 * (attempt + 1))); // Increasing delay
                }
            }
        }

        if (!transport) {
            throw lastError || new Error('Failed to create PlainTransport after retries');
        }

        transport.on('close', () => {
            s.debugLog('WebRTC', `PlainTransport closed for ${groupKey}/${monitorId}`);
        });

        s.debugLog('WebRTC', `PlainTransport created for ${groupKey}/${monitorId} on port ${rtpPort}`);
        return { transport, rtpPort, rtcpPort };
    };

    /**
     * Create a WebRTC transport for browser consumers
     * @param {string} groupKey - The group identifier
     * @returns {Promise<Object>} mediasoup WebRtcTransport
     */
    s.createWebRtcTransport = async (groupKey) => {
        const router = await s.getOrCreateRouter(groupKey);
        const forceTcp = config.webrtc.forceTcp === true;

        // Get WebRtcServer for this router's worker (enables port sharing)
        const workerPid = router.appData?.workerPid;
        const webRtcServer = workerPid ? s.webrtc.webrtcServers.get(workerPid) : null;

        const transportOptions = {
            enableUdp: config.webrtc.enableUdp === true && !forceTcp,
            enableTcp: true,
            preferUdp: config.webrtc.enableUdp === true && !forceTcp,
            preferTcp: forceTcp || config.webrtc.enableUdp !== true,
            initialAvailableOutgoingBitrate: 1000000,
            minimumAvailableOutgoingBitrate: 600000,
            maxSctpMessageSize: 262144,
            maxIncomingBitrate: 1500000
        };

        // Use WebRtcServer if available (port sharing), otherwise fall back to listenIps
        if (webRtcServer) {
            transportOptions.webRtcServer = webRtcServer;
        } else {
            transportOptions.listenIps = [{
                ip: config.webrtc.listenIp,
                announcedIp: config.webrtc.announcedIp || undefined
            }];
        }

        const transport = await router.createWebRtcTransport(transportOptions);

        transport.on('close', () => {
            s.debugLog('WebRTC', `WebRtcTransport ${transport.id} closed`);
            s.webrtc.transports.delete(transport.id);
        });

        transport.on('dtlsstatechange', (dtlsState) => {
            s.debugLog('WebRTC', `Transport ${transport.id} DTLS state: ${dtlsState}`);
        });

        transport.on('icestatechange', (iceState) => {
            s.debugLog('WebRTC', `Transport ${transport.id} ICE state: ${iceState}`);
        });

        s.webrtc.transports.set(transport.id, transport);
        s.debugLog('WebRTC', `WebRtcTransport ${transport.id} created for group ${groupKey}`);
        return transport;
    };

    /**
     * Create a producer from an RTP stream (FFmpeg output)
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @param {Object} transport - PlainTransport instance
     * @param {Object} codecInfo - Codec information { mimeType, payloadType, ssrc, parameters }
     * @returns {Promise<Object>} mediasoup Producer
     */
    s.createWebrtcProducer = async (groupKey, monitorId, transport, codecInfo) => {
        const key = `${groupKey}_${monitorId}`;

        // Close existing producer if any
        const existing = s.webrtc.producers.get(key);
        if (existing) {
            s.debugLog('WebRTC', `Closing existing producer for ${key}`);
            existing.producer.close();
            s.webrtc.producers.delete(key);
        }

        const producer = await transport.produce({
            kind: 'video',
            rtpParameters: {
                codecs: [{
                    mimeType: codecInfo.mimeType || 'video/H264',
                    payloadType: codecInfo.payloadType || 96,
                    clockRate: 90000,
                    parameters: codecInfo.parameters || {
                        'packetization-mode': 1,
                        'profile-level-id': '42e01f',
                        'level-asymmetry-allowed': 1
                    },
                    rtcpFeedback: [
                        { type: 'nack' },
                        { type: 'nack', parameter: 'pli' },
                        { type: 'ccm', parameter: 'fir' },
                        { type: 'goog-remb' }
                    ]
                }],
                encodings: [{
                    ssrc: codecInfo.ssrc
                }]
            }
        });

        producer.on('close', () => {
            s.debugLog('WebRTC', `Producer closed for ${key}`);
            s.webrtc.producers.delete(key);
        });

        producer.on('transportclose', () => {
            s.debugLog('WebRTC', `Producer transport closed for ${key}`);
            s.webrtc.producers.delete(key);
        });

        // Monitor producer score
        producer.on('score', (score) => {
            s.debugLog('WebRTC', `Producer ${key} score: ${JSON.stringify(score)}`);
        });

        s.webrtc.producers.set(key, { producer, transport });
        s.debugLog('WebRTC', `Producer created for ${key} with SSRC ${codecInfo.ssrc}`);
        return producer;
    };

    /**
     * Create a consumer for browser playback
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @param {Object} transport - WebRtcTransport instance
     * @param {Object} rtpCapabilities - Client's RTP capabilities
     * @returns {Promise<Object>} mediasoup Consumer
     */
    s.createWebrtcConsumer = async (groupKey, monitorId, transport, rtpCapabilities) => {
        const key = `${groupKey}_${monitorId}`;
        const producerData = s.webrtc.producers.get(key);

        if (!producerData) {
            throw new Error(`No producer found for monitor ${monitorId}`);
        }

        const { producer, transport: producerTransport } = producerData;
        const router = await s.getOrCreateRouter(groupKey);

        s.debugLog('WebRTC', `Consumer creation: router=${router.id}, producer=${producer.id}, paused=${producer.paused}`);

        if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            throw new Error('Cannot consume: incompatible RTP capabilities');
        }

        const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true // Start paused, client will resume when ready
        });

        consumer.on('close', () => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} closed`);
            s.webrtc.consumers.delete(consumer.id);
        });

        consumer.on('transportclose', () => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} transport closed`);
            s.webrtc.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} producer closed`);
            s.webrtc.consumers.delete(consumer.id);
        });

        consumer.on('producerpause', () => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} producer paused`);
        });

        consumer.on('producerresume', () => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} producer resumed`);
        });

        consumer.on('score', (score) => {
            s.debugLog('WebRTC', `Consumer ${consumer.id} score: ${JSON.stringify(score)}`);
        });

        s.webrtc.consumers.set(consumer.id, consumer);
        s.debugLog('WebRTC', `Consumer ${consumer.id} created for ${key}`);
        return consumer;
    };

    /**
     * Check if a producer exists for a monitor
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @returns {boolean}
     */
    s.hasWebrtcProducer = (groupKey, monitorId) => {
        const key = `${groupKey}_${monitorId}`;
        return s.webrtc.producers.has(key);
    };

    /**
     * Get producer info for a monitor
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     * @returns {Object|null}
     */
    s.getWebrtcProducerInfo = (groupKey, monitorId) => {
        const key = `${groupKey}_${monitorId}`;
        const data = s.webrtc.producers.get(key);
        if (!data) return null;
        return {
            producerId: data.producer.id,
            kind: data.producer.kind,
            type: data.producer.type,
            paused: data.producer.paused
        };
    };

    /**
     * Cleanup WebRTC resources for a monitor
     * @param {string} groupKey - The group identifier
     * @param {string} monitorId - The monitor identifier
     */
    s.cleanupWebrtcMonitor = async (groupKey, monitorId) => {
        const key = `${groupKey}_${monitorId}`;

        const producerData = s.webrtc.producers.get(key);
        if (producerData) {
            try {
                producerData.producer.close();
                producerData.transport.close();
            } catch (err) {
                s.debugLog('WebRTC', `Cleanup error for ${key}: ${err.message}`);
            }
            s.webrtc.producers.delete(key);
        }

        s.releaseRtpPort(groupKey, monitorId);
        s.debugLog('WebRTC', `Cleaned up resources for ${key}`);
    };

    /**
     * Get WebRTC statistics
     * @returns {Object} Statistics object
     */
    s.getWebrtcStats = () => {
        return {
            workers: s.webrtc.workers.length,
            routers: s.webrtc.routers.size,
            producers: s.webrtc.producers.size,
            consumers: s.webrtc.consumers.size,
            transports: s.webrtc.transports.size,
            allocatedRtpPorts: s.webrtc.rtpPorts.size
        };
    };

    // BWE Algorithm Constants
    const BWE_CONFIG = {
        pollInterval: 500,           // ms - fast polling for cellular
        lossThresholdDown: 0.02,     // 2% packet loss triggers downgrade (more sensitive)
        lossThresholdUp: 0.005,      // < 0.5% loss allows upgrade
        scoreThresholdDown: 8,       // Score < 8 triggers downgrade
        scoreThresholdUp: 9,         // Score >= 9 allows upgrade
        reductionFactor: 0.7,        // Reduce to 70% (more aggressive)
        increaseFactor: 1.15,        // Increase to 115%
        initialBitrate: 500000,      // Start at 500kbps (conservative for cellular)
        minBitrate: 150000,          // 150 kbps floor (lower for cellular)
        maxBitrate: 4000000,         // 4 Mbps ceiling
        downgradeHysteresis: 800,    // 800ms before allowing upgrade after downgrade
        upgradeHysteresis: 2000      // 2s before allowing downgrade after upgrade
    };

    /**
     * Adjust transport bitrate based on network conditions
     * @param {Object} transport - WebRtcTransport instance
     * @param {Object} state - BWE state for this consumer
     * @param {number} fractionLost - Packet loss fraction (0-1)
     * @param {number} score - mediasoup consumer score (0-10)
     */
    s.adjustTransportBitrate = async (transport, state, fractionLost, score) => {
        if (!transport || transport.closed) return;

        const now = Date.now();
        const currentBitrate = state.currentBitrate || 1000000; // Default 1Mbps

        // Check if we should downgrade
        const shouldDowngrade = fractionLost > BWE_CONFIG.lossThresholdDown || score < BWE_CONFIG.scoreThresholdDown;
        // Check if we can upgrade
        const canUpgrade = fractionLost < BWE_CONFIG.lossThresholdUp && score > BWE_CONFIG.scoreThresholdUp;

        if (shouldDowngrade) {
            // Respect upgrade hysteresis - don't downgrade right after upgrade
            if (state.lastUpgrade && (now - state.lastUpgrade) < BWE_CONFIG.upgradeHysteresis) {
                return;
            }

            const newBitrate = Math.max(BWE_CONFIG.minBitrate, Math.floor(currentBitrate * BWE_CONFIG.reductionFactor));
            if (newBitrate < currentBitrate) {
                try {
                    await transport.setMaxOutgoingBitrate(newBitrate);
                    state.currentBitrate = newBitrate;
                    state.lastDowngrade = now;
                    s.debugLog('WebRTC', `BWE: Reduced bitrate to ${Math.round(newBitrate/1000)}kbps (loss=${(fractionLost*100).toFixed(1)}%, score=${score})`);
                } catch (err) {
                    s.debugLog('WebRTC', `BWE: Failed to set bitrate: ${err.message}`);
                }
            }
        } else if (canUpgrade && currentBitrate < BWE_CONFIG.maxBitrate) {
            // Respect downgrade hysteresis - don't upgrade right after downgrade
            if (state.lastDowngrade && (now - state.lastDowngrade) < BWE_CONFIG.downgradeHysteresis) {
                return;
            }

            const newBitrate = Math.min(BWE_CONFIG.maxBitrate, Math.floor(currentBitrate * BWE_CONFIG.increaseFactor));
            if (newBitrate > currentBitrate) {
                try {
                    await transport.setMaxOutgoingBitrate(newBitrate);
                    state.currentBitrate = newBitrate;
                    state.lastUpgrade = now;
                    s.debugLog('WebRTC', `BWE: Increased bitrate to ${Math.round(newBitrate/1000)}kbps (loss=${(fractionLost*100).toFixed(1)}%, score=${score})`);
                } catch (err) {
                    s.debugLog('WebRTC', `BWE: Failed to set bitrate: ${err.message}`);
                }
            }
        }
    };

    /**
     * Start BWE monitoring for a consumer
     * @param {string} consumerId - Consumer ID
     * @param {Object} transport - WebRtcTransport instance
     * @param {Object} consumer - Consumer instance
     */
    s.startBweMonitoring = (consumerId, transport, consumer) => {
        // Clean up any existing monitoring
        s.stopBweMonitoring(consumerId);

        // Initialize BWE state with conservative initial bitrate
        const state = {
            currentBitrate: BWE_CONFIG.initialBitrate,
            lastDowngrade: null,
            lastUpgrade: null,
            score: 10,
            fractionLost: 0
        };
        s.webrtc.bweState.set(consumerId, state);

        // Set initial conservative bitrate on transport
        transport.setMaxOutgoingBitrate(BWE_CONFIG.initialBitrate).catch(err => {
            s.debugLog('WebRTC', `BWE: Failed to set initial bitrate: ${err.message}`);
        });

        // Start monitoring interval
        const interval = setInterval(async () => {
            const currentConsumer = s.webrtc.consumers.get(consumerId);
            if (!currentConsumer || currentConsumer.closed) {
                s.stopBweMonitoring(consumerId);
                return;
            }

            try {
                const stats = await currentConsumer.getStats();
                let fractionLost = 0;
                let packetsLost = 0;
                let packetsSent = 0;

                // Extract packet loss from stats (mediasoup returns array)
                if (Array.isArray(stats)) {
                    for (const stat of stats) {
                        if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                            packetsLost = stat.packetsLost || 0;
                            packetsSent = stat.packetsSent || 0;
                            if (packetsSent > 0) {
                                fractionLost = packetsLost / (packetsSent + packetsLost);
                            }
                        }
                    }
                }

                // Get consumer score (from last score event)
                const score = state.score;

                // Update state
                state.fractionLost = fractionLost;

                // Status logging every 20 polls (~10 seconds)
                if (!state.pollCount) state.pollCount = 0;
                state.pollCount++;
                if (state.pollCount % 20 === 0) {
                    s.debugLog('WebRTC', `BWE [${consumerId.slice(0,8)}]: ${Math.round(state.currentBitrate/1000)}kbps score=${score} loss=${(fractionLost*100).toFixed(1)}%`);
                }

                // Adjust bitrate based on conditions
                await s.adjustTransportBitrate(transport, state, fractionLost, score);

            } catch (err) {
                // Consumer might have closed during stats collection
                if (err.message && err.message.includes('closed')) {
                    s.stopBweMonitoring(consumerId);
                }
            }
        }, BWE_CONFIG.pollInterval);

        s.webrtc.bweIntervals.set(consumerId, interval);

        // Listen for score updates
        consumer.on('score', (scoreData) => {
            const consumerState = s.webrtc.bweState.get(consumerId);
            if (consumerState && scoreData && scoreData.score !== undefined) {
                consumerState.score = scoreData.score;
            }
        });

        s.debugLog('WebRTC', `BWE: Started monitoring for consumer ${consumerId}`);
    };

    /**
     * Stop BWE monitoring for a consumer
     * @param {string} consumerId - Consumer ID
     */
    s.stopBweMonitoring = (consumerId) => {
        const interval = s.webrtc.bweIntervals.get(consumerId);
        if (interval) {
            clearInterval(interval);
            s.webrtc.bweIntervals.delete(consumerId);
        }
        s.webrtc.bweState.delete(consumerId);
    };

    /**
     * Get BWE stats for a consumer
     * @param {string} consumerId - Consumer ID
     * @returns {Object|null} BWE state or null
     */
    s.getBweStats = (consumerId) => {
        const state = s.webrtc.bweState.get(consumerId);
        if (!state) return null;

        // Quality levels aligned with BWE thresholds
        // excellent: score >= 9 (upgrade allowed)
        // good: score >= 8 (stable, no action)
        // fair: score >= 6 (downgrade triggered)
        // poor: score < 6 (severely degraded)
        return {
            bitrate: state.currentBitrate,
            score: state.score,
            fractionLost: state.fractionLost,
            quality: state.score >= 9 ? 'excellent' :
                     state.score >= 8 ? 'good' :
                     state.score >= 6 ? 'fair' : 'poor'
        };
    };

    // Log successful initialization
    const maxPort = (config.webrtc.rtcMinPort || 40000) + s.webrtc.workers.length - 1;
    s.systemLog(`WebRTC: Initialized with ${s.webrtc.workers.length} workers (ports ${config.webrtc.rtcMinPort || 40000}-${maxPort})`);

    // Load signaling handlers
    require('./webrtc/signaling.js')(s, config, lang, io);
};
