const WebSocket = require('cws');
// const centralManagementSocket = new WebSocket('ws://central-management-server-url');
function createWebSocketServer(options){
    const theWebSocket = new WebSocket.Server(options ? options : {
        noServer: true
    });
    theWebSocket.broadcast = function(data) {
      theWebSocket.clients.forEach((client) => {
           try{
               client.sendData(data)
           }catch(err){
               // console.log(err)
           }
      })
    };
    return theWebSocket
}
function createWebSocketClient(connectionHost,options){
    const clientConnection = new WebSocket(connectionHost, options.engineOptions);
    if(options.onMessage){
        const onMessage = options.onMessage;
        clientConnection.on('message', message => {
            const data = JSON.parse(message);
            onMessage(data);
        });
    }
    return clientConnection
}

function sendToCentralManagement(data) {
    console.log('Sending data to central management server: ', data);
    // if (centralManagementSocket.readyState === WebSocket.OPEN) {
    //     centralManagementSocket.send(JSON.stringify(data));
    // } else {
    //     console.error('WebSocket is not connected to the central management server.');
    // }
}

module.exports = {
    createWebSocketServer,
    createWebSocketClient
}
