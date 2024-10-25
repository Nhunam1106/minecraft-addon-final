import { world } from "@minecraft/server";
import { Vector } from "./vector";
export var Groups;
(function (Groups) {
    const overworld = world.getDimension("overworld");
    // need to group players based off of their distances
    // if two players are within 12 blocks (no y) they are a group
    // if not, they are seperate
    // need to return a list of points that can be used to spawn in the effects
    function getGroupLocations(range) {
        let locations = [];
        for (const player of overworld.getPlayers()) {
            if (locations.length == 0) {
                locations.push(player.location);
                continue;
            }
            if (!isNear(locations, player, range)) {
                locations.push(player.location);
            }
        }
        // this should be all that is required.
        return locations;
    }
    Groups.getGroupLocations = getGroupLocations;
    function getGroupPlayers(range) {
        let locations = [];
        let players = [];
        for (const player of overworld.getPlayers()) {
            if (locations.length == 0) {
                locations.push(player.location);
                players.push(player);
                continue;
            }
            if (!isNear(locations, player, range)) {
                locations.push(player.location);
                players.push(player);
            }
        }
        // this should be all that is required.
        return players;
    }
    Groups.getGroupPlayers = getGroupPlayers;
    function isNear(locations, player, range) {
        for (const rawPos of locations) {
            let rawPosAligned = { x: rawPos.x, y: 0, z: rawPos.z };
            let playerPos = { x: player.location.x, y: 0, z: player.location.z };
            if (Vector.distance(rawPosAligned, playerPos) < range) {
                return true;
            }
        }
        return false;
    }
})(Groups || (Groups = {}));
