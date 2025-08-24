subscribeWhenReady(
    "removeTrashCan",
    function(){ $(CONFIG.element.trashCan+"Btn").remove() },
    {waitFor: CONFIG.element.trashCan},
)
