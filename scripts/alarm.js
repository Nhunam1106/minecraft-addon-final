import { world } from "@minecraft/server";
import { getKeyFromBlock, getKeyFromVector, getOrCreateScoreboard, getVectorFromBlockKey, isBlockAtLocation, isBlockLoaded, randomRange } from "./util";
import { Vector } from "./vector";
import { AnimatedBlock } from "./animatedBlock";
// namespace for processing the alarm stuffs
export var Alarm;
(function (Alarm) {
    const alarmLocationBoard = getOrCreateScoreboard("spark_disasters:alarm_locations");
    const alarmLocations = new Map();
    const overworld = world.getDimension("overworld");
    const alarmBlockId = "spark_disasters:alarm_block";
    const alarmEntityId = "spark_disasters:alarm_effect";
    const warnRange = 128;
    const visualRange = 48;
    const alarmEntityOffset = { x: 0.5, y: 0.5, z: 0.5 };
    const nextDisasterWarnThreashold = 20 * 60;
    let remainingTime = -1;
    let nextDisaster = undefined;
    let disasterTimes = new Set([
        1200, 600, 400, 200, 100, 40
    ]);
    // on alarm trigger
    // if a player is within the warn range, inform
    // if a player is within a visual range, trigger animation
    // if a player is within an entity visual range, spawn the alarm entity
    // if the alarm entity is not within visual range, despawn
    function init() {
        loadData();
    }
    Alarm.init = init;
    // trigger alert
    function setNextDisaster(disaster) {
        nextDisaster = disaster;
    }
    Alarm.setNextDisaster = setNextDisaster;
    function tick(remaining) {
        remainingTime = remaining;
        let players = overworld.getPlayers();
        // warnedPlayers.clear();
        for (const alarm of alarmLocations) {
            alarmLogic(alarm[1], players);
        }
    }
    Alarm.tick = tick;
    function alarmLogic(alarm, players) {
        if (nextDisaster == undefined)
            return;
        let isEarthquake = (nextDisaster === null || nextDisaster === void 0 ? void 0 : nextDisaster.disasterName) == "earthquake" ? true : false;
        // management
        let isLoaded = isBlockLoaded(alarm.location, overworld);
        if (!isLoaded)
            return;
        // check for existance, false = non existant, remove data and stuff
        let exists = isBlockAtLocation(overworld, alarm.location, alarmBlockId);
        if (!exists) {
            // test for the entity
            if (alarm.hasEntity) {
                let ent = overworld.getEntities({ location: Vector.add(alarm.location, Vector.up), maxDistance: 1, type: alarmEntityId });
                for (const e of ent) {
                    e.triggerEvent("spark_disasters:despawn");
                }
            }
            // remove from tracking and stuff
            let removeKey = getKeyFromVector(alarm.location);
            removeFromPartialKey(alarmLocationBoard, removeKey);
            alarmLocations.delete(removeKey);
            // remove from animated cache too
            return;
        }
        // if time is greater than disaster warn, reset animation, remove entity
        if (remainingTime > nextDisasterWarnThreashold && nextDisaster.isActive == false) {
            AnimatedBlock.playAnimation(alarm.location, "spark_disasters:alarm_block.off");
            let ent = overworld.getEntities({ location: Vector.add(alarm.location, Vector.up), maxDistance: 1, type: alarmEntityId });
            for (const e of ent) {
                e.triggerEvent("spark_disasters:despawn");
            }
            alarm.visualEntity = undefined;
            alarm.hasEntity = false;
        }
        // force stop the alarm stuffs hopefully
        if (remainingTime == 0) {
            AnimatedBlock.stopAnimation(alarm.location);
            let ent = overworld.getEntities({ location: Vector.add(alarm.location, Vector.up), maxDistance: 1, type: alarmEntityId });
            for (const e of ent) {
                e.triggerEvent("spark_disasters:despawn");
            }
            AnimatedBlock.playAnimation(alarm.location, "spark_disasters:alarm_block.off");
            alarm.visualEntity = undefined;
            alarm.hasEntity = false;
            return;
        }
        // earthquake issue here?
        if (disasterTimes.has(remainingTime)) {
            let print = true;
            if (isEarthquake) {
                let quake = nextDisaster;
                print = !quake.fissureExists();
            }
            if (nextDisaster.isActive == true) {
                print = false;
            }
            // this is very dumb... but its needed
            if (print) {
                for (const player of players) {
                    if (isPlayerInWarnRange(alarm, player)) {
                        warnPlayer(player, remainingTime);
                    }
                }
            }
        }
        if (nextDisaster != undefined) {
            if (nextDisaster.activeTime > 0) {
                remainingTime = 0 + nextDisaster.activeTime;
            }
        }
        // guard
        if (remainingTime > nextDisasterWarnThreashold && nextDisaster.isActive == false)
            return;
        // sound (ish), visuals.
        let visualRanage = isPlayerInVisualRange(alarm, players);
        if (visualRanage) {
            let hasEntity = alarm.hasEntity;
            if (!hasEntity) {
                // test for entity just in case
                let entites = overworld.getEntities({ type: alarmEntityId, maxDistance: 1, location: Vector.add(alarm.location, alarmEntityOffset) });
                for (const e of entites) {
                    e.triggerEvent("spark_disasters:despawn");
                }
                alarm.hasEntity = true;
                alarm.visualEntity = overworld.spawnEntity(alarmEntityId, Vector.add(alarm.location, alarmEntityOffset));
            }
            // play animation
            AnimatedBlock.playAnimation(alarm.location, "spark_disasters:alarm_block.pulse");
        }
        if (!visualRanage) {
            if (isBlockLoaded(alarm.location, overworld)) {
                // despawn entities
                alarm.hasEntity = false;
                alarm.visualEntity = undefined;
                let entites = overworld.getEntities({ type: alarmEntityId, maxDistance: 1, location: Vector.add(alarm.location, alarmEntityOffset) });
                for (const e of entites) {
                    e.triggerEvent("spark_disasters:despawn");
                }
                AnimatedBlock.playAnimation(alarm.location, "spark_disasters:alarm_block.off");
            }
        }
    }
    function warnPlayer(player, time) {
        let nameLang = `spark_disasters.ui.menu.${nextDisaster.disasterName}.name`;
        if (time == 40) {
            let random = randomRange(0, 5);
            let finalEnd = "spark.alarm.impact.end." + random;
            let raw = {
                rawtext: [
                    {
                        translate: "spark.alarm.warning.start",
                    },
                    {
                        translate: nameLang
                    },
                    {
                        translate: finalEnd
                    }
                ]
            };
            // might work :D
            player.sendMessage(raw);
            return;
        }
        let lang = "spark.alarm.chat.end." + time;
        // get next disaster
        let raw = {
            rawtext: [
                {
                    translate: "spark.alarm.warning.start",
                },
                {
                    translate: nameLang
                },
                {
                    translate: lang
                }
            ]
        };
        // might work :D
        player.sendMessage(raw);
    }
    function isPlayerInVisualRange(alarm, players) {
        for (const player of players) {
            if (Vector.distance(player.location, alarm.location) <= visualRange) {
                return true;
            }
        }
        return false;
    }
    function isPlayerInWarnRange(alarm, player) {
        // vectors do not care for height while warning
        let pPos = player.location;
        pPos.y = alarm.location.y;
        if (Vector.distance(pPos, alarm.location) <= warnRange) {
            return true;
        }
        return false;
    }
    function loadData() {
        for (const parts of alarmLocationBoard.getParticipants()) {
            let key = parts.displayName;
            if (alarmLocations.has(key))
                continue;
            let segments = key.split(";");
            let location = getVectorFromBlockKey(segments[0]);
            let hasEntity = (segments[1] === 'true');
            let data = {
                location: location,
                hasEntity: hasEntity
            };
            alarmLocations.set(key, data);
        }
    }
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
        let block = event.block;
        let key = getKeyFromBlock(block);
        // if we have the value, return for now
        if (alarmLocations.has(key))
            return;
        let data = {
            location: block.location,
            hasEntity: false
        };
        // save and set
        let fullKey = getKeyFromVector(data.location) + ";" + data.hasEntity;
        alarmLocations.set(key, data);
        if (alarmLocationBoard.hasParticipant(fullKey))
            return; // it already exists
        alarmLocationBoard.setScore(fullKey, 0);
    }, {
        blockTypes: [alarmBlockId]
    });
    // world.afterEvents.playerBreakBlock.subscribe((event) => {
    //     let block = event.block;
    //     let key = getKeyFromBlock(block);
    //     let data = alarmLocations.get(key);
    //     if (data == undefined) return;
    //     if (alarmLocations.has(key)) {
    //         // remove entity above it
    //         if (data.hasEntity){
    //             let ent = overworld.getEntities({ location: Vector.add(data.location, Vector.up), maxDistance: 1, type: alarmEntityId });
    //             for (const e of ent) {
    //                 e.triggerEvent("spark_disasters:despawn");
    //             }
    //         }
    //         removeFromPartialKey(alarmLocationBoard, key);
    //         alarmLocations.delete(key);
    //     }
    // },
    // {
    //     blockTypes: [alarmBlockId]
    // });
})(Alarm || (Alarm = {}));
function removeFromPartialKey(scoreboard, key) {
    for (const entry of scoreboard.getParticipants()) {
        if (entry.displayName.startsWith(key)) {
            scoreboard.removeParticipant(entry);
        }
    }
}
