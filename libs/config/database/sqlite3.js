var {isClient, defaultConfig, npmCheckAndInstall} = require('../utils')

module.exports = {

    shouldApply: isClient('sqlite3'),

    apply: function (config) {
        if (config.connection.filename === undefined) {
            config.connection.filename = config.mainDirectory + "/shinobi.sqlite"
        }
    },


}