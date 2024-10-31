module.exports = (s,config,lang,app,io) => {
    // for unix-based systems only
    if(s.isWin)return;
    const {
        createMountPoint,
        mount,
        update,
        remove,
        list,
        remountAll,
        remount,
        unmount
    } = require('node-fstab');
    /**
    * API : Remount All in fstab
     */
    app.get(config.webPaths.superApiPrefix+':auth/mountManager/list', function (req,res){
        s.superAuth(req.params, async (resp) => {
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
                userPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.edit_mounts_disallowed
            ){
                s.closeJsonResponse(res,{ ok: false, mounts: [] });
                return
            }
            const response = await remountAll();
            s.closeJsonResponse(res, response);
        },res,req);
    });
    /**
    * API : Add Mount to fstab
     */
    app.post(config.webPaths.superApiPrefix+':auth/mountManager/mount', function (req,res){
        s.superAuth(req.params, async (resp) => {
            const { sourceTarget, localPath, mountType, options } = req.body;
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
                userPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.edit_mounts_disallowed
            ){
                s.closeJsonResponse(res,{ ok: false });
                return
            }
            try{
                await createMountPoint(localPath)
            }catch(err){
                console.error(err)
            }
            const response = await update(sourceTarget, localPath, mountType, options);
            try{
                await remount(localPath)
            }catch(err){
                console.error(err)
            }
            s.closeJsonResponse(res, response);
        },res,req);
    });
    /**
    * API : Remove Mount to fstab
     */
    app.post(config.webPaths.superApiPrefix+':auth/mountManager/removeMount', function (req,res){
        s.superAuth(req.params, async (resp) => {
            const { localPath } = req.body;
            const {
                isRestricted,
                isRestrictedApiKey,
                apiKeyPermissions,
                userPermissions,
            } = s.checkPermission(user)
            if(
                isRestrictedApiKey && apiKeyPermissions.edit_mounts_disallowed
            ){
                s.closeJsonResponse(res,{ ok: false });
                return
            }
            try{
                await unmount(localPath)
            }catch(err){
                console.error(err)
            }
            const response = await remove(localPath);
            s.closeJsonResponse(res, response);
        },res,req);
    });
}
