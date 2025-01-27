var {isClient, defaultConfig, npmCheckAndInstall} = require('../utils')

module.exports = {

    shouldApply: isClient('sqlite'),

    apply: function (config) {
        config.client = 'sqlite3'
        config.useNullAsDefault = true
    },

    install: npmCheckAndInstall('sqlite3')
}