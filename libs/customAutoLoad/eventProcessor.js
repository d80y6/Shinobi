const axios = require('axios');

module.exports = async function (s, config, lang, app, io) {
    let webhookUrl = null;

    const mgmtServerKeys = Object.keys(config.mgmtServers || {});
    if (config.enableMgmtConnect && mgmtServerKeys.length > 0) {
        const mgmtServerUrl = mgmtServerKeys[0].trim();
        const transformedUrl = mgmtServerUrl.replace(/^wss?:\/\//, 'http://');
        const url = new URL(transformedUrl);
        url.port = '8005';
        url.pathname = '/onDetectionEvent';
        webhookUrl = url.toString(); // Store for reuse
        console.log(`✅ Webhook URL prepared: ${webhookUrl}`);
    }else{
        console.warn('⚠️ Management Server Connection is disabled');
    }

    const sendEventToWebhook = async function (d, filter) {
        const payload = {
            monitorId: d.id,
            serverId: config.subscriptionId,
            eventType: d.reason,
            timestamp: d.currentTimestamp,
            fullEvent: d
        };

        console.log('📤 Sending webhook payload');

        if (config.enableMgmtConnect && webhookUrl) {
            axios.post(webhookUrl, payload).then((res) => {
                console.log(`✅ Webhook sent to ${webhookUrl} (status ${res.status})`);
            }).catch((err) => {
                console.error(`❌ Webhook failed:`, err.message);
            });
        } else {
            console.warn('⚠️ Webhook URL not set or Management Server Connection is disabled');
        }
    };

    s.onEventTrigger(sendEventToWebhook);
    console.log('✅ Loaded customAutoLoad module');
};
