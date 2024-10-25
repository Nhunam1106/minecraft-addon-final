import { system, world } from "@minecraft/server";
import { Disaster } from "../disaster";
import { clamp, getAboveHighestPoint, normalizeLocation, randomPointOnCircle, randomRange } from "../util";
import { Vector } from "../vector";
import { DATA } from "../DATA";
import { FissureNew } from "./fissureNew";
import { Sounds } from "../soundConfig";
export class Earthquake extends Disaster {
    constructor(name) {
        super(name);
        this.dimension = world.getDimension("overworld");
        this.effectTime = 0;
        this.locationCheckMod = 5;
        this.structureTriggerTime = this.defaultDuration / 2;
        this.playerGroundEffectChance = 0.6;
        this.playerGroundEffectEntityID = "spark_disasters:earthquake_env_debris";
        this.validBiome = new Set();
        this.structureOffsetRange = [8, 16];
        this.testerEntity = "spark_disasters:earthquake_tester";
        this.camerashakeMax = 0.4;
        this.camerashakeDenominator = 5;
        this.camerashakeIntensityDefault = 0.01;
        this.slownessMax = 3;
        this.slownessIntensityDefault = 0.01;
        this.isItemTriggered = false;
        this.hasPasted = false;
        this.fissure = undefined;
        this.fissureType = undefined;
        this.fissureData = [];
        this.fissureData.push(JSON.parse(DATA.f1));
        // this.fissureData.push(JSON.parse(DATA.f2));
        this.fissureData.push(JSON.parse(DATA.f3));
        // this.fissureData.push(JSON.parse(DATA.f4));
        this.fissureData.push(JSON.parse(DATA.f5));
        // this.fissureData.push(JSON.parse(DATA.f6));
        this.fissureData.push(JSON.parse(DATA.f7));
        // this.fissureData.push(JSON.parse(DATA.f8));
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
        const playersWithTag = this.dimension.getPlayers().filter(player => player.hasTag("nam:game"));
    for (const player of playersWithTag) {
        player.runCommandAsync(`effect @s fire_resistance 69 255 true`);
    }
    }
    rotOffset2D(angle, origin, offset) {
        angle = angle % 360;
        if (angle > 180)
            angle -= 360;
        let a = angle * Math.PI / 180;
        let cosA = Math.cos(a);
        let sinA = Math.sin(a);
        let realPos = Vector.add(origin, offset);
        let x = realPos.x - origin.x;
        let z = realPos.z - origin.z;
        let nx = x * cosA - z * sinA;
        let nz = z * cosA + x * sinA;
        return { x: origin.x + nx, y: origin.y, z: origin.z + nz };
    }
    cleanup() {
        this.validBiome.clear();
        this.isItemTriggered = false;
        this.effectTime = 0;
        this.hasPasted = false;
        this.fissure = undefined;
    }
    processEffect() {
        let players = this.dimension.getPlayers();
        this.playerEffectLoop(players);
        // need to alter this to not require a trigger time, but choose an effect instantly so we can calculate correctly
        // structureTriggerTime needs to be the chosen disaster time + 1
        if (this.activeTime % this.locationCheckMod == 0) {
            this.detectBiome(players);
        }
        if (this.fissure != undefined) {
            this.fissure.tick();
            if (this.fissure.isFinished) {
                this.isActive = false;
                this.cleanup();
            }
        }
        for (const player of players) {
            if (!this.playerSoundMap.has(player.id))
                this.playerSoundMap.set(player.id, Sounds.earthquakeLoopTime);
            let soundTime = this.playerSoundMap.get(player.id);
            soundTime++;
            this.playerSoundMap.set(player.id, soundTime);
            if (soundTime % Sounds.earthquakeLoopTime == 0) {
                // play sound
                player.playSound(Sounds.earthquakeLoop);
            }
        }
        if (this.fissureType == undefined) {
            // choose fissure type
            let rand = randomRange(0, this.fissureData.length - 1);
            this.fissureType = this.fissureData[rand];
        }
        if (this.fissureType != undefined) {
            let time = this.fissureType.duration;
            if (this.activeTime != time)
                return;
            // if no valid players are detected, just return
            if (this.validBiome.size == 0)
                return;
            let biomePlayers = [];
            for (const player of players) {
                // range check
                if (Vector.distance(normalizeLocation(this.disasterCenterPoint), normalizeLocation(player.location)) > this.disasterRange)
                    continue;
                if (this.validBiome.has(player.id)) {
                    biomePlayers.push(player);
                }
            }
            if (biomePlayers.length == 0) {
                return;
            }
            let r = randomRange(0, biomePlayers.length - 1);
            let randomPoint = randomPointOnCircle(biomePlayers[r].location, randomRange(this.structureOffsetRange[0], this.structureOffsetRange[1]));
            // get random point around area
            let aboveLoc = getAboveHighestPoint(this.dimension, randomPoint);
            // data.duration = this.activeTime;
            // data.splineDuration = this.activeTime;
            let fPos = getAboveHighestPoint(this.dimension, aboveLoc);
            if (fPos.y < 64)
                fPos.y = 64;
            let fOffset = computeSpawnOffset(this.fissureType.size);
            fPos = Vector.subtract(fPos, fOffset);
            // y offset to fix overhangs
            fPos.y += 6;
            fPos.y = Math.min(319, fPos.y);
            // make new fissure
            this.fissure = FissureNew.fromData(fPos, this.fissureType);
            this.fissure.duration = this.activeTime;
        }
        // update fissures
        // for (let i = this.fissures.length - 1; i > - 1; i--) {
        //     let fissure = this.fissures[i];
        //     fissure.tick();
        //     if (fissure.isFinished) {
        //         if (fissure.chunkLoader != undefined) fissure.chunkLoader.triggerEvent("spark_disasters:despawn");
        //         this.fissures.splice(i, 1);
        //     }
        // }
    }
    fissureExists() {
        return this.fissure == undefined ? false : true;
    }
    playerEffectLoop(players) {
        // calc
        let shake = clamp((this.camerashakeIntensityDefault * this.effectTime) / this.camerashakeDenominator, 0, this.camerashakeMax);
        let slow = Math.floor(clamp((this.slownessIntensityDefault * this.effectTime), 0, this.slownessMax));
        for (const player of players) {
            if (Vector.distance(normalizeLocation(this.disasterCenterPoint), normalizeLocation(player.location)) > this.disasterRange)
                continue;
            if (shake != 0)
                player.runCommandAsync(`camerashake add @s ${shake} 0.03 positional`);
            if (slow != 0)
                //player.addEffect("slowness", 4, { showParticles: false, amplifier: slow });
            // during the earthquake
            // if the player is on the ground, play the area effects randomly
            if (player.isOnGround) {
                if (Math.random() < this.playerGroundEffectChance) {
                    // choose a zone around the player
                    let rx = randomRange(player.location.x - 2, player.location.x + 2);
                    let rz = randomRange(player.location.z - 2, player.location.z + 2);
                    let highest = getAboveHighestPoint(this.overworld, { x: rx, y: player.location.y, z: rz });
                    this.overworld.spawnEntity(this.playerGroundEffectEntityID, highest);
                }
            }
        }
        this.effectTime++;
    }
    trigger() {
        this.randomiseDisasterLength(20 * 30);
        this.isActive = true;
        this.generateCenterPoint();
        if (!this.isTriggerPointValid()) {
            return;
        }
        // play trigger sounds
        // play start sounds, this doesnt play for some reason.
        for (const player of this.overworld.getPlayers()) {
            player.playSound(Sounds.earthquakeStart);
            player.playSound(Sounds.disasterTrigger);
        }
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:game")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§a§lAMARU!!"
                    }
                ]
            });
            player.addTag("nam:game");
        }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.earthquake"
                    }
                ]
            });
            return;
        }
        this.isItemTriggered = true;
        this.disasterCenterPoint = player.location;
        if (!this.isTriggerPointValid()) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggered.earthquake.invalid"
                    }
                ]
            });
            this.cleanup();
            return;
        }
        system.runTimeout(() => {
            player.runCommandAsync(`weather thunder`);
            player.runCommandAsync(`effect @s nausea 10 1 true`);
            player.runCommandAsync(`give @s spark_disasters:trigger_sandstorm 1 0 {"keep_on_death":{},"item_lock":{"mode":"lock_in_inventory"}}`);
            player.runCommandAsync(`give @s spark_disasters:trigger_tornado 1 0 {"keep_on_death":{},"item_lock":{"mode":"lock_in_inventory"}}`);
            player.runCommandAsync(`give @s spark_disasters:trigger_thunderstorm 1 0 {"keep_on_death":{},"item_lock":{"mode":"lock_in_inventory"}}`);
            player.runCommandAsync(`give @s spark_disasters:trigger_acid_rain 1 0 {"keep_on_death":{},"item_lock":{"mode":"lock_in_inventory"}}`);
            system.runTimeout(() => {
                player.runCommandAsync(`weather clear`);
            }, 60 * 20);
    }, 17);
        // this function will just enable the rain!
        this.randomiseDisasterLength(20 * 30);
        this.isActive = true;
        // play start sounds, this doesnt play for some reason.
        for (const player of this.overworld.getPlayers()) {
            player.playSound(Sounds.earthquakeStart);
        }
    }
    save() {
    }
    detectBiome(players) {
        for (const player of players) {
            if (Vector.distance(player.location, this.disasterCenterPoint) > this.disasterRange)
                continue;
            try {
                this.pollForBiome(player, player.dimension.spawnEntity(this.testerEntity, player.location));
            }
            catch (e) {
            }
        }
    }
    isTriggerPointValid() {
        return this.disasterCenterPoint.y + 8 <= 320 ? true : false;
        // return isBlockLoaded(this.disasterCenterPoint, this.overworld)
    }
    pollForBiome(player, tester) {
        system.runTimeout(() => {
            let value = tester.getProperty("spark_disasters:can_earthquake");
            if (this.validBiome.has(player.id)) {
                this.validBiome.delete(player.id);
            }
            // we remove them each check, so we can easily add them back
            if (value == true) {
                this.validBiome.add(player.id);
            }
            if (player.hasTag("debug.earth"))
                value == true ? player.sendMessage("in earthquake zone") : player.sendMessage("not in earthquake zone");
            tester.triggerEvent("spark_disasters:despawn");
        }, 2);
    }
}
function computeSpawnOffset(size) {
    // as it spawn from the bottom, everything is +
    return new Vector(size.x / 2, size.y, size.z / 2);
}
