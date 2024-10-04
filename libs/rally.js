const {
    ShinobiAPI,
    formatDateTime,
    getCameraTemplate,
    cleanStringForMonitorId,
} = require('node-shinobi');

module.exports = (s,config,lang,app,io) => {
    function getServerInfo(){}
    async function getMonitors({ host, groupKey, apiKey }){
        const shinobi = new ShinobiAPI(host, apiKey, groupKey);
        const monitors = await shinobi.getMonitor();
        return monitors
    }
    function findRallyTypeFromStreamPath(streamPath) {
        let chosenType = null;
        if(streamPath.endsWith('m3u8')){
            chosenType = 'hls'
        }else if(streamPath.endsWith('mp4')){
            chosenType = 'mp4'
        }
        return chosenType;
    }
    async function getMonitorsForRally(connectionInfo) {
        const { host, groupKey, apiKey, channel } = connectionInfo;
        const monitors = await getMonitors(connectionInfo)
        let [ hostname, port ] = host.split('://')[1].split(':');
        const protocol = host.startsWith('https') ? 'https' : 'http';
        const ralliedMonitors = [];
        hostname = hostname.endsWith('/') ? hostname.substring(0, str.length - 1) : hostname;
        monitors.forEach(monitor => {
            const streamPath = monitor.streams[channel] || monitor.streams[0];
            const rallyType = findRallyTypeFromStreamPath(streamPath);
            if(hostname && rallyType){
                const autoHostUrl = `${protocol}://${hostname}:${port}${streamPath}`;
                monitor.protocol = protocol;
                monitor.host = hostname;
                monitor.port = port;
                monitor.path = streamPath;
    	        monitor.type = rallyType;
                monitor.details.auto_host = autoHostUrl;
                ralliedMonitors.push(monitor)
            }
        });
        return ralliedMonitors;
    }
    /**
    * API : Get Monitors
     */
    app.post(config.webPaths.apiPrefix+':auth/rally/:ke/getMonitors', function (req,res){
        s.auth(req.params, async function(user){
            const groupKey = req.params.ke
            const asis = s.getPostData(req,'asis') === '1'
            const connectionInfo = s.getPostData(req,'connectionInfo',true) || {}
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
                userPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.get_monitors_disallowed
            ){
                s.closeJsonResponse(res,[]);
                return
            }
            if(!connectionInfo.host || !connectionInfo.groupKey || !connectionInfo.apiKey){
                s.closeJsonResponse(res,{ok: false, msg: lang['No Data']});
                return
            }
            const monitors = (asis ? await getMonitors(connectionInfo) : await getMonitorsForRally(connectionInfo)) || [];
            s.closeJsonResponse(res, monitors);
        },res,req);
    });

    // page structure
    config.webBlocksPreloaded.push(`home/rally`)
    s.definitions['Rally'] = {
          "name": "Rally",
          "blocks": {
              "Search Settings": {
                 "id": "rallyConfigure",
                 "name": lang.Configure,
                 "blockquote": lang.RallyDescription,
                 "color": "green",
                 "section-pre-class": "col-md-4",
                 isFormGroupGroup: true,
                 "info": [
                     {
                         "name": "host",
                         "field": lang["Host"],
                         "placeholder": "http://shinobi_host:8080",
                     },
                     {
                         "name": "groupKey",
                         "field": lang["Group Key"],
                     },
                     {
                         "name": "apiKey",
                         "field": lang["API Key"],
                         "description": lang.rallyApiKeyFieldText,
                     },
                     {
                       "fieldType": "btn-group",
                       "btns": [
                           {
                               forForm: true,
                               "fieldType": "btn",
                               "class": `btn-success fill mb-3`,
                               "icon": `search`,
                               "attribute": `type="submit"`,
                               "btnContent": `${lang['Scan']}`,
                           }
                        ]
                     }
                ]
            },
            "Management": {
               "id": "rallyManagement",
               "noHeader": true,
               "color": "blue",
               "section-pre-class": "col-md-8",
               "info": [
                   {
                       "id":"rallyServerInfo",
                       "fieldType": "div",
                       "class": "mb-3",
                   },
                   {
                      "fieldType": "btn-group",
                      "class": "mb-3",
                      "btns": [
                          {
                              "fieldType": "btn",
                              "class": `btn-success add-all`,
                              "btnContent": `<i class="fa fa-plus"></i> ${lang['Add All (Rallied)']}`,
                          },
                          // {
                          //     "fieldType": "btn",
                          //     "class": `btn-success add-all-direct`,
                          //     "btnContent": `<i class="fa fa-plus"></i> ${lang['Add All (Direct)']}`,
                          // },
                      ],
                   },
                   {
                       "id":"rallyCameras",
                       "fieldType": "table",
                       "attribute": `data-classes="table table-striped"`,
                       "divContent": ""
                   }
               ]
           },
         }
     }
}
