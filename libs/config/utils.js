function isClient(client) {
    return function (databaseOptions) {
        return databaseOptions.client === client
    }
}

function npmCheckAndInstall(name) {
    return function (databaseOptions) {
        try {
            require(name)
        } catch (err) {
            console.log(`Installing ${name} Module...`)
            require('child_process').execSync(`npm install ${name} --unsafe-perm`)
        }
    }
}

module.exports = {isClient, npmCheckAndInstall}