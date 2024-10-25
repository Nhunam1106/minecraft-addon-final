import { BlockPermutation, EntityDamageCause, system } from "@minecraft/server";
import { Disaster } from "../disaster";
import { getHighestPoint, getOrCreateScoreboard, getSnowLayerData, isBlockEatable, isBlockLoaded, isUnderGround, randomPointInCircle, randomRange, normalizeLocation } from "../util";
import { Fog } from "../fog";
import { Sounds } from "../soundConfig";
import { Groups } from "../grouping";
import { Vector } from "../vector";
// ANCHOR - Acid rain will have a working distance, and will be played via a particle effect
// Func - on enable, choose a place near a player as the center
// - every few seconds, players get damaged while in side of the effects unless they have a block above them
// acid raid is a global thing!
export class AcidRain extends Disaster {
    constructor(name) {
        super(name);
        this.rainEffectEntity = "spark_disasters:acid_rain_emitter";
        this.bubbleEffect = "spark_disasters:acid_block_dissolve";
        this.fogEffect = "spark_disasters:fog_acid_rain";
        this.skyEffect = "spark_disasters:acid_rain_sky";
        this.fogID = "spark_disasters:acid_rain";
        this.fogScoreboard = getOrCreateScoreboard("spark_disasters:ar_fog");
        // player damage tick
        this.entityDamageTick = new Map();
        this.entityDamageInterval = 50;
        this.entityDamageAmount = 4;
        // block destruction stuff
        this.blocksToEatCache = new Map();
        this.maxBlocksToEat = 128;
        this.rangeOfEatCheck = 50;
        this.eatChance = 0.5;
        // private blockChooseChance: number = 0.2;
        this.numberOfBlockChecksPerTick = 8;
        this.maxEatAttemptsUntilDestroy = 7;
        this.blockAirPermulation = BlockPermutation.resolve("minecraft:air");
        //FIXME - if the player leaves during acid rain, fog will remain!
        Fog.register(this.fogID, this.fogEffect, 0);
    }
    // handles updating
    tick() {
        // for now, we just draw
        if (this.activeTime > 0) {
            this.processEffect();
        }
        if (this.activeTime < 0) {
            this.isActive = false;
            this.cleanup();
        }
        this.activeTime--;
    }
    trigger() {
        this.randomiseDisasterLength();
        this.isActive = true;
        this.generateCenterPoint();
        // this.overworld.setWeather(WeatherType.Clear, this.activeTime);
        // play sounds for all players
        for (const player of this.overworld.getPlayers()) {
            // if not in range, do not play?
            if (Vector.distance(this.disasterCenterPoint, player.location) > this.disasterRange)
                continue;
            player.playSound(Sounds.acidRainStart);
            player.playSound(Sounds.disasterTrigger);
        }
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:game")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§cBạn không có quyền sử dụng Shi no Ame!"
                    }
                ]
            });
            return;
    }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.acid_rain"
                    }
                ]
            });
            return;
        }
        player.runCommandAsync(`effect @s fire_resistance 69 255 true`);
        player.runCommand("playanimation @s animation.dragon.skillgio run");
        // this function will just enable the rain!
        this.trigger();
        this.disasterCenterPoint = player.location;
        player.sendMessage({
            rawtext: [
                {
                    text: "§2§lShi no Ame"
                }
            ]
        });
    }
    save() {
    }
    processEffect() {
        let players = this.overworld.getPlayers();
        // TODO: play a sound every 5 seconds while this is active sound.spark_disasters.acid_rain_loop
        for (const player of players) {
            // if not in range, skip
            if (Vector.distance(normalizeLocation(this.disasterCenterPoint), normalizeLocation(player.location)) > this.disasterRange) {
                // remvoe fog
                Fog.removeFogOnPlayer(player, this.fogID);
                continue;
            }
            let isUnderground = isUnderGround(player);
            if (player.typeId === "minecraft:player") {
                Fog.setFogOnPlayer(player, this.fogID);
                continue;
                this.processEntityDamage(player, isUnderground);
            }
            // get is in range
            // if not in range
            this.processEntityDamage(player, isUnderground);
            // effect origin point
            let origin = this.getEffectPoint(player.location);
            if (origin == undefined) {
                Fog.removeFogOnPlayer(player, this.fogID);
                return;
            }
            // when re-entering, fog does not get added again.
            Fog.setFogOnPlayer(player, this.fogID);
            // this.draw(player);
            // sounds
            if (!this.playerSoundMap.has(player.id)) {
                this.playerSoundMap.set(player.id, 0);
            }
            let soundTime = this.playerSoundMap.get(player.id);
            soundTime++;
            this.playerSoundMap.set(player.id, soundTime);
            if (isUnderGround) {
                this.playerSoundMap.set(player.id, -1); // stop playing
            }
            if (soundTime % Sounds.acidRainLoopTime == 0) {
                // play sound
                player.playSound(Sounds.acidRainLoop);
            }
        }
        // draw
        for (const loc of Groups.getGroupLocations(12)) {
            this.draw(loc);
        }
        // random slime spawn
        if (this.activeTime % 60 == 0) {
            let player = players[randomRange(0, players.length - 1)];
            let amount = randomRange(1, 2);
            for (let i = 0; i < amount; i++) {
                let pos = randomPointInCircle(player.location, randomRange(30, 40));
                let highestPoint = getHighestPoint(this.overworld, pos);
                try {
                    this.overworld.spawnEntity("minecraft:slime", highestPoint);
                }
                catch (_a) {
                }
            }
        }
        // TODO: implement a sound loop for all players who are not underground
        for (const entity of this.overworld.getEntities({ excludeTypes: ["minecraft:item", "minecraft:player", "minecraft:slime"] })) {
            this.processEntityDamage(entity, isUnderGround(entity));
        }
        // eating
        this.processBlockEating(players);
    }
    getEntityHeath(entity) {
        let health = entity.getComponent("minecraft:health");
        return health.currentValue;
    }
    processBlockEating(players) {
        // each tick, check each eatable block in the cache for its valid state
        // if valid, roll a chance to damage it
        // if its being damaged play the effect
        // once there are enough attempts, break the block
        for (const test of this.blocksToEatCache) {
            let eat = test[1];
            if (!eat.block.isValid()) {
                this.blocksToEatCache.delete(test[0]);
                continue;
            }
            // test for loaded
            if (!isBlockLoaded(eat.block.location, eat.block.dimension)) {
                this.blocksToEatCache.delete(test[0]);
                continue;
            }
            let random = Math.random();
            if (random <= this.eatChance) {
                // snow layer stuff
                if (eat.isSlowLayer) {
                    eat.currentSnowLayer--;
                    if (eat.currentSnowLayer > 0) {
                        // remove layer
                        let layer = BlockPermutation.resolve("minecraft:snow_layer", { height: eat.currentSnowLayer });
                        eat.block.setPermutation(layer);
                    }
                    if (eat.currentSnowLayer < 1) {
                        eat.damageProgress = 10;
                    }
                }
                eat.damageProgress++;
                // play effect
                //NOTE: Update the effect for the correct one!
                eat.block.dimension.spawnParticle(this.bubbleEffect, eat.block.location);
            }
            // if damageProgress >= max, break and remove
            if (eat.damageProgress >= this.maxEatAttemptsUntilDestroy) {
                // grass -> dirt
                let block = eat.block;
                if (block.permutation.matches("minecraft:grass")) {
                    // replace with dirt
                    block.setPermutation(BlockPermutation.resolve("minecraft:dirt"));
                    this.blocksToEatCache.delete(test[0]);
                    continue;
                }
                // destroy and remove from list
                // NOTE: may need to check if there is another block below it to change it state
                eat.block.setPermutation(this.blockAirPermulation);
                this.blocksToEatCache.delete(test[0]);
            }
        }
        // debug
        this.fogScoreboard.setScore(".b2ec", this.blocksToEatCache.size);
        // block limit
        if (this.blocksToEatCache.size >= this.maxBlocksToEat)
            return;
        // loop over each player
        // choose a random location with a size around them and get the heighest block
        // if block is non solid, roll for chance to make it eatable
        for (const player of players) {
            for (let i = 0; i < this.numberOfBlockChecksPerTick; i++) {
                let startPoint = player.location;
                startPoint.y = 320;
                // for now we will just do one per loop
                let topPoint = randomPointInCircle(startPoint, this.rangeOfEatCheck);
                // this is getting the wrong block?
                let blockPoint = getHighestPoint(this.overworld, topPoint, false, true);
                if (!this.isPointInEffectRange(blockPoint))
                    continue;
                let block = this.overworld.getBlock(blockPoint);
                // to prevent crash
                if (block == undefined)
                    continue;
                if (!block.isValid())
                    continue;
                // check if the block can be eaten
                let key = block.location.x.toString() + block.location.y.toString() + block.location.z.toString();
                if (this.blocksToEatCache.has(key))
                    continue;
                if (isBlockEatable(block)) {
                    // TODO: give this a chance to be chosen
                    // we can eat this block, add it to the cache
                    let isSlowLayer = block.permutation.matches("minecraft:snow_layer");
                    if (isSlowLayer) {
                        this.blocksToEatCache.set(key, {
                            block: block,
                            damageProgress: 1,
                            isSlowLayer: isSlowLayer,
                            currentSnowLayer: getSnowLayerData(block)
                        });
                        continue;
                    }
                    this.blocksToEatCache.set(key, {
                        block: block,
                        damageProgress: 1,
                        isSlowLayer: false
                    });
                }
            }
        }
    }
    processEntityDamage(entity, isUnderground) {
        if (entity.id === "minecraft:player") {
            return;
        }
        if (!this.isInEffectRange(entity))
            return;
        // get the players active time in the rain
        if (!this.entityDamageTick.has(entity.id)) {
            this.entityDamageTick.set(entity.id, 1);
        }
        // tick damage
        if (!isUnderground) {
            if (entity.id !== "minecraft:player") {
                entity.addEffect("poison", 10, { showParticles: false });
            }
            // get player time
            let time = this.entityDamageTick.get(entity.id);
            time++;
            time = time % this.entityDamageInterval;
            if (time == 0) {
                // damage
                try {
                    if (this.getEntityHeath(entity) <= this.entityDamageAmount) {
                        // summon entity used for damage, then despawn in the next tick :D
                        let ent = entity.dimension.spawnEntity("spark_disasters:acid_rain_name", entity.location);
                        entity.applyDamage(this.entityDamageAmount, { cause: EntityDamageCause.contact, damagingEntity: ent });
                        system.runTimeout(() => {
                            ent.triggerEvent("spark_disasters:despawn");
                        }, 1);
                    }
                    if (this.getEntityHeath(entity) > this.entityDamageAmount) {
                        entity.applyDamage(this.entityDamageAmount, { cause: EntityDamageCause.contact });
                    }
                }
                catch (_a) {
                }
            }
            // save value
            this.entityDamageTick.set(entity.id, time);
            entity.addEffect("poison", 10, { showParticles: false });
        }
        if (isUnderground) {
            // set to default
            this.entityDamageTick.set(entity.id, 1);
            if (entity.getEffect("poison") != undefined) {
                entity.removeEffect("poison");
            }
        }
    }
    draw(location) {
        let origin = this.getEffectPoint(location);
        if (origin == undefined)
            return;
        // this should play the rain effects within the bounds of the disaster
        let highestPoint = getHighestPoint(this.overworld, origin);
        if (location.y > highestPoint.y)
            highestPoint.y = location.y;
        if (!isBlockLoaded(highestPoint, this.overworld))
            return;
        this.overworld.spawnParticle(this.skyEffect, highestPoint);
        if (this.activeTime % 5 == 0) {
            this.overworld.spawnEntity(this.rainEffectEntity, highestPoint);
        }
    }
    cleanup() {
        Fog.removeAllFogOnAllPlayers();
        this.blocksToEatCache.clear();
        this.clearSoundMap();
        this.activeTime = 0;
    }
}
