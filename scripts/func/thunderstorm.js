import { BlockPermutation, EntityDamageCause, WeatherType, MolangVariableMap, system } from "@minecraft/server";
import { Disaster } from "../disaster";
import { getKeyFromBlock, getVectorFromBlockKey, isBlockLeaf, isBlockLog, isBlockPartOfTree, randomPointInCircle, randomPointOnCircle, randomRange, getHighestPoint, normalizeLocation, normalizedEntityLocation, vector2string, isBlockLoaded } from "../util";
import { Vector } from "../vector";
import { Sounds } from "../soundConfig";
import { Groups } from "../grouping";
export class Thunderstorm extends Disaster {
    constructor(name) {
        super(name);
        this.strikeEffects = [
            "spark_disasters:lightning_1"
        ];
        this.leafSearchDepth = 12;
        this.logSearchDepth = 15;
        this.strikeLightEffect = "spark_disasters:lightning_shine";
        this.strikeImpactEffect = "spark_disasters:lightning_impact_sparks";
        this.flashingRainEffect = "spark_disasters:flashing_rain";
        this.airBlock = BlockPermutation.resolve("minecraft:air");
        this.burntBlock = BlockPermutation.resolve("spark_disasters:burned_wood");
        this.strikeChance = 0.05;
        this.strikeTimer = 0;
        this.strikeRange = 128;
        this.windParticleMod = 20;
        this.drizzleParticleMod = 2;
        this.flashingRainParticleRange = 128;
        this.intermissionTimerDefault = 20 * 3;
        this.intermissionTimer = this.intermissionTimerDefault;
        this.drizzleParticleIdentifier = "spark_disasters:rain_drizzle";
        this.windParticleIdentifier = "spark_disasters:wind_gust";
        this.skyParticleIdentifier = "spark_disasters:thunderstorm_sky";
        this.lightningStrikeEffect = "minecraft:redstone_wire_dust_particle";
        this.clusters = [];
        this.clusterGenerateTime = 10;
        this.clusterCounter = 0;
        this.nextClusterTime = [4, 10];
        this.playerHitChance = 0.2;
        this.playerStrikeRange = 20;
        this.playerDamageRange = 10;
        this.playerDamageAmount = 25;
        this.targetFarStrikes = 6;
        this.maxClusters = 128;
    }
    tick() {
        if (this.activeTime > 0) {
            this.processEffect();
        }
        if (this.activeTime < 0) {
            this.isActive = false;
            this.cleanup();
        }
        this.activeTime--;
    }
    cleanup() {
        // this.overworld.setWeather(WeatherType.Clear);
        this.activeTime = 0;
        this.clusters = [];
        this.clusterCounter = 0;
        this.clusterGenerateTime = 10;
        this.clearSoundMap();
    }
    trigger() {
        this.randomiseDisasterLength();
        this.isActive = true;
        this.generateCenterPoint();
        // this.generateCluster();
        // set weather
        this.overworld.setWeather(WeatherType.Rain, this.defaultDuration);
        // play start sounds, this doesnt play for some reason.
        for (const player of this.overworld.getPlayers()) {
            player.playSound(Sounds.thunderstormStart);
            player.playSound(Sounds.disasterTrigger);
        }
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:game")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§cBạn không có quyền sử dụng Kaminari!"
                    }
                ]
            });
            return;
    }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.thunderstorm"
                    }
                ]
            });
            return;
        }
        player.addTag("nam:gaga");
        system.runTimeout(() => {
            player.removeTag("nam:gaga");
        }, 90 * 20);
        player.runCommandAsync("particle spark_disasters:lightning_1 ~ ~ ~");
        player.runCommand("playanimation @s animation.dragon.thun run");
        system.runTimeout(() => {
            player.runCommandAsync(`give @s spark_disasters:trigger_blizzard 1 0 {"keep_on_death":{},"item_lock":{"mode":"lock_in_inventory"}}`);
            system.runTimeout(() => {
                player.runCommandAsync(`/clear @s spark_disasters:trigger_blizzard 0`);
                player.runCommandAsync("tag @s remove nam:gaga")
            }, 90 * 20);
    }, 10);
        this.trigger();
        this.disasterCenterPoint = normalizeLocation(player.location);
        player.sendMessage({
            rawtext: [
                {
                    text: "§8§lKaminari"
                }
            ]
        });
    }
    save() {
    }
    processEffect() {
        let players = this.getPlayersInDisaster();
        if (players.length == 0)
            return;
        // every .2 to .5 of a second
        // roll for player spawn chance (.1)
        // if on player, summon on player
        // else summon randomly within the range
        // roll for strike
        if (this.clusterCounter > this.clusterGenerateTime) {
            // generate
            this.generateNextStrike(players);
            // setup next
            this.clusterCounter = -1;
            this.clusterGenerateTime = randomRange(this.nextClusterTime[0], this.nextClusterTime[1]);
            // if the count of the isFar clusters is low, add another one?
            let count = 0;
            for (const c of this.clusters) {
                if (c.isFar == undefined)
                    continue;
                if (c.isFar == true)
                    count++;
            }
            if (count < this.targetFarStrikes) {
                this.setCluster(randomPointInCircle(this.disasterCenterPoint, this.disasterRange), true, true);
            }
        }
        this.clusterCounter += 1;
        // if we have a cluster to process
        if (this.clusters.length > 0) {
            for (const tc of this.clusters) {
                let timer = tc.timer;
                if (timer > 0)
                    continue;
                // strike chance
                if (Math.random() <= tc.chancePerTick) {
                    tc.timer = tc.cooldown;
                    tc.strikesRemaining = tc.strikesRemaining - 1;
                    let hitPoint = undefined;
                    if (tc.origin != undefined)
                        hitPoint = this.getStrikePoint(tc.origin, tc.radius);
                    // tracking cluster
                    if (tc.followEntity != undefined) {
                        if (Math.random() <= tc.followEntityHitChance) {
                            hitPoint = getHighestPoint(this.overworld, tc.followEntity.location);
                        }
                        if (hitPoint == undefined) {
                            hitPoint = this.getStrikePoint(tc.followEntity.location, tc.radius);
                        }
                    }
                    // if we are close to a player, we can do the tree fire stuff
                    if (this.isCloseToPlayer(hitPoint, players)) {
                        // near to player
                        this.doStrike(hitPoint);
                        this.applyDamageToAllEntities(hitPoint, this.playerDamageAmount, this.playerDamageRange);
                        // check if the hitpoint is very close to a player, if so, do damage
                        for (const e of this.overworld.getEntities({ excludeTypes: ["minecraft:item", "minecraft:player"] })) {
                            if (Vector.distance(e.location, hitPoint) <= this.playerDamageRange) {
                                e.applyDamage(this.playerDamageAmount, { cause: EntityDamageCause.lightning });
                            }
                        }
                        // fire
                        // get new point from strike point
                        // let bottomPoint = getAboveHighestPoint(this.overworld, hitPoint);
                        // let block = this.overworld.getBlock(bottomPoint);
                        // if (block != undefined){
                        //     if (block.isValid()){
                        //         block.setPermutation(BlockPermutation.resolve("minecraft:fire"));
                        //     }
                        // }
                    }
                    // play effects
                    try {
                        // distance stuff
                        let point = vector2string(hitPoint);
                        this.overworld.runCommandAsync(`particle ${this.getStrikeEffect()} ${point}`);
                        this.overworld.runCommandAsync(`particle ${this.strikeLightEffect} ${point}`);
                        this.overworld.runCommandAsync(`particle ${this.strikeImpactEffect} ${point}`);
                        this.playStrikeSound(players, hitPoint);
                    }
                    catch (_a) {
                        // nothing :D
                    }
                }
            }
            for (let i = this.clusters.length - 1; i > -1; i--) {
                let cluster = this.clusters[i];
                if (cluster.strikesRemaining == 0) {
                    this.clusters.splice(i, 1);
                    continue;
                }
                // guard
                if (cluster.isFar)
                    continue;
                if (cluster.origin != undefined) {
                    if (!isBlockLoaded(cluster.origin, this.overworld)) {
                        this.clusters.splice(i, 1);
                        continue;
                    }
                }
            }
        }
        // this.strikeTimer--;
        // sound loop
        // each tick, each player has a chance to have a thunderbolt to hit hear them
        for (const player of players) {
            if (!this.playerSoundMap.has(player.id))
                this.playerSoundMap.set(player.id, Sounds.thunderstormLoopTime);
            let soundTime = this.playerSoundMap.get(player.id);
            soundTime++;
            this.playerSoundMap.set(player.id, soundTime);
            if (soundTime % Sounds.thunderstormLoopTime == 0) {
                // play sound
                player.playSound(Sounds.thunderstormLoop);
            }
            this.drawRain(player);
        }
        for (const ply of Groups.getGroupPlayers(40)) {
            // if (players.indexOf(ply) != -1) {
            //     let offsetLoc = this.getEffectPoint(ply.location);
            //     if (offsetLoc != undefined) {
            //         let variables = new MolangVariableMap();
            //         variables.setFloat('height', offsetLoc.y);
            //         this.overworld.spawnParticle(this.skyParticleIdentifier, offsetLoc, variables);
            //     }
            // }
            // players.indexOf(ply) != -1 is a pointless check, as those players are collected within the call above it...
            let offsetLoc = this.getEffectPoint(ply.location);
            if (offsetLoc != undefined) {
                if (!isBlockLoaded(offsetLoc, this.overworld))
                    continue;
                let variables = new MolangVariableMap();
                variables.setFloat('height', offsetLoc.y);
                this.overworld.spawnParticle(this.skyParticleIdentifier, offsetLoc, variables);
            }
        }
    }
    getPlayersInDisaster() {
        let plys = [];
        for (const player of this.overworld.getPlayers()) {
            let nomPLayer = normalizedEntityLocation(player);
            if (Vector.distance(nomPLayer, this.disasterCenterPoint) < this.disasterRange) {
                plys.push(player);
            }
        }
        return plys;
    }
    isCloseToPlayer(location, players) {
        let loc = normalizeLocation(location);
        for (const player of players) {
            if (Vector.distance(loc, normalizedEntityLocation(player)) <= this.playerStrikeRange)
                return true;
        }
        return false;
    }
    generateNextStrike(players) {
        let entities = this.overworld.getEntities();
        // every .2 to .5 of a second
        // roll for player spawn chance (.1)
        // if on player, summon on player
        // else summon randomly within the range
        let playerChance = Math.random();
        if (playerChance <= this.playerHitChance) {
            // get player
            let player = players[randomRange(0, players.length - 1)];
            this.setClusterFollowEntity(player);
            return;
        }
        // choose random player to center these around
        let player = players[randomRange(0, players.length - 1)];
        // create a mid range zone too
        this.setCluster(randomPointOnCircle(normalizedEntityLocation(player), randomRange(32, 64)), true);
        // this.setCluster(randomPointOnCircle(this.disasterCenterPoint, randomRange(32,64)), true);
        // random
        this.setCluster(randomPointInCircle(this.disasterCenterPoint, this.disasterRange), true, true);
    }
    doStrike(hitPoint) {
        // tree check and destruction here
        let blocks = this.checkForTree(hitPoint, this.leafSearchDepth, new Set());
        if (blocks == undefined)
            return;
        if (blocks.size > 0) {
            // loop over and destroy them or smth
            for (const loc of blocks) {
                let key = getVectorFromBlockKey(loc);
                let block = this.overworld.getBlock(key);
                if (isBlockLeaf(block)) {
                    // destroy
                    block.setPermutation(this.airBlock);
                }
                if (isBlockLog(block)) {
                    // now we need to search for connected logs, and then delete them :D
                    // 15 shouldnt be an issue really
                    let logs = this.checkForLogs(block.location, this.logSearchDepth, new Set());
                    if (logs.size > 0) {
                        // loop and replace
                        for (const log of logs) {
                            let logKey = getVectorFromBlockKey(log);
                            let blockLog = this.overworld.getBlock(logKey);
                            blockLog.setPermutation(this.burntBlock);
                        }
                    }
                }
            }
        }
    }
    applyDamageToAllEntities(hitPoint, damageAmount, radius) {
        let nearbyEntities = this.overworld.getEntities({ location: hitPoint, maxDistance: radius });
    
        for (const entity of nearbyEntities) {
            if (entity.typeId !== "minecraft:player") {
                entity.applyDamage(damageAmount, { cause: EntityDamageCause.lightning });
        }
    }
}
    checkForTree(location, distance, blocks) {
        if (distance == 0)
            return;
        let b = this.overworld.getBlock(location);
        if (b == undefined)
            return;
        if (!b.isValid())
            return;
        if (b.isAir)
            return;
        if (b.isLiquid)
            return;
        let loc = getKeyFromBlock(b);
        if (blocks.has(loc))
            return;
        if (isBlockPartOfTree(b)) {
            blocks.add(loc);
            this.checkForTree({ x: location.x - 1, y: location.y, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x - 1, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForTree({ x: location.x + 1, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
        }
        return blocks;
    }
    checkForLogs(location, distance, blocks) {
        if (distance == 0)
            return;
        let b = this.overworld.getBlock(location);
        if (b == undefined)
            return;
        if (!b.isValid())
            return;
        if (b.isAir)
            return;
        if (b.isLiquid)
            return;
        let loc = getKeyFromBlock(b);
        if (blocks.has(loc))
            return;
        if (isBlockLog(b)) {
            blocks.add(loc);
            this.checkForLogs({ x: location.x - 1, y: location.y, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y - 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y + 1, z: location.z }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x - 1, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y - 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y - 1, z: location.z + 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y + 1, z: location.z - 1 }, distance - 1, blocks);
            this.checkForLogs({ x: location.x + 1, y: location.y + 1, z: location.z + 1 }, distance - 1, blocks);
        }
        return blocks;
    }
    getStrikeEffect() {
        let length = this.strikeEffects.length - 1;
        let r = randomRange(0, length);
        return this.strikeEffects[r];
    }
    playStrikeSound(players, strikePoint) {
        for (const player of players) {
            // work out the required values
            let volume = Vector.distance(player.location, strikePoint) + 1 / 16;
            player.runCommandAsync(`playsound ${Sounds.thunderstormStrike} @s ${vector2string(strikePoint)} ${volume} 1 1`);
            // player.playSound(Sounds.thunderstormStrike, { location: strikePoint, volume: volume, pitch: 1});
        }
    }
    drawRain(player) {
        let offsetLoc = this.getEffectPoint(player.location);
        if (offsetLoc != undefined) {
            if (!isBlockLoaded(offsetLoc, this.overworld))
                return;
            if (this.activeTime % this.drizzleParticleMod == 0) {
                this.overworld.spawnParticle(this.drizzleParticleIdentifier, offsetLoc);
            }
            if (this.activeTime % this.windParticleMod == 0) {
                this.overworld.spawnParticle(this.windParticleIdentifier, offsetLoc);
            }
        }
    }
    getStrikePoint(location, range) {
        // return getAboveHighestPoint(this.overworld, randomPointOnCircle(location, range));
        return getHighestPoint(this.overworld, randomPointOnCircle(location, range));
    }
    setCluster(location, onlyVisual, isFar = false) {
        this.clusters.push({
            origin: location,
            radius: randomRange(8, 16),
            strikesRemaining: randomRange(5, 7),
            cooldown: 5,
            timer: 0,
            chancePerTick: 0.4,
            onlyVisuals: onlyVisual,
            isFar: isFar
        });
    }
    setClusterFollowEntity(entity) {
        this.clusters.push({
            followEntity: entity,
            followEntityHitChance: 0.15,
            radius: randomRange(8, 16),
            strikesRemaining: randomRange(10, 20),
            cooldown: 2,
            timer: 0,
            chancePerTick: 0.8,
            onlyVisuals: false
        });
    }
}
