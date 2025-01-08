module.exports = function(s,config,lang,app,io){
    const loadedConditions = {}
    const loadedActions = {}
    function loadedConditionsHandler(){
        for(extension of s.availableExtensions){
            const extensionName = extension.name;
            const groupKey = extension.ke;
            const extensionId = `${groupKey}_${extensionName}`;
            if(!loadedConditions[extensionId])loadedConditions[extensionId] = [];
            s[extensionName](async function(...args){
                for(condition of loadedConditions[extensionId]){
                    loadedActions[]()
                }
            })
        }
    }
    async function getPipelines(groupKey){
        const { rows } = await s.knexQueryPromise({
            action: "select",
            columns: "*",
            table: "Pipelines",
            where: { ke: groupKey }
        });
        return rows
    }
    function loadPipeline({ ke, name, conditions, actions, created, updated }){

    }
    function loadPipelines(){

    }
}
