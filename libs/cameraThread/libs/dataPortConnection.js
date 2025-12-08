module.exports = function(jsonData,onConnected,onError,onClose){
    const config = jsonData.globalInfo.config;
    const dataPortToken = jsonData.dataPortToken;
    const CWS = require('cws');
    const wsUrl = `ws://localhost:${config.port}/dataPort`;

    let client = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let isIntentionallyClosed = false;
    const maxReconnectDelay = 30000; // 30 seconds max
    const baseDelay = 1000; // 1 second base

    function getReconnectDelay() {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
        return Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    }

    function connect() {
        if (isIntentionallyClosed) return;

        client = new CWS(wsUrl);

        client.on('open', () => {
            reconnectAttempts = 0; // Reset on successful connection
            if (onConnected) onConnected();
        });

        client.on('error', (err) => {
            if (onError) onError(err);
        });

        client.on('close', (code, reason) => {
            if (onClose) onClose(code, reason);

            if (!isIntentionallyClosed) {
                const delay = getReconnectDelay();
                reconnectAttempts++;
                console.error(`[dataPort] Connection closed, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
                reconnectTimer = setTimeout(connect, delay);
            }
        });
    }

    connect();

    // Return a wrapper that exposes send and close methods
    return {
        send: function(data) {
            if (client && client.readyState === CWS.OPEN) {
                client.send(data);
            }
        },
        close: function() {
            isIntentionallyClosed = true;
            clearTimeout(reconnectTimer);
            if (client) client.close();
        },
        get readyState() {
            return client ? client.readyState : CWS.CLOSED;
        }
    };
}
