const { parentPort, isMainThread } = require('worker_threads');
if(isMainThread){
    console.log(`DAM VMS now runs cron.js as a worker process from camera.js.`)
    console.error(`DAM VMS now runs cron.js as a worker process from camera.js.`)
    setInterval(() => {
        // console.log(`Please turn off cron.js process.`)
    },1000 * 60 * 60 * 24 * 7)
    return;
}
