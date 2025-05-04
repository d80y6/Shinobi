module.exports = (s,config) => {
    // Monitors
    async function getAllMonitors(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Monitors",
        })
        return rows
    }
    async function deleteAllMonitors(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Monitors",
        })
    }
    async function insertMonitors(monitors){
        const insertResponses = []
        for(monitor of monitors){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Monitors",
                insert: monitor
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Users
    async function getAllUsers(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Users",
        })
        return rows
    }
    async function deleteAllUsers(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Users",
        })
    }
    async function insertUsers(users){
        const insertResponses = []
        for(user of users){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Users",
                insert: user
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // API Keys
    async function getAllApiKeys(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "API",
        })
        return rows
    }
    async function deleteAllApiKeys(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "API",
        })
    }
    async function insertApiKeys(users){
        const insertResponses = []
        for(apiKey of apiKeys){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "API",
                insert: apiKey
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Presets
    async function getAllPresets(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Presets",
        })
        return rows
    }
    async function deleteAllPresets(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Presets",
        })
    }
    async function insertPresets(rows){
        const insertResponses = []
        for(row of rows){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Presets",
                insert: row
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Schedules
    async function getAllSchedules(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Schedules",
        })
        return rows
    }
    async function deleteAllSchedules(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Schedules",
        })
    }
    async function insertSchedules(rows){
        const insertResponses = []
        for(row of rows){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Schedules",
                insert: row
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Permission Sets
    async function getAllPermissionSets(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Permission Sets",
        })
        return rows
    }
    async function deleteAllPermissionSets(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Permission Sets",
        })
    }
    async function insertPermissionSets(rows){
        const insertResponses = []
        for(row of rows){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Permission Sets",
                insert: row
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Custom Settings
    async function getAllCustomSettings(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Custom Settings",
        })
        return rows
    }
    async function deleteAllCustomSettings(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "Custom Settings",
        })
    }
    async function insertCustomSettings(rows){
        const insertResponses = []
        for(row of rows){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "Custom Settings",
                insert: row
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // Login Tokens
    async function getAllLoginTokens(){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "LoginTokens",
        })
        return rows
    }
    async function deleteAllLoginTokens(){
        return await s.knexQueryPromise({
            action: "delete",
            table: "LoginTokens",
        })
    }
    async function insertLoginTokens(rows){
        const insertResponses = []
        for(row of rows){
            var insertResponse = await s.knexQueryPromise({
                action: "insert",
                table: "LoginTokens",
                insert: row
            });
            insertResponses.push(insertResponse)
        }
        return insertResponses
    }
    // all data
    function getAllData(){
        const monitors = await getAllMonitors()
        const users = await getAllUsers()
        const apiKeys = await getAllApiKeys()
        const presets = await getAllPresets()
        const schedules = await getAllSchedules()
        const permissionSets = await getAllPermissionSets()
        const customSettings = await getAllCustomSettings()
        const loginTokens = await getAllLoginTokens()
        return {
            monitors,
            users,
            apiKeys,
            presets,
            schedules,
            permissionSets,
            customSettings,
            loginTokens,
        }
    }
    function deleteAllData(){
        const monitors = await deleteAllMonitors()
        const users = await deleteAllUsers()
        const apiKeys = await deleteAllApiKeys()
        const presets = await deleteAllPresets()
        const schedules = await deleteAllSchedules()
        const permissionSets = await deleteAllPermissionSets()
        const customSettings = await deleteAllCustomSettings()
        const loginTokens = await deleteAllLoginTokens()
        return {
            monitors,
            users,
            apiKeys,
            presets,
            schedules,
            permissionSets,
            customSettings,
            loginTokens,
        }
    }
    function insertAllData({
        monitors,
        users,
        apiKeys,
        presets,
        schedules,
        permissionSets,
        customSettings,
        loginTokens,
    }){
        const monitorsResponse = await insertAllMonitors(monitors)
        const usersResponse = await insertAllUsers(users)
        const apiKeysResponse = await insertAllApiKeys(apiKeys)
        const presetsResponse = await insertAllPresets(presets)
        const schedulesResponse = await insertAllSchedules(schedules)
        const permissionSetsResponse = await insertAllPermissionSets(permissionSets)
        const customSettingsResponse = await insertAllCustomSettings(customSettings)
        const loginTokensResponse = await insertAllLoginTokens(loginTokens)
        return {
            monitorsResponse,
            usersResponse,
            apiKeysResponse,
            presetsResponse,
            schedulesResponse,
            permissionSetsResponse,
            customSettingsResponse,
            loginTokensResponse,
        }
    }
    return {
        getAllMonitors,
        deleteAllMonitors,
        insertMonitors,
        getAllUsers,
        deleteAllUsers,
        insertUsers,
        getAllApiKeys,
        deleteAllApiKeys,
        insertApiKeys,
        getAllPresets,
        deleteAllPresets,
        insertPresets,
        getAllSchedules,
        deleteAllSchedules,
        insertSchedules,
        getAllPermissionSets,
        deleteAllPermissionSets,
        insertPermissionSets,
        getAllCustomSettings,
        deleteAllCustomSettings,
        insertCustomSettings,
        getAllLoginTokens,
        deleteAllLoginTokens,
        insertLoginTokens,
        getAllData,
        deleteAllData,
        insertAllData,
    }
}
