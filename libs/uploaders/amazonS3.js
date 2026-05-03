// https://us-east-1.console.aws.amazon.com/iamv2/home#/users

const fs = require('fs');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, StorageClass} = require("@aws-sdk/client-s3");

module.exports = function(s,config,lang){
    const genericRequest = async (groupKey,requestOptions) => {
        const response = {ok: true}
        try {
            await s.group[groupKey].aws_s3.send(requestOptions);
        } catch (err) {
            console.error('AMZ genericRequest',groupKey,requestOptions)
            response.ok = false
            response.err = err
        }
        return response;
    };
    const deleteObject = async (groupKey,options) => {
        return await genericRequest(groupKey,new DeleteObjectCommand(options))
    };
    const uploadObject = async (groupKey,options) => {
        return await genericRequest(groupKey,new PutObjectCommand(options))
    };
    const getObject = async (groupKey,options) => {
        // returns createReadStream
        return await s.group[groupKey].aws_s3.send(new GetObjectCommand(options))
    };
    function beforeAccountSave(d){
        //d = save event
        d.formDetails.aws_use_global=d.d.aws_use_global
        d.formDetails.use_aws_s3=d.d.use_aws_s3
    }
    function cloudDiskUseStartup(group,userDetails){
        group.cloudDiskUse['s3'].name = 'Amazon S3'
        group.cloudDiskUse['s3'].maxDays = parseInt(userDetails.aws_s3_max_days);
        group.cloudDiskUse['s3'].sizeLimitCheck = (userDetails.use_aws_s3_size_limit === '1')
        if(!userDetails.aws_s3_size_limit || userDetails.aws_s3_size_limit === ''){
            group.cloudDiskUse['s3'].sizeLimit = 10000
        }else{
            group.cloudDiskUse['s3'].sizeLimit = parseFloat(userDetails.aws_s3_size_limit)
        }
    }
    function loadGroupApp(e){
        // e = user
        var userDetails = JSON.parse(e.details)
        if(userDetails.aws_use_global === '1' && config.cloudUploaders && config.cloudUploaders.AmazonS3){
            // {
            //     aws_accessKeyId: "",
            //     aws_secretAccessKey: "",
            //     aws_region: "",
            //     aws_s3_bucket: "",
            //     aws_s3_dir: "",
            // }
            userDetails = Object.assign(userDetails,config.cloudUploaders.AmazonS3)
        }
        //Amazon S3
        if(
           !s.group[e.ke].aws_s3 &&
           userDetails.aws_s3 !== '0' &&
           userDetails.aws_accessKeyId !== ''&&
           userDetails.aws_secretAccessKey &&
           userDetails.aws_secretAccessKey !== ''&&
           userDetails.aws_region &&
           userDetails.aws_region !== ''&&
           userDetails.aws_s3_bucket !== ''
          ){
            if(!userDetails.aws_s3_dir || userDetails.aws_s3_dir === '/'){
                userDetails.aws_s3_dir = ''
            }
            if(userDetails.aws_s3_dir !== ''){
                userDetails.aws_s3_dir = s.checkCorrectPathEnding(userDetails.aws_s3_dir)
            }
            s.group[e.ke].aws_s3 = new S3Client({
                credentials: {
                    accessKeyId: userDetails.aws_accessKeyId,
                    secretAccessKey: userDetails.aws_secretAccessKey,
                },
                region: userDetails.aws_region
            });
        }
    }
    function unloadGroupApp(user){
        s.group[user.ke].aws_s3 = null
    }
    async function deleteVideo(e, video, callback){
        // e = user
        //retryCount = max attempts (default 10, 0 = infinite)
        const retryValue = parseInt(s.group[e.ke].init.aws_s3_retryCount)
        const retryCount = isNaN(retryValue) ? 10 : retryValue
        var videoDetails;
        try {
            videoDetails = JSON.parse(video.details);
        } catch(err){
            videoDetails = video.details;
        }

        if(!videoDetails.location){
            videoDetails.location = video.href.split('.amazonaws.com')[1];
        }

        if(video.type !== 's3'){
            if(callback) callback();
            return { ok: true, skipped: true };
        }

        const infiniteRetry = retryCount === 0;

        function attemptDelete(){
            return new Promise((resolve) => {
                deleteObject(video.ke, {
                    Bucket: s.group[video.ke].init.aws_s3_bucket,
                    Key: videoDetails.location,
                }).then((response) => {
                    resolve(response || { ok: false, err: 'No response from deleteObject' });
                }).catch((err) => {
                    resolve({ ok: false, err: err });
                });
            });
        }

        let attempt = 0;
        let response = { ok: false, err: 'No delete attempt was made' };

        while(infiniteRetry || attempt < retryCount){
            attempt++;
            response = await attemptDelete();
            if(response.ok) break;

            const willRetry = infiniteRetry || attempt < retryCount;
            if(willRetry){
                // exponential backoff, capped at 60s
                const delayMs = Math.min(1000 * Math.pow(2, Math.min(attempt - 1, 6)), 60000);
                console.log(`S3 video delete failed (attempt ${attempt}${infiniteRetry ? '' : '/' + retryCount}), retrying in ${delayMs}ms:`, response.err);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        if(response.err){
            console.error('Amazon S3 DELETE Error');
            console.error(response.err);
        }

        if(callback) callback(response);
        return response;
    }
    async function uploadVideo(e, k, insertQuery){
        //e = video object
        //k = temporary values
        //retryCount = max attempts (default 10, 0 = infinite)
        if(!k) k = {};
        //cloud saver - amazon s3
        const groupKey = insertQuery.ke;
        if(!(s.group[groupKey].aws_s3 && s.group[groupKey].init.use_aws_s3 !== '0' && s.group[groupKey].init.aws_s3_save === '1')){
            return;
        }
        const retryValue = parseInt(s.group[groupKey].init.aws_s3_retryCount)
        const retryCount = isNaN(retryValue) ? 10 : retryValue
        const filename = `${s.formattedTime(insertQuery.time)}.${insertQuery.ext}`;
        const filePath = k.dir + filename;
        const saveLocation = s.group[groupKey].init.aws_s3_dir + groupKey + '/' + e.mid + '/' + filename;
        const infiniteRetry = retryCount === 0;

        // Single attempt: builds a *fresh* stream each call and always tears it down.
        function attemptUpload(){
            return new Promise((resolve) => {
                let fileStream = fs.createReadStream(filePath);
                let settled = false;

                const finish = (result) => {
                    if(settled) return;
                    settled = true;
                    try {
                        if(fileStream && !fileStream.destroyed){
                            fileStream.destroy();
                        }
                    } catch(_) {}
                    fileStream = null; // drop reference so GC can collect SDK-side buffers
                    resolve(result);
                };

                fileStream.on('error', function(err){
                    console.error(err);
                    finish({ ok: false, err: err });
                });

                uploadObject(groupKey, {
                    Bucket: s.group[groupKey].init.aws_s3_bucket,
                    Key: saveLocation,
                    Body: fileStream,
                    ContentType: 'video/' + e.ext,
                    StorageClass: s.group[groupKey].init.aws_storage_class || StorageClass.STANDARD
                }).then((response) => {
                    finish(response || { ok: false, err: 'No response from uploadObject' });
                }).catch((err) => {
                    finish({ ok: false, err: err });
                });
            });
        }

        let attempt = 0;
        let response = { ok: false, err: 'No upload attempt was made' };

        try{
            while(infiniteRetry || attempt < retryCount){
                attempt++;
                response = await attemptUpload();
                if(response.ok) break;

                const willRetry = infiniteRetry || attempt < retryCount;
                if(willRetry){
                    const delayMs = Math.min(1000 * Math.pow(2, Math.min(attempt - 1, 6)), 60000);
                    console.log(`S3 upload failed (attempt ${attempt}${infiniteRetry ? '' : '/' + retryCount}), retrying in ${delayMs}ms:`, response.err);
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }

            if(response.err){
                s.userLog(e, { type: lang['Amazon S3 Upload Error'], msg: response.err });
            }
            if(s.group[groupKey].init.aws_s3_log === '1' && response.ok){
                await s.knexQuery({
                    action: "insert",
                    table: "Cloud Videos",
                    insert: {
                        mid: e.mid,
                        ke: groupKey,
                        ext: insertQuery.ext,
                        time: insertQuery.time,
                        status: 1,
                        type: 's3',
                        details: s.s({ location: saveLocation }),
                        size: k.filesize,
                        end: k.endTime,
                        href: ''
                    }
                });
                s.setCloudDiskUsedForGroup(groupKey, {
                    amount: k.filesizeMB,
                    storageType: 's3'
                });
                s.purgeCloudDiskForGroup(e, 's3');
            }
        }catch(err){
            response.err = err.toString()
        }
        return response;
    }
    async function onInsertTimelapseFrame(monitorObject, queryInfo, filePath){
        //retryCount = max attempts (default 10, 0 = infinite)
        var e = monitorObject;
        if(!(s.group[e.ke].aws_s3 && s.group[e.ke].init.use_aws_s3 !== '0' && s.group[e.ke].init.aws_s3_save === '1')){
            return;
        }
        const retryValue = parseInt(s.group[e.ke].init.aws_s3_retryCount)
        const retryCount = isNaN(retryValue) ? 10 : retryValue
        const saveLocation = s.group[e.ke].init.aws_s3_dir + e.ke + '/' + e.mid + '_timelapse/' + queryInfo.filename;
        const infiniteRetry = retryCount === 0;

        // Single attempt: builds a *fresh* stream each call and always tears it down.
        function attemptUpload(){
            return new Promise((resolve) => {
                let fileStream = fs.createReadStream(filePath);
                let settled = false;

                const finish = (result) => {
                    if(settled) return;
                    settled = true;
                    try {
                        if(fileStream && !fileStream.destroyed){
                            fileStream.destroy();
                        }
                    } catch(_) {}
                    fileStream = null; // drop reference so GC can collect SDK-side buffers
                    resolve(result);
                };

                fileStream.on('error', function(err){
                    console.error(err);
                    finish({ ok: false, err: err });
                });

                uploadObject(e.ke, {
                    Bucket: s.group[e.ke].init.aws_s3_bucket,
                    Key: saveLocation,
                    Body: fileStream,
                    ContentType: 'image/jpeg'
                }).then((response) => {
                    finish(response || { ok: false, err: 'No response from uploadObject' });
                }).catch((err) => {
                    finish({ ok: false, err: err });
                });
            });
        }

        let attempt = 0;
        let response = { ok: false, err: 'No upload attempt was made' };

        while(infiniteRetry || attempt < retryCount){
            attempt++;
            response = await attemptUpload();
            if(response.ok) break;

            const willRetry = infiniteRetry || attempt < retryCount;
            if(willRetry){
                // exponential backoff, capped at 60s
                const delayMs = Math.min(1000 * Math.pow(2, Math.min(attempt - 1, 6)), 60000);
                console.log(`S3 timelapse upload failed (attempt ${attempt}${infiniteRetry ? '' : '/' + retryCount}), retrying in ${delayMs}ms:`, response.err);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        if(response.err){
            s.userLog(e, { type: lang['Wasabi Hot Cloud Storage Upload Error'], msg: response.err });
        }
        if(s.group[e.ke].init.aws_s3_log === '1' && response.ok){
            await s.knexQuery({
                action: "insert",
                table: "Cloud Timelapse Frames",
                insert: {
                    mid: queryInfo.mid,
                    ke: queryInfo.ke,
                    time: queryInfo.time,
                    filename: queryInfo.filename,
                    type: 's3',
                    details: s.s({ location: saveLocation }),
                    size: queryInfo.size,
                    href: ''
                }
            });
            s.setCloudDiskUsedForGroup(e.ke, {
                amount: s.kilobyteToMegabyte(queryInfo.size),
                storageType: 's3'
            }, 'timelapseFrames');
            s.purgeCloudDiskForGroup(e, 's3', 'timelapseFrames');
        }

        return response;
    }
    async function onDeleteTimelapseFrameFromCloud(e, frame, callback){
        // e = user
        //retryCount = max attempts (default 10, 0 = infinite)
        const retryValue = parseInt(s.group[e.ke].init.aws_s3_retryCount)
        const retryCount = isNaN(retryValue) ? 10 : retryValue
        var frameDetails;
        try {
            frameDetails = JSON.parse(frame.details);
        } catch(err){
            frameDetails = frame.details;
        }
        if(video.type !== 's3'){
            if(callback) callback();
            return { ok: true, skipped: true };
        }
        if(!frameDetails.location){
            frameDetails.location = frame.href.split(locationUrl)[1];
        }
        const infiniteRetry = retryCount === 0;
        function attemptDelete(){
            return new Promise((resolve) => {
                deleteObject(e.ke, {
                    Bucket: s.group[e.ke].init.aws_s3_bucket,
                    Key: frameDetails.location,
                }).then((response) => {
                    resolve(response || { ok: false, err: 'No response from deleteObject' });
                }).catch((err) => {
                    resolve({ ok: false, err: err });
                });
            });
        }

        let attempt = 0;
        let response = { ok: false, err: 'No delete attempt was made' };

        while(infiniteRetry || attempt < retryCount){
            attempt++;
            response = await attemptDelete();
            if(response.ok) break;

            const willRetry = infiniteRetry || attempt < retryCount;
            if(willRetry){
                // exponential backoff, capped at 60s
                const delayMs = Math.min(1000 * Math.pow(2, Math.min(attempt - 1, 6)), 60000);
                console.log(`S3 delete failed (attempt ${attempt}${infiniteRetry ? '' : '/' + retryCount}), retrying in ${delayMs}ms:`, response.err);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        if(response.err){
            console.error('Amazon S3 DELETE Error');
            console.error(response.err);
        }

        if(callback) callback(response);
        return response;
    }
    async function onGetVideoData(video){
        const videoDetails = s.parseJSON(video.details)
        const saveLocation = videoDetails.location
        var fileStream = await getObject(video.ke,{
            Bucket: s.group[video.ke].init.aws_s3_bucket,
            Key: saveLocation,
        });
        return fileStream.Body
    }
    //amazon s3
    s.addCloudUploader({
        name: 's3',
        loadGroupAppExtender: loadGroupApp,
        unloadGroupAppExtender: unloadGroupApp,
        insertCompletedVideoExtender: uploadVideo,
        deleteVideoFromCloudExtensions: deleteVideo,
        cloudDiskUseStartupExtensions: cloudDiskUseStartup,
        beforeAccountSave: beforeAccountSave,
        onAccountSave: cloudDiskUseStartup,
        onInsertTimelapseFrame: (() => {}) || onInsertTimelapseFrame,
        onDeleteTimelapseFrameFromCloud: (() => {}) || onDeleteTimelapseFrameFromCloud,
        onGetVideoData
    })
    //return fields that will appear in settings
    return {
       "evaluation": "details.use_aws_s3 !== '0'",
       "name": lang["Amazon S3"],
       "color": "forestgreen",
       "uploaderId": 's3',
       "info": [
           {
              "name": "detail=aws_s3_save",
              "selector":"autosave_aws_s3",
              "field": lang.Autosave,
              "description": "",
              "default": lang.No,
              "example": "",
              "fieldType": "select",
              "possible": [
                  {
                     "name": lang.No,
                     "value": "0"
                  },
                  {
                     "name": lang.Yes,
                     "value": "1"
                  }
              ]
           },
           {
              "hidden": true,
              "field": lang.Bucket,
              "name": "detail=aws_s3_bucket",
              "placeholder": "Example : slippery-seal",
              "form-group-class": "autosave_aws_s3_input autosave_aws_s3_1",
              "description": "",
              "default": "",
              "example": "",
              "possible": ""
           },
           {
               "hidden": true,
              "field": lang.aws_accessKeyId,
              "name": "detail=aws_accessKeyId",
              "form-group-class": "autosave_aws_s3_input autosave_aws_s3_1",
              "description": "",
              "default": "",
              "example": "",
              "possible": ""
           },
           {
               "hidden": true,
              "name": "detail=aws_secretAccessKey",
              "fieldType":"password",
              "placeholder": "",
              "field": lang.aws_secretAccessKey,
              "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
              "description": "",
              "default": "",
              "example": "",
              "possible": ""
           },
           {
               "hidden": true,
              "name": "detail=aws_region",
              "field": lang.Region,
              "fieldType": "select",
              "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
              "description": "",
              "default": "",
              "example": "",
              "possible": [
                    {
                        "name": "US West (N. California)",
                        "value": "us-west-1"
                    },
                    {
                        "name": "US West (Oregon)",
                        "value": "us-west-2"
                    },
                    {
                        "name": "US East (Ohio)",
                        "value": "us-east-2"
                    },
                    {
                        "name": "US East (N. Virginia)",
                        "value": "us-east-1"
                    },
                    {
                        "name": "Canada (Central)",
                        "value": "ca-central-1"
                    },
                    {
                        "name": "South America (São Paulo)",
                        "value": "sa-east-1"
                    },
                    {
                        "name": "EU (Frankfurt)",
                        "value": "eu-central-1"
                    },
                    {
                        "name": "EU (Ireland)",
                        "value": "eu-west-1"
                    },
                    {
                        "name": "EU (London)",
                        "value": "eu-west-2"
                    },
                    {
                        "name": "EU (Paris)",
                        "value": "eu-west-3"
                    },
                    {
                        "name": "Europe (Milan)",
                        "value": "eu-south-1"
                    },
                    {
                        "name": "Europe (Spain)",
                        "value": "eu-south-2"
                    },
                    {
                        "name": "Europe (Zurich)",
                        "value": "eu-central-2"
                    },
                    {
                        "name": "Asia Pacific (Mumbai)",
                        "value": "ap-south-1"
                    },
                    {
                        "name": "Asia Pacific (Seoul)",
                        "value": "ap-northeast-2"
                    },
                    {
                        "name": "Asia Pacific (Osaka-Local)**",
                        "value": "ap-northeast-3"
                    },
                    {
                        "name": "Asia Pacific (Singapore)",
                        "value": "ap-southeast-1"
                    },
                    {
                        "name": "Asia Pacific (Sydney)",
                        "value": "ap-southeast-2"
                    },
                    {
                        "name": "Asia Pacific (Tokyo)",
                        "value": "ap-northeast-1"
                    },
                    {
                        "name": "Asia Pacific (Hong Kong)",
                        "value": "ap-east-1"
                    },
                    {
                        "name": "Asia Pacific (Hyderabad)",
                        "value": "ap-south-2"
                    },
                    {
                        "name": "Asia Pacific (Jakarta)",
                        "value": "ap-southeast-3"
                    },
                    {
                        "name": "Asia Pacific (Melbourne)",
                        "value": "ap-southeast-4"
                    },
                    {
                        "name": "China (Beijing)",
                        "value": "cn-north-1"
                    },
                    {
                        "name": "China (Ningxia)",
                        "value": "cn-northwest-1"
                    },
                    {
                        "name": "Africa (Cape Town)",
                        "value": "af-south-1"
                    },
                    {
                        "name": "Middle East (Bahrain)",
                        "value": "me-south-1"
                    },
                    {
                        "name": "Middle East (UAE)",
                        "value": "me-central-1"
                    },
                    {
                        "name": "il-central-1",
                        "value": "il-central-1"
                    }
               ]
          },
           {
               "hidden": true,
               "name": "detail=aws_storage_class",
               "field": lang['Storage Class'],
               "fieldType": "select",
               "form-group-class": "autosave_aws_s3_input autosave_aws_s3_1",
               "description": "The storage class of the uploaded objects see https://aws.amazon.com/s3/storage-classes/",
               "default": StorageClass.STANDARD,
               "example": StorageClass.STANDARD,
               "possible": Object.keys(StorageClass).map(k => ({name: k, value: k})),
           },
          {
              "hidden": true,
             "name": "detail=aws_s3_log",
             "field": lang['Save Links to Database'],
             "fieldType": "select",
             "selector": "h_s3sld",
             "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
             "description": "",
             "default": "",
             "example": "",
             "possible": [
                 {
                    "name": lang.No,
                    "value": "0"
                 },
                 {
                    "name": lang.Yes,
                    "value": "1"
                 }
             ]
         },
         {
             "hidden": true,
            "name": "detail=use_aws_s3_size_limit",
            "field": lang['Use Max Storage Amount'],
            "fieldType": "select",
            "selector": "h_s3zl",
            "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
            "form-group-class-pre-layer":"h_s3sld_input h_s3sld_1",
            "description": "",
            "default": "",
            "example": "",
            "possible":  [
                {
                   "name": lang.No,
                   "value": "0"
                },
                {
                   "name": lang.Yes,
                   "value": "1"
                }
            ]
         },
         {
             "hidden": true,
            "attribute": `size-adjust='[detail=aws_s3_size_limit]'`,
            "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
            "form-group-class-pre-layer":"h_s3sld_input h_s3sld_1",
            "field": lang["Max Storage Amount"],
            "default": "10 GB",
         },
         {
             "hidden": true,
            "name": "detail=aws_s3_size_limit",
            "field": lang['Max Storage Amount'],
            "default": "10000",
         },
         {
             "hidden": true,
            "name": "detail=aws_s3_max_days",
            "field": lang['Number of Days to keep'],
            "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
            "form-group-class-pre-layer":"h_s3sld_input h_s3sld_1",
            "example": "30",
         },
         {
             "hidden": true,
            "name": "detail=aws_s3_dir",
            "field": lang['Save Directory'],
            "form-group-class":"autosave_aws_s3_input autosave_aws_s3_1",
            "description": "",
            "default": "/",
            "example": "",
            "possible": ""
         },
         {
            "hidden": true,
            "field": lang['Retry Count'],
            "description": lang.uploaderRetryCountText,
            "name": "detail=aws_s3_retryCount",
            "placeholder": "10 is Default, 0 is Infinite",
            "form-group-class": "autosave_aws_s3_input autosave_aws_s3_1",
            "default": "10",
         }
       ]
    }
}
