module.exports = function(s,config,lang,io){
    s.onOtherWebSocketMessages(async (d,cn,tx) => {
        switch(d.f){
            case'addOrEditMonitor':
                var user = s.group[cn.ke].users[cn.auth];
                var groupKey = cn.ke
                var monitorId = d.mid || d.id;
                var callbackId = d.callbackId;
                var response = { f: 'callback', ff:'addOrEditMonitor', callbackId, ok: false }
                var {
                    monitorPermissions,
                    monitorRestrictions,
                } = s.getMonitorsPermitted(user.details,monitorId)
                var {
                    isRestricted,
                    isRestrictedApiKey,
                    apiKeyPermissions,
                    userPermissions,
                } = s.checkPermission(user);
                if(
                    userPermissions.monitor_create_disallowed ||
                    isRestrictedApiKey && apiKeyPermissions.edit_monitors_disallowed ||
                    isRestricted && !monitorPermissions[`${monitorId}_monitor_edit`]
                ){
                    response.msg = lang['Not Authorized'];
                }else{
                    var form = d.form;
                    if(!form){
                       response.msg = lang.monitorEditText1;
                   }else{
                       form.mid = monitorId.replace(/[^\w\s]/gi,'').replace(/ /g,'')
                       if(form && form.name){
                           s.checkDetails(form)
                           form.ke = groupKey
                           const editResponse = await s.addOrEditMonitor(form,null,user);
                           response.ok = editResponse.ok;
                       }else{
                           response.msg = user.lang.monitorEditText1;
                       }
                   }
                }
                tx(response);
            break;
        }
    })
}
