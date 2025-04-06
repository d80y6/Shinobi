module.exports = function(s, config, lang, app, io) {
    const logEventData = function(d, filter) {
        console.log('🔔 Event Triggered!');
        console.log(JSON.stringify(d, null, 2)); // Pretty print the event data
    };

    // Register the event listener
    s.onEventTrigger(logEventData);

    console.log('✅ Loaded customAutoLoad module: myEventLogger');
};
