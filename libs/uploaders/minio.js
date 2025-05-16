const fs = require('fs');
module.exports = function(s, config, lang) {
    if(!config.enableMinIOBackup){
        return {}
    }
    try{
        require('minio')
    }catch(err){
        console.log()
        return {}
    }
    const { Client } = require('minio');
    const minioRequest = async (groupKey, actionName, requestOptions) => {
        const response = { ok: true }
        try {
            await s.group[groupKey].minio[actionName](...requestOptions);
        } catch (err) {
            console.error('Minio minioRequest', groupKey, requestOptions)
            console.error('Minio minioRequest ERR', err)
            response.ok = false
            response.err = err
        }
        return response;
    };

    const deleteObject = async (groupKey, options) => {
        return await minioRequest(groupKey, 'removeObject', [options.Bucket, options.Key]);
    };

    const uploadObject = async (groupKey, options) => {
        return await minioRequest(groupKey, 'putObject', [options.Bucket, options.Key, options.Body, null, {
            'Content-Type': options.ContentType
        }]);
    };

    const getObject = async (groupKey, options) => {
        return await minioRequest(groupKey, 'getObject', [options.Bucket, options.Key]);
    };

    function beforeAccountSave(d) {
        d.formDetails.minio_use_global = d.d.minio_use_global;
        d.formDetails.use_minio = d.d.use_minio;
    }

    function cloudDiskUseStartup(group, userDetails) {
        group.cloudDiskUse['minio'].name = 'MinIO Storage';
        group.cloudDiskUse['minio'].maxDays = parseInt(userDetails.minio_max_days);
        group.cloudDiskUse['minio'].sizeLimitCheck = (userDetails.use_minio_size_limit === '1');

        if (!userDetails.minio_size_limit || userDetails.minio_size_limit === '') {
            group.cloudDiskUse['minio'].sizeLimit = 10000;
        } else {
            group.cloudDiskUse['minio'].sizeLimit = parseFloat(userDetails.minio_size_limit);
        }
    }

    function loadGroupApp(e) {
        var userDetails = JSON.parse(e.details);

        if (userDetails.minio_use_global === '1' && config.cloudUploaders && config.cloudUploaders.MinIO) {
            userDetails = Object.assign(userDetails, config.cloudUploaders.MinIO);
        }

        if (
            !s.group[e.ke].minio &&
            userDetails.minio !== '0' &&
            userDetails.minio_accessKeyId !== '' &&
            userDetails.minio_secretAccessKey &&
            userDetails.minio_secretAccessKey !== '' &&
            userDetails.minio_bucket !== ''
        ) {
            if (!userDetails.minio_dir || userDetails.minio_dir === '/') {
                userDetails.minio_dir = '';
            }

            if (userDetails.minio_dir) {
                userDetails.minio_dir = s.checkCorrectPathEnding(userDetails.minio_dir);
            }

            if (!userDetails.minio_endpoint) {
                userDetails.minio_endpoint = 'localhost:9000';
            }

            if (userDetails.minio_endpoint.indexOf('://') === -1) {
                userDetails.minio_endpoint = `http://${userDetails.minio_endpoint}`;
            }

            const endpointParts = userDetails.minio_endpoint.replace(/https?:\/\//, '').split(':');
            const port = endpointParts.length > 1 ? parseInt(endpointParts[1]) :
                        userDetails.minio_endpoint.startsWith('https') ? 443 : 9000;
            const host = endpointParts[0];

            s.group[e.ke].minio = new Client({
                endPoint: host,
                port: port,
                useSSL: userDetails.minio_endpoint.startsWith('https'),
                accessKey: userDetails.minio_accessKeyId,
                secretKey: userDetails.minio_secretAccessKey,
                region: userDetails.minio_region || undefined,
                pathStyle: true // MinIO requires path-style access
            });
        }
    }

    function unloadGroupApp(user) {
        s.group[user.ke].minio = null;
    }

    function deleteVideo(e, video, callback) {
        try {
            var videoDetails = JSON.parse(video.details);
        } catch (err) {
            var videoDetails = video.details;
        }

        if (video.type !== 'minio') {
            callback();
            return;
        }

        deleteObject(video.ke, {
            Bucket: s.group[video.ke].init.minio_bucket,
            Key: videoDetails.location,
        }).then((response) => {
            if (response.err) {
                console.error('MinIO Storage DELETE Error');
                console.error(response.err);
            }
            callback();
        });
    }

    function uploadVideo(e, k, insertQuery) {
        if (!k) k = {};

        const groupKey = insertQuery.ke;
        if (s.group[groupKey].minio && s.group[groupKey].init.use_minio !== '0' && s.group[groupKey].init.minio_save === '1') {
            const filename = `${s.formattedTime(insertQuery.time)}.${insertQuery.ext}`;
            var fileStream = fs.createReadStream(k.dir + filename);

            fileStream.on('error', function(err) {
                console.error(err);
            });

            var saveLocation = s.group[groupKey].init.minio_dir + groupKey + '/' + e.mid + '/' + filename;

            uploadObject(groupKey, {
                Bucket: s.group[groupKey].init.minio_bucket,
                Key: saveLocation,
                Body: fileStream,
                ContentType: 'video/' + e.ext
            }).then((response) => {
                if (response.err) {
                    s.userLog(e, { type: lang['MinIO Storage Upload Error'], msg: response.err });
                }

                if (s.group[groupKey].init.minio_log === '1' && response.ok) {
                    s.knexQuery({
                        action: "insert",
                        table: "Cloud Videos",
                        insert: {
                            mid: e.mid,
                            ke: groupKey,
                            ext: insertQuery.ext,
                            time: insertQuery.time,
                            status: 1,
                            type: 'minio',
                            details: s.s({
                                location: saveLocation
                            }),
                            size: k.filesize,
                            end: k.endTime,
                            href: ''
                        }
                    });

                    s.setCloudDiskUsedForGroup(groupKey, {
                        amount: k.filesizeMB,
                        storageType: 'minio'
                    });

                    s.purgeCloudDiskForGroup(e, 'minio');
                }
            });
        }
    }

    function onInsertTimelapseFrame(monitorObject, queryInfo, filePath) {
        var e = monitorObject;
        if (s.group[e.ke].minio && s.group[e.ke].init.use_minio !== '0' && s.group[e.ke].init.minio_save === '1') {
            var fileStream = fs.createReadStream(filePath);

            fileStream.on('error', function(err) {
                console.error(err);
            });

            var saveLocation = s.group[e.ke].init.minio_dir + e.ke + '/' + e.mid + '_timelapse/' + queryInfo.filename;

            uploadObject(e.ke, {
                Bucket: s.group[e.ke].init.minio_bucket,
                Key: saveLocation,
                Body: fileStream,
                ContentType: 'image/jpeg'
            }).then((response) => {
                if (response.err) {
                    s.userLog(e, { type: lang['MinIO Storage Upload Error'], msg: response.err });
                }

                if (s.group[e.ke].init.minio_log === '1' && response.ok) {
                    s.knexQuery({
                        action: "insert",
                        table: "Cloud Timelapse Frames",
                        insert: {
                            mid: queryInfo.mid,
                            ke: queryInfo.ke,
                            time: queryInfo.time,
                            filename: queryInfo.filename,
                            type: 'minio',
                            details: s.s({
                                location: saveLocation
                            }),
                            size: queryInfo.size,
                            href: ''
                        }
                    });

                    s.setCloudDiskUsedForGroup(e.ke, {
                        amount: s.kilobyteToMegabyte(queryInfo.size),
                        storageType: 'minio'
                    }, 'timelapseFrames');

                    s.purgeCloudDiskForGroup(e, 'minio', 'timelapseFrames');
                }
            });
        }
    }

    function onDeleteTimelapseFrameFromCloud(e, frame, callback) {
        try {
            var frameDetails = JSON.parse(frame.details);
        } catch (err) {
            var frameDetails = frame.details;
        }

        if (frame.type !== 'minio') {
            callback();
            return;
        }

        if (!frameDetails.location) {
            frameDetails.location = frame.href.split(locationUrl)[1];
        }

        deleteObject(e.ke, {
            Bucket: s.group[e.ke].init.minio_bucket,
            Key: frameDetails.location,
        }).then((response) => {
            if (response.err) {
                console.error('MinIO Storage DELETE Error');
                console.error(response.err);
            }
            callback();
        });
    }

    async function onGetVideoData(video) {
        const videoDetails = s.parseJSON(video.details);
        const saveLocation = videoDetails.location;

        var fileStream = await getObject(video.ke, {
            Bucket: s.group[video.ke].init.minio_bucket,
            Key: saveLocation,
        });

        return fileStream;
    }

    s.addCloudUploader({
        name: 'minio',
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
    });

    return {
        "evaluation": "details.use_minio !== '0'",
        "name": lang["MinIO"],
        "color": "forestgreen",
        "uploaderId": 'minio',
        "info": [
            {
                "name": "detail=minio_save",
                "selector": "autosave_minio",
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
                "field": lang['Endpoint Address'],
                "name": "detail=minio_endpoint",
                "placeholder": "localhost:9000",
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "form-group-class-pre-layer": "h_minio_endpoint_input h_minio_endpoint_"
            },
            {
                "hidden": true,
                "field": lang.Bucket,
                "name": "detail=minio_bucket",
                "placeholder": "Example: my-bucket",
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "description": "",
                "default": "",
                "example": "",
                "possible": ""
            },
            {
                "hidden": true,
                "field": lang.aws_accessKeyId,
                "name": "detail=minio_accessKeyId",
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "description": "",
                "default": "",
                "example": "",
                "possible": ""
            },
            {
                "hidden": true,
                "name": "detail=minio_secretAccessKey",
                "fieldType": "password",
                "placeholder": "",
                "field": lang.aws_secretAccessKey,
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "description": "",
                "default": "",
                "example": "",
                "possible": ""
            },
            {
                "hidden": true,
                "name": "detail=minio_region",
                "field": lang.Region,
                "fieldType": "select",
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "description": "",
                "default": "",
                "example": "",
                "possible": [
                    {
                        "name": lang['No Region'],
                        "value": ""
                    },
                    {
                        "name": "us-east-1",
                        "value": "us-east-1"
                    },
                    {
                        "name": "us-west-1",
                        "value": "us-west-1"
                    },
                    {
                        "name": "eu-west-1",
                        "value": "eu-west-1"
                    },
                    {
                        "name": "Custom Region",
                        "value": "custom"
                    }
                ]
            },
            {
                "hidden": true,
                "name": "detail=minio_log",
                "field": lang['Save Links to Database'],
                "fieldType": "select",
                "selector": "h_miniosld",
                "form-group-class": "autosave_minio_input autosave_minio_1",
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
                "name": "detail=use_minio_size_limit",
                "field": lang['Use Max Storage Amount'],
                "fieldType": "select",
                "selector": "h_minioszl",
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "form-group-class-pre-layer": "h_miniosld_input h_miniosld_1",
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
                "attribute": `size-adjust='[detail=minio_size_limit]'`,
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "form-group-class-pre-layer": "h_miniosld_input h_miniosld_1",
                "field": lang["Max Storage Amount"],
                "default": "10 GB",
            },
            {
                "hidden": true,
                "name": "detail=minio_size_limit",
                "field": lang['Max Storage Amount'],
                "default": "10000",
            },
            {
                "hidden": true,
                "name": "detail=minio_max_days",
                "field": lang['Number of Days to keep'],
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "form-group-class-pre-layer": "h_miniosld_input h_miniosld_1",
                "example": "30",
            },
            {
                "hidden": true,
                "name": "detail=minio_dir",
                "field": lang['Save Directory'],
                "form-group-class": "autosave_minio_input autosave_minio_1",
                "description": "",
                "default": "/",
                "example": "",
                "possible": ""
            },
        ]
    };
};
