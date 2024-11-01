const path = require('path')
module.exports = (s,config,lang,app,io) => {
    // for unix-based systems only
    if(s.isWin)return;
    const {
        modifyConfiguration,
     } = require('./system/utils.js')(config)
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
            const response = await list();
            s.closeJsonResponse(res, response);
        },res,req);
    });
    /**
    * API : Add Mount to fstab
     */
    app.post(config.webPaths.superApiPrefix+':auth/mountManager/mount', function (req,res){
        s.superAuth(req.params, async (resp) => {
            const { sourceTarget, localPath, mountType, options } = req.body;
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
            try{
                await unmount(localPath)
            }catch(err){
                console.error(err)
            }
            const response = await remove(localPath);
            s.closeJsonResponse(res, response);
        },res,req);
    });
    /**
    * API : Set Mount Point as Videos Directory (videosDir)
     */
    app.post(config.webPaths.superApiPrefix+':auth/mountManager/setVideosDir', function (req,res){
        s.superAuth(req.params, async (resp) => {
            const { localPath, pathInside } = req.body;
            const response = { ok: false }
            try{
                const { exists } = await checkDiskPathExists(localPath)
                if(exists){
                    const newVideosDirPath = pathInside ? path.join(localPath, pathInside) : localPath;
                    const configError = await modifyConfiguration({
                        videosDir: newVideosDirPath,
                    }, true);
                    response.ok = true;
                }
            }catch(err){
                console.error(err)
            }
            s.closeJsonResponse(res, response);
        },res,req);
    });
}
