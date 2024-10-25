// blizzard requires multiple things
import { Entity, EntityDamageCause, system, world } from "@minecraft/server";
import { Disaster } from "../disaster";
import { clamp, getArmorCount, getHighestPoint, isBlockHeatEmitting, isBlockLoaded } from "../util";
import { Vector } from "../vector";
import { Sounds } from "../soundConfig";
import { Groups } from "../grouping";
import { Fog } from "../fog";
export class Blizzard extends Disaster {
    constructor(name) {
        super(name);
        this.skyEffect = "spark_disasters:blizzard_sky";
        this.skyFadeInEffect = "spark_disasters:blizzard_sky_fade_in";
        this.skyFadeOutEffect = "spark_disasters:blizzard_sky_fade_out";
        this.blizzardEffectEmitter = "spark_disasters:blizzard_emitter";
        this.blizzardFog = "spark_disasters:fog_blizzard";
        // player biome mappings
        this.playersInBlizzard = new Set();
        this.testerEntity = "spark_disasters:blizzard_tester";
        // cached heat sources
        this.cachedHeatSources = new Map();
        this.heatedEntities = new Set();
        this.heatSearchSizeX = 2;
        this.heatSearchSizeY = 1;
        // THIS IS THE NON SQURE DISTANCE (its faster (kinda))
        this.heatSourceDistanceSquared = 25;
        // damage stuff
        this.damagePerHit = 1;
        this.playerDamageTimer = new Map();
        this.playerDamageTime = 20;
        // effects
        this.playerTimeInCold = new Map();
        this.shakeIntensityDefault = 0.005;
        this.shakeDenominator = 20;
        this.shakeMax = 0.15;
        this.shakeRecoverSpeed = 2;
        this.slownessMax = 3;
        this.slownessIntensityDefault = 0.01;
        this.armorSlotMitigationAmount = 0.05;
        this.enableFullArmorDamageMitigation = false;
        this.totalLength = 0;
        // make global trigger
        this.isItemTriggered = false;
        // event binding
        world.afterEvents.playerBreakBlock.subscribe((event) => {
            this.onBlockBreak(event);
        });
        Fog.register(this.blizzardFog, this.blizzardFog, 0);
        this.entityDamageTimer = new Map();
        this.entityDamageInterval = 2;
    }
    tick() {
        if (this.activeTime > 0) {
            this.processEffect();
            this.slowEntities();
        }
        if (this.activeTime < 0) {
            this.isActive = false;
            this.cleanup();
        }
        this.activeTime--;
    }
    trigger() {
        this.randomiseDisasterLength();
        this.totalLength = this.activeTime;
        this.isActive = true;
        this.generateCenterPoint();
        // play sounds for all players
        for (const player of this.overworld.getPlayers()) {
            this.detectBiome(player);
            system.runTimeout(() => {
                if (this.playersInBlizzard.has(player.id)) {
                    player.playSound(Sounds.blizzardStart);
                    player.playSound(Sounds.disasterTrigger);
                }
            }, 3);
        }
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:gaga")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§cBạn không có quyền sử dụng Kieru!"
                    }
                ]
            });
            return;
    }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.blizzard"
                    }
                ]
            });
            return;
        }
        this.isItemTriggered = true;
        //this.trigger();
        this.disasterCenterPoint = player.location;
        player.runCommandAsync("/tp @s ^^^15");
        //player.runCommandAsync("particle spark_disasters:lightning_1 ^^1^16");
        //player.runCommandAsync("particle spark_disasters:lightning_1 ^^^15");
        player.runCommandAsync("/effect @s invisibility 1 255 true");
       player.runCommandAsync("summon lightning_bolt ^2^1^18");
       player.runCommandAsync("effect @s resistance 2 255");
       player.runCommandAsync(`effect @s fire_resistance 2 255 true`);
    }
    save() {
    }
    cleanup() {
        this.cachedHeatSources.clear();
        this.playerDamageTimer.clear();
        this.playerTimeInCold.clear();
        this.playersInBlizzard.clear();
        this.clearSoundMap();
        this.isItemTriggered = false;
        this.activeTime = 0;
        for (const p of this.overworld.getPlayers()) {
            Fog.removeFogOnPlayer(p, this.blizzardFog);
        }
    }
    onBlockBreak(block) {
        let b = block.block;
        let key = b.x.toString() + b.y.toString() + b.z.toString();
        if (this.cachedHeatSources.has(key)) {
            this.cachedHeatSources.delete(key);
            this.updateHeatSources();
        }
    }
    // need a timer to check if a player can be tested for biome
    processEffect() {
        let players = this.overworld.getPlayers();
        for (const player of players) {
            let centerDist = Vector.distance(player.location, this.disasterCenterPoint);
            if (centerDist > this.disasterRange) {
                Fog.removeFogOnPlayer(player, this.blizzardFog);
                continue;
            }
            if (centerDist <= this.disasterRange) {
                if (this.activeTime % 20 == 0) {
                    // detect biome
                    this.detectBiome(player);
                    if (this.playersInBlizzard.has(player.id)) {
                        this.testForHeatSource(player);
                    }
                }
                this.effectTick(player);
                Fog.setFogOnPlayer(player, this.blizzardFog);
                // sounds
                if (!this.playerSoundMap.has(player.id)) {
                    this.playerSoundMap.set(player.id, 0);
                }
                let soundTime = this.playerSoundMap.get(player.id);
                soundTime++;
                this.playerSoundMap.set(player.id, soundTime);
                if (!this.playersInBlizzard.has(player.id)) {
                    this.playerSoundMap.set(player.id, -1); // stop playing
                }
                if (soundTime % Sounds.blizzardLoopTime == 0) {
                    // play sound
                    player.playSound(Sounds.blizzardLoop);
                }
            }
        }
        // the extra draw setup!
        for (const ply of Groups.getGroupPlayers(12)) {
            if (this.playersInBlizzard.has(ply.id)) {
                this.draw(ply);
            }
        }
        this.slowEntities();
    }
    slowEntities() {
        for (const entity of this.overworld.getEntities({ excludeTypes: ["minecraft:player"] })) {
            console.log(`Entity ID: ${entity.id}, Type: ${entity.type}`);
            let centerDist = Vector.distance(entity.location, this.disasterCenterPoint);
            if (centerDist >= this.disasterRange)
                continue;
            // just shake
            let id = entity.id;
            if (!this.playerTimeInCold.has(id)) {
                this.playerTimeInCold.set(id, 0);
            }
            let effectTime = this.playerTimeInCold.get(id);
            effectTime++;
            this.playerTimeInCold.set(id, effectTime);
            let slowness = Math.floor(clamp((this.slownessIntensityDefault * effectTime), 0, this.slownessMax));
            if (slowness != 0) {
               entity .addEffect("slowness", 200, { showParticles: false, amplifier: 3 });
            }
            this.damageTickForEntities(entity);
        }
    }
    effectTick(player) {
        let id = player.id;
        if (!this.playerTimeInCold.has(id)) {
            this.playerTimeInCold.set(id, 0);
        }
        let effectTime = this.playerTimeInCold.get(id);
        let isInBlizzard = this.playersInBlizzard.has(id);
        let isHeated = this.heatedEntities.has(id);
        if (!isInBlizzard)
            return;
        // can we do this?
        isInBlizzard == true && isHeated == false ? effectTime++ : effectTime = clamp(effectTime - this.shakeRecoverSpeed, 0, Number.MAX_SAFE_INTEGER);
        this.playerTimeInCold.set(id, effectTime);
        // work out mitigation
        let equip = getArmorCount(player);
        let mit = 1 - (this.armorSlotMitigationAmount * equip);
        // we need to very slowly make the camera shake while this is going up
        // also need to apply slowness too.
        let intensity = clamp(((this.shakeIntensityDefault * effectTime) / this.shakeDenominator), 0, this.shakeMax);
        if (intensity != 0) {
            player.runCommandAsync(`camerashake add @s ${intensity} 0.03 positional`);
        }
        // slowness
        let slowness = Math.floor(clamp((this.slownessIntensityDefault * effectTime) * mit, 0, this.slownessMax));
        // if (mit == (this.armorSlotMitigationAmount * 4) + 1) {
        //     slowness = 0;
        // }
        if (slowness != 0) {
            //player.addEffect("slowness", 1, { showParticles: false, amplifier: slowness });
        }
        // damage only continues while getting colder
        this.damageTick(player, equip);
    }
    damageTick(player, armorSlots) {
        if (this.heatedEntities.has(player.id))
            return;
        if (this.enableFullArmorDamageMitigation && armorSlots == 4)
            return;
        if (!this.playerDamageTimer.has(player.id)) {
            this.playerDamageTimer.set(player.id, 0);
        }
        let time = this.playerDamageTimer.get(player.id);
        time++;
        if (time % (this.playerDamageTime * (1 + (0.2 * armorSlots))) == 0) {
            // do damage
            time = 0;
            player.runCommandAsync("effect @s instant_health 1 1 true");
        }
        this.playerDamageTimer.set(player.id, time);
    }
    damageTickForEntities(entity) {
        if (this.heatedEntities.has(entity.id))
            return;
        if (!this.entityDamageTimer.has(entity.id)) {
            this.entityDamageTimer.set(entity.id, 0);
        }
        let time = this.entityDamageTimer.get(entity.id);
        time++;
        if (time % this.entityDamageInterval == 0) {
            time = 0;
            entity.applyDamage(this.damagePerHit, { cause: EntityDamageCause.freezing });
        }
        this.entityDamageTimer.set(entity.id, time);
    }
    testForHeatSource(player) {
        // remove heated test
        if (this.heatedEntities.has(player.id)) {
            this.heatedEntities.delete(player.id);
        }
        for (const sources of this.cachedHeatSources) {
            // if within distance, mark and return
            if (Vector.distanceSquared(player.location, sources[1]) <= this.heatSourceDistanceSquared) {
                this.heatedEntities.add(player.id);
                // reset damage timer
                this.playerDamageTimer.set(player.id, 1);
                // we are heated, not need to search again
                return;
            }
        }
        // we arnt near a heated block, do search
        this.searchForHeat(player);
    }
    updateHeatSources() {
        for (const player of this.overworld.getPlayers()) {
            // remove heated test
            if (this.heatedEntities.has(player.id)) {
                this.heatedEntities.delete(player.id);
            }
            for (const sources of this.cachedHeatSources) {
                // if within distance, mark and return
                if (Vector.distanceSquared(player.location, sources[1]) <= this.heatSourceDistanceSquared) {
                    this.heatedEntities.add(player.id);
                    // reset damage timer
                    this.playerDamageTimer.set(player.id, 1);
                    // we are heated, not need to search again
                    break;
                }
            }
        }
    }
    // search for heat sources
    searchForHeat(player) {
        let location = player.location;
        for (let x = -this.heatSearchSizeX; x <= this.heatSearchSizeX; x++) {
            for (let y = -this.heatSearchSizeY; y <= this.heatSearchSizeY; y++) {
                for (let z = -this.heatSearchSizeX; z <= this.heatSearchSizeX; z++) {
                    // get the block at xyz and match to hear source
                    let pos = { x: x, y: y, z: z };
                    let block = this.overworld.getBlock(Vector.add(location, pos));
                    if (isBlockHeatEmitting(block)) {
                        // cache
                        let id = block.location.x.toString() + block.location.y.toString() + block.location.z.toString();
                        if (!this.cachedHeatSources.has(id)) {
                            this.cachedHeatSources.set(id, block.location);
                        }
                    }
                }
            }
        }
    }
    draw(player) {
        // effect origin point
        let origin = this.getEffectPoint(player.location);
        if (origin == undefined)
            return;
        let highestPoint = getHighestPoint(this.overworld, origin);
        if (player.location.y > highestPoint.y)
            highestPoint.y = player.location.y;
        if (!isBlockLoaded(highestPoint, this.overworld))
            return;
        if (this.totalLength == this.activeTime) {
            this.overworld.spawnParticle(this.skyFadeInEffect, highestPoint);
        }
        else if (this.activeTime == 1) {
            this.overworld.spawnParticle(this.skyFadeOutEffect, highestPoint);
        }
        else if (this.activeTime < this.totalLength - 26) {
            this.overworld.spawnParticle(this.skyEffect, highestPoint);
        }
        if (this.activeTime % 10 == 5) {
            this.overworld.spawnEntity(this.blizzardEffectEmitter, highestPoint);
        }
        else {
            let emitter_entity = this.overworld.getEntities({
                type: this.blizzardEffectEmitter,
                location: highestPoint,
                maxDistance: 5
            })[0];
            if (emitter_entity instanceof Entity) {
                emitter_entity.teleport(highestPoint);
            }
        }
    }
    detectBiome(player) {
        if (this.isItemTriggered) {
            if (this.playersInBlizzard.has(player.id)) {
                this.playersInBlizzard.delete(player.id);
            }
            this.playersInBlizzard.add(player.id);
            return;
        }
        this.pollForBiome(player, player.dimension.spawnEntity(this.testerEntity, player.location));
    }
    pollForBiome(player, tester) {
        system.runTimeout(() => {
            // new 
            let value = tester.getProperty("spark_disasters:can_blizzard");
            if (this.playersInBlizzard.has(player.id)) {
                this.playersInBlizzard.delete(player.id);
            }
            // we remove them each check, so we can easily add them back
            if (value == true) {
                this.playersInBlizzard.add(player.id);
            }
            tester.triggerEvent("spark_disasters:despawn");
        }, 2);
    }
}
