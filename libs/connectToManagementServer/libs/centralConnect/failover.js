module.exports = (centralConnection, parentPort) => {
    const config = centralConnection.config;
    if(config.isFailoverServer){
        console.log('Engaged as Failover Server for Central Connection')
        const hostPeerServer = centralConnection.hostPeerServer;
        const peerConnectKey = centralConnection.peerConnectKey;
        const {
            getAllData,
            deleteAllData,
            insertAllData,
        } = require('../../../backup/utils.js')(centralConnection, config)

        centralConnection.onIncomingMessage('getAllData', (data, requestId) => {
            const response = await getAllData();
            outboundMessage('getAllData', response, requestId)
        })
        centralConnection.onIncomingMessage('insertAllData', (data, requestId) => {
            const response = await insertAllData(data);
            outboundMessage('insertAllData', response, requestId)
        })
        centralConnection.onIncomingMessage('deleteAllData', (data, requestId) => {
            const response = await deleteAllData();
            outboundMessage('deleteAllData', response, requestId)
        })
    }
}
