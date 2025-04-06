require('dotenv').config(); // Load .env file
const axios = require('axios');

module.exports = function(s, config, lang, app, io) {
    const webhookUrl = process.env.GLOBAL_WEBHOOK_URL;

    const sendEventToWebhook = function(d, filter) {
        if (!webhookUrl) {
            console.warn('❌ GLOBAL_WEBHOOK_URL not set in .env');
            return;
        }

        axios.post(webhookUrl, {
            monitorId: d.id,
            groupKey: d.ke,
            eventType: d.reason,
            timestamp: d.currentTimestamp,
            fullEvent: d
        }).then((res) => {
            console.log(`✅ Webhook sent to ${webhookUrl} (status ${res.status})`);
        }).catch((err) => {
            console.error(`❌ Webhook failed:`, err.message);
        });
    };

    s.onEventTrigger(sendEventToWebhook);
    console.log('✅ Loaded customAutoLoad module with .env webhook');
};