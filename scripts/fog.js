import { world } from "@minecraft/server";
import { getOrCreateScoreboard } from "./util";
export var Fog;
(function (Fog) {
    const fogScoreboard = getOrCreateScoreboard("spark_disasters:fogs");
    const fogMapping = new Map();
    const dimension = world.getDimension("overworld");
    const fogOnPlayers = new Map();
    const fogPriority = new Map();
    function init() {
        // load from board
        let parts = fogScoreboard.getParticipants();
        // clear board
        for (const p of parts) {
            fogScoreboard.removeParticipant(p);
        }
    }
    Fog.init = init;
    // TODO: add a system to track default effect fogs.
    // a register fog function that will map what needs checking
    // board entry, fog id
    function register(shortName, fullIdentifier, priority = 0) {
        if (!fogMapping.has(shortName)) {
            fogMapping.set(shortName, fullIdentifier);
            if (!fogPriority.has(shortName))
                fogPriority.set(shortName, priority);
        }
    }
    Fog.register = register;
    // tick function that will check for active fogs and set them on all players
    function setFogOnAll(shortName) {
        if (fogMapping.has(shortName)) {
            for (const player of dimension.getPlayers()) {
                setFogOnPlayer(player, shortName);
            }
        }
    }
    Fog.setFogOnAll = setFogOnAll;
    function removeAllFogOnAllPlayers() {
        for (const player of dimension.getPlayers()) {
            removeAllFogOnPlayer(player);
        }
        removeAllFromScoreboard();
    }
    Fog.removeAllFogOnAllPlayers = removeAllFogOnAllPlayers;
    function removeAllFogOnPlayer(player) {
        for (const fog of fogMapping) {
            player.runCommandAsync(`fog @s remove ${fog[0]}`);
        }
    }
    Fog.removeAllFogOnPlayer = removeAllFogOnPlayer;
    function removeFogOnPlayer(player, shortName) {
        if (fogMapping.has(shortName)) {
            if (fogOnPlayers.has(player.id))
                fogOnPlayers.delete(player.id);
            player.runCommandAsync(`fog @s remove ${shortName}`);
        }
    }
    Fog.removeFogOnPlayer = removeFogOnPlayer;
    function setFogOnPlayer(player, shortName) {
        let currnetFog = "";
        let currnetFogPrio = 0;
        if (fogOnPlayers.has(player.id)) {
            currnetFog = fogOnPlayers.get(player.id);
            if (fogPriority.has(currnetFog))
                currnetFogPrio = fogPriority.get(currnetFog);
        }
        // if (currnetFog == shortName) return;
        let newFogPrio = 0;
        if (fogPriority.has(shortName))
            newFogPrio = fogPriority.get(shortName);
        if (newFogPrio < currnetFogPrio)
            return;
        // set on mapping
        fogOnPlayers.set(player.id, shortName);
        let value = fogMapping.get(shortName);
        if (currnetFog != "")
            player.runCommandAsync(`fog @s pop ${currnetFog}`);
        player.runCommandAsync(`fog @s push ${value} ${shortName}`);
    }
    Fog.setFogOnPlayer = setFogOnPlayer;
    function removeAllFromScoreboard() {
        for (const parts of fogScoreboard.getParticipants()) {
            fogScoreboard.removeParticipant(parts);
        }
    }
    world.afterEvents.playerSpawn.subscribe((event) => {
        let player = event.player;
        removeAllFogOnPlayer(player);
    });
    world.afterEvents.playerDimensionChange.subscribe((event) => {
        let toDim = event.toDimension;
        if (toDim.id != "overworld") {
            removeAllFogOnPlayer(event.player);
        }
        if (toDim.id == "overworld") {
            if (fogOnPlayers.has(event.player.id)) {
                setFogOnPlayer(event.player, fogOnPlayers.get(event.player.id));
                return;
            }
            // else do nothing I guess.
        }
    });
})(Fog || (Fog = {}));
