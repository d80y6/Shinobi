module.exports = function(s,config,lang){
    require('./events/onvif.js')(s,config,lang)
    require('./events/noEventsDetector.js')(s,config,lang)
    require('./events/lineCrossCounter.js')(s,config,lang);
    const { bindTagLegendForMonitors } = require('./events/utils.js')(s,config,lang)
    s.onAccountSave(function(theGroup,formDetails,user){
        const groupKey = user.ke
        bindTagLegendForMonitors(groupKey)
    })
    s.onMonitorSave(function(monitorConfig){
        const groupKey = monitorConfig.ke
        bindTagLegendForMonitors(groupKey)
    })
    s.onMonitorStop(function(monitorConfig){
        const groupKey = monitorConfig.ke
        bindTagLegendForMonitors(groupKey)
    })
    s.onProcessReady(function(){
        Object.keys(s.group).forEach((groupKey) => {
            bindTagLegendForMonitors(groupKey)
        })
    })
}
