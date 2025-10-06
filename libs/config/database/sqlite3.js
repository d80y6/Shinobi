var {isClient, defaultConfig, npmCheckAndInstall} = require('../utils')

module.exports = {

    shouldApply: isClient('sqlite3'),

    apply: function (databaseOptions) {
        if (databaseOptions.connection.filename === undefined) {
            databaseOptions.connection.filename = databaseOptions.mainDirectory + "/shinobi.sqlite"
        }
    },


}