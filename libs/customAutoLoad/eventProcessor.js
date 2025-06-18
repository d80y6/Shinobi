require('dotenv').config(); // Load .env file
const axios = require('axios');

module.exports = function (s, config, lang, app, io) {
    const webhookUrl = process.env.GLOBAL_WEBHOOK_URL;

    const sendEventToWebhook = function (d, filter) {
        const conf = require("../../conf.json");
        if (!webhookUrl) {
            console.warn('❌ GLOBAL_WEBHOOK_URL not set in .env');
            return;
        }

        const payload = {
            monitorId: d.id,
            serverId: conf.serverId,
            eventType: d.reason,
            timestamp: d.currentTimestamp,
            fullEvent: d
        };

        console.log('📤 Sending webhook payload for eventType:', payload.eventType);

        if (conf.enableManagementConnect) {
            axios.post(webhookUrl, payload).then((res) => {
                console.log(`✅ Webhook sent to ${webhookUrl} (status ${res.status})`);
            }).catch((err) => {
                console.error(`❌ Webhook failed:`, err.message);
            });
        }else {
            console.warn('⚠️ Management Server Connection is disabled, not sending webhook');
        }
    };

    s.onEventTrigger(sendEventToWebhook);
    console.log('✅ Loaded customAutoLoad module with .env webhook');
};