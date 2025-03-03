module.exports = function(s,config,lang){
    const {
        getAlarm,
        createAlarm,
        updateAlarm,
        deleteAlarm,
        sanitizeOperator,
    } = require('./events/alarms.js')(s,config,lang);
    if(config.renderPaths.alarmPopup === undefined){config.renderPaths.alarmPopup='pages/alarmPopup'};
    const onGoingAlarms = {};
    const onGoingAlarmTimeouts = {};

    s.onEventTrigger(function(d,filter,eventTime){
        const groupKey = d.ke
        const monitorId = d.id || d.mid;
        const alarmTarget = `${groupKey}${monitorId}`
        if(!onGoingAlarms[alarmTarget]){
            const startTime = s.formattedTime(eventTime);
            onGoingAlarms[alarmTarget] = { startTime };
            createAlarm({
                ke: groupKey,
                mid: monitorId,
                start: startTime
            })
            getEventBasedRecordingUponCompletion({
                ke: d.ke,
                mid: d.mid || d.id
            }).then(({ filename, filePath }) => {
                if(filename && filePath){
                    updateAlarm({
                        ke: groupKey,
                        mid: monitorId,
                        start: startTime,
                        fileBinName: filename,
                    })
                }
            })
        }
        clearTimeout(onGoingAlarmTimeouts[alarmTarget])
        onGoingAlarmTimeouts[alarmTarget] = setTimeout(() => {
            const { startTime } = onGoingAlarms[alarmTarget];
            const endTime = new Date();
            updateAlarm({
                ke: groupKey,
                mid: monitorId,
                start: startTime,
                end: s.formattedTime(endTime)
            }).then(() => {
                delete(onGoingAlarms[alarmTarget]);
                delete(onGoingAlarmTimeouts[alarmTarget]);
            })
        },10000)
    })

    /**
    * API : Get Alarm(s)
     */
    app.get([
		config.webPaths.apiPrefix+':auth/alarms/:ke',
		config.webPaths.apiPrefix+':auth/alarms/:ke/:id',
	], function (req,res){
        res.setHeader('Content-Type', 'application/json');
        s.auth(req.params,function(user){
            const monitorId = req.params.id
            const groupKey = req.params.ke
            const {
                monitorPermissions,
                monitorRestrictions,
            } = s.getMonitorsPermitted(user.details,monitorId)
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.get_alarms_disallowed ||
                isRestricted && (
                    monitorId && !monitorPermissions[`${monitorId}_get_alarms`] ||
                    monitorRestrictions.length === 0
                )
            ){
                s.closeJsonResponse(res,{ok: false, msg: lang['Not Authorized'], alarms: []});
                return
            }
            const { name, start, startOperator, end, endOperator } = req.query;
            const response = { ok: true }
            const rows = await getAlarm({
                ke: groupKey,
                mid: monitorId,
                name,
                start,
                end,
                startOperator: sanitizeOperator(startOperator),
                endOperator: sanitizeOperator(endOperator),
            });
            response.alarms = rows;
            s.closeJsonResponse(res,response)
        })
    })
    /**
    * API : Update Alarm
     */
    app.post(config.webPaths.apiPrefix+':auth/alarms/:ke/:id', function (req,res){
        res.setHeader('Content-Type', 'application/json');
        s.auth(req.params,function(user){
            const monitorId = req.params.id
            const groupKey = req.params.ke
            const {
                monitorPermissions,
                monitorRestrictions,
            } = s.getMonitorsPermitted(user.details,monitorId)
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.edit_alarms_disallowed ||
                isRestricted && (
                    monitorId && !monitorPermissions[`${monitorId}_edit_alarms`] ||
                    monitorRestrictions.length === 0
                )
            ){
                s.closeJsonResponse(res,{ok: false, msg: lang['Not Authorized'], alarms: []});
                return
            }
            const { name, start, fileBinName, videoTime, notes, status, editedBy, details, end } = req.body;
            const response = await updateAlarm({
                ke: groupKey,
                mid: monitorId,
                name,
                fileBinName,
                videoTime,
                notes,
                status,
                editedBy,
                details,
                start,
                end,
            });
            s.closeJsonResponse(res,response)
        })
    })
    /**
    * Page : Get Alarm Popup Window
     */
    app.get([config.webPaths.apiPrefix+':auth/alarm/:ke/:id',config.webPaths.apiPrefix+':auth/alarm/:ke/:id/:addon'], function (req,res){
        s.auth(req.params,function(user){
            const { auth: authKey, ke: groupKey, id: monitorId } = req.params;
            var $user = {
                auth_token: authKey,
                ke: groupKey,
                uid: user.uid,
                mail: user.mail,
                details: {},
            };
            s.renderPage(req,res,config.renderPaths.alarmPopup,{
                forceUrlPrefix: req.query.host || '',
                protocol: req.protocol,
                baseUrl: req.protocol+'://'+req.hostname,
                config: s.getConfigWithBranding(req.hostname),
                define: s.getDefinitonFile(user.details ? user.details.lang : config.lang),
                lang,
                $user,
                monitorId,
                mon: Object.assign({},s.group[groupKey].rawMonitorConfigurations[monitorId]),
                originalURL: s.getOriginalUrl(req)
            });
        },res,req);
    });
}
