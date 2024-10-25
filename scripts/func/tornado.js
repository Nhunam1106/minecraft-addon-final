import { BlockPermutation, EntityDamageCause, MolangVariableMap, WeatherType, world } from "@minecraft/server";
import { Disaster } from "../disaster";
import { degree2rad, getHighestPoint, randomPointOnCircle, randomRange } from "../util";
import { Vector } from "../vector";
import { Sounds } from "../soundConfig";
import { Fog } from "../fog";
export class Tornado extends Disaster {
    constructor(name) {
        super(name);
        this.dimension = world.getDimension("overworld");
        this.tornadoEntityIdentifier = "spark_disasters:tornado";
        this.fogIdentifier = "spark_disasters:fog_tornado";
        this.targetPlayer = undefined;
        this.tornadoEntity = undefined;
        this.tornadoMoveVector = Vector.zero;
        this.tornadoSpawnRadius = 48;
        this.tornadoIgnoreDistanceSquared = 64 * 64;
        this.playerMinRangeSquared = 24 * 24;
        this.tornadoPullRange = 25;
        this.tornadoSpeed = 0.5;
        this.tornadoNextDistance = 5;
        this.spinCounter = 0;
        this.spinSpeedMultiplier = 1.4;
        this.spinRadius = 8;
        this.maxAffectHeight = 32;
        this.randomMoveRadius = 6;
        this.cameraShakeAmount = 0.4;
        // damage stuff
        this.damagePerHit = 4;
        this.entityDamageTimer = new Map();
        this.entityDamageInterval = 2;
        this.startedPull = new Set();
        this.tornadoVisualMod = 10;
        this.tornadoVisualEffects = [
            "spark_disasters:tornado_core",
            "spark_disasters:tornado_debris",
            "spark_disasters:tornado_clouds",
            "spark_disasters:tornado_dust",
            "spark_disasters:tornado_circles",
        ];
        this.fogDistance = 128;
        Fog.register(this.fogIdentifier, "spark_disasters:fog_tornado");
    }
    tick() {
        this.spinCounter++;
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
    trigger() {
        this.randomiseDisasterLength();
        this.isActive = true;
        // choose target
        let players = this.dimension.getPlayers();
        let r = randomRange(0, players.length - 1);
        this.targetPlayer = players[r];
        this.overworld.setWeather(WeatherType.Rain, 20 * 60);
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:game")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§cBạn không có quyền sử dụng Arashi no Me!"
                    }
                ]
            });
            return;
    }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.tornado"
                    }
                ]
            });
            return;
        }
        player.runCommand("playanimation @s animation.dragon.kiki run");
        this.randomiseDisasterLength(20 * 30);
        this.isActive = true;
        this.targetPlayer = player;
        this.overworld.setWeather(WeatherType.Rain, 20 * 60);
        player.sendMessage({
            rawtext: [
                {
                    text: "§8§lArashi no Me"
                }
            ]
        });
    }
    save() {
    }
    cleanup() {
        this.targetPlayer = undefined;
        this.tornadoEntity.triggerEvent("spark_disasters:despawn");
        this.tornadoEntity = undefined;
        this.clearSoundMap();
        Fog.removeAllFogOnAllPlayers();
        this.activeTime = 0;
        // this.overworld.setWeather(WeatherType.Clear);
    }
    processEffect() {
        if (this.targetPlayer != undefined) {
            if (!this.targetPlayer.isValid()) {
                this.isActive = false;
                this.cleanup();
                return;
            }
        }
        let players = this.dimension.getPlayers();
        // skipping drawing
        if (this.tornadoEntity == undefined)
            this.spawnTornado();
        // move towards target player
        this.moveTornadoTowardsPlayer();
        // tornado visuals
        this.updateTornadoVisuals();
        // loop general sounds
        for (const player of players) {
            if (Vector.distance(player.location, this.tornadoEntity.location) > Sounds.tornadoLoopRange) {
                this.playerSoundMap.set(player.id, -1); // stop playing
                continue;
            }
            // sounds
            if (!this.playerSoundMap.has(player.id)) {
                this.playerSoundMap.set(player.id, 0);
            }
            let soundTime = this.playerSoundMap.get(player.id);
            soundTime++;
            this.playerSoundMap.set(player.id, soundTime);
            if (soundTime % Sounds.tornadoLoopTime == 0) {
                // play sound
                player.playSound(Sounds.tornadoLoop);
            }
            // fog
            if (Vector.distance(player.location, this.tornadoEntity.location) < this.fogDistance) {
                // set fog
                Fog.setFogOnPlayer(player, this.fogIdentifier);
            }
            if (Vector.distance(player.location, this.tornadoEntity.location) >= this.fogDistance) {
                // set fog
                Fog.removeAllFogOnPlayer(player);
            }
        }
        // loop near tornado
        if (!this.playerSoundMap.has(this.tornadoEntity.id)) {
            this.playerSoundMap.set(this.tornadoEntity.id, 0);
        }
        let soundTime = this.playerSoundMap.get(this.tornadoEntity.id);
        soundTime++;
        this.playerSoundMap.set(this.tornadoEntity.id, soundTime);
        if (soundTime % Sounds.tornadoTwisterTime == 0) {
            // this.tornadoEntity.runCommandAsync(`playsound ${Sounds.tornadoTwisterLoop} @a ~ ~ ~ 4 1 1`);
            for (const player of players) {
                if (Vector.distance(player.location, this.tornadoEntity.location) <= Sounds.tornadoTwisterRange) {
                    player.playSound(Sounds.tornadoTwisterLoop, { volume: Sounds.tornadoTwisterRange / 16, location: { x: this.tornadoEntity.location.x, y: player.location.y, z: this.tornadoEntity.location.z } });
                }
            }
        }
    }
    updateTornadoVisuals() {
        if (this.activeTime % this.tornadoVisualMod == 0) {
            let molangMap = new MolangVariableMap();
            molangMap.setFloat("movement_x", this.tornadoMoveVector.x);
            molangMap.setFloat("movement_z", this.tornadoMoveVector.z);
            molangMap.setFloat("tornado_age", this.activeTime / 20);
            // play the effects
            for (const effect of this.tornadoVisualEffects) {
                if (effect == "spark_disasters:tornado_debris" && this.activeTime / 20 < 4)
                    continue;
                this.dimension.spawnParticle(effect, this.tornadoEntity.location, molangMap);
            }
            this.dimension.getPlayers({
                location: this.tornadoEntity.location,
                maxDistance: 40
            }).forEach(player => {
                this.dimension.spawnParticle("spark_disasters:tornado_storm_dust", player.location);
            });
        }
    }
    moveTornadoTowardsPlayer() {
        // always clear velo
        this.tornadoEntity.clearVelocity();
        // move towards player 
        // needs to ignore y distance!
        let targetOffset = this.targetPlayer.location;
        targetOffset.y = this.tornadoEntity.location.y;
        if (Vector.distanceSquared(targetOffset, this.tornadoEntity.location) > this.playerMinRangeSquared) {
            // we need to work out where we can goto next
            // to do this, get the direction to the player and choose a spot a few blocks in that direction
            let direction = Vector.subtract(this.targetPlayer.location, this.tornadoEntity.location);
            let normal = direction.normalized();
            let nextCheckPoint = Vector.add(this.tornadoEntity.location, Vector.multiplyScalar(normal, this.tornadoNextDistance));
            // work out the next target point
            let gotoPoint = this.getNextMovePoint(nextCheckPoint);
            // move towards it now?
            let moveDir = Vector.subtract(gotoPoint, this.tornadoEntity.location).normalized();
            this.tornadoMoveVector = Vector.multiplyScalar(moveDir, this.tornadoSpeed);
        }
        // random movement if too close
        if (Vector.distanceSquared(targetOffset, this.tornadoEntity.location) <= this.playerMinRangeSquared) {
            let randomPoint = randomPointOnCircle(this.tornadoEntity.location, this.randomMoveRadius);
            let nextPoint = this.getNextMovePoint(randomPoint);
            let moveDir = Vector.subtract(nextPoint, this.tornadoEntity.location).normalized();
            this.tornadoMoveVector = Vector.multiplyScalar(moveDir, this.tornadoSpeed * 3);
        }
        // punt in direction, need to be inverted or something?
        this.tornadoEntity.applyImpulse(this.tornadoMoveVector);
        this.yeetEntities();
        this.replaceGrass();
    }
    yeetEntities() {
        // get all players
        // if they are too close to the tornado, begin to impulse them into it?
        let entities = this.tornadoEntity.dimension.getEntities({ excludeTypes: [this.tornadoEntity.typeId, "minecraft:item"] });
        // large pull range that will slowly pull in entities
        // calculate range from the base, so use the same height as the tornado
        // use the range from the entity to begin lift
        // the higher the entity is, the larger the spin radius is?
        let baseHeight = this.tornadoEntity.location.y;
        // if (world.getTimeOfDay() % 10 == 0) {
        //     this.dimension.runCommandAsync("execute as @e run ride @e evict_riders");
        // }
        let modTime = world.getTimeOfDay() % 10;
        for (const entity of entities) {
            if (entity.typeId === "minecraft:player") continue;
            if (Vector.distanceSquared(this.tornadoEntity.location, entity.location) > this.tornadoIgnoreDistanceSquared)
                continue;
            let offsetPlayerPosition = entity.location;
            if (offsetPlayerPosition.y + 5 < baseHeight)
                continue;
            offsetPlayerPosition.y = baseHeight;
            let dist = Vector.distance(this.tornadoEntity.location, offsetPlayerPosition);
            let capDistance = Vector.distance(this.tornadoEntity.location, entity.location);
            if (dist < this.tornadoPullRange) {
                // play on first eat or something...
                if (entity.typeId == "minecraft:player") {
                    if (!this.startedPull.has(entity.id)) {
                        this.startedPull.add(entity.id);
                        entity.playSound(Sounds.tornadoSwallow);
                    }
                }
                // if (dist < this.tornadoPullRange - 2){
                //     if (modTime == 0) {
                //         entity.runCommandAsync("ride @s evict_riders");
                //     }
                // }
                if (modTime == 0) {
                    entity.runCommandAsync("ride @s evict_riders");
                }
                // adjust radius target height
                let target = this.getNextTargetPointInTornado(entity.location);
                // do the pull
                // for now just ueet to center
                let direction = Vector.subtract(target, entity.location);
                let normal = direction.normalized();
                let yeet = Vector.multiplyScalar(normal, this.spinSpeedMultiplier);
                // to apply to player
                let newTarget = Vector.add(entity.location, yeet);
                let newDir = Vector.subtract(newTarget, entity.location);
                let distance = Vector.distance(entity.location, newTarget);
                // so we can get flung out, or something like that :D
                let throwMultiplier = (capDistance > this.maxAffectHeight) ? 5 : 1;
                // start applying camera shake
                if (entity.typeId != this.tornadoEntity.typeId && entity.typeId != "minecraft:item") {
                    entity.runCommandAsync(`camerashake add @s ${this.cameraShakeAmount} 0.05 positional`);
                    // player damage here too
                    this.processEntityDamage(entity);
                    // play an animation every second or so here!
                    // TODO: add animation
                    // temp command
                    entity.runCommandAsync('playanimation @s animation.spark_disasters.player.tornado_twirl none 0.2 "q.is_on_ground"');
                    entity.dimension.spawnParticle('spark_disasters:tornado_pov_dust', entity.location);
                }
                // to prevent errors, as some types cant have knockback
                try {
                    entity.applyKnockback(newDir.x, newDir.z, distance * throwMultiplier, 0.1);
                }
                catch (_a) {
                }
            }
            if (dist >= this.tornadoPullRange) {
                // remove from map and play spitout
                if (entity.typeId == "minecraft:player") {
                    if (this.startedPull.has(entity.id)) {
                        this.startedPull.delete(entity.id);
                        entity.playSound(Sounds.tornadoSpit);
                    }
                }
            }
        }
    }
    processEntityDamage(entity) {
        // get the players active time in the rain
        if (!this.entityDamageTimer.has(entity.id)) {
            this.entityDamageTimer.set(entity.id, 1);
        }
        // get player time
        let time = this.entityDamageTimer.get(entity.id);
        time++;
        time = time % this.entityDamageInterval;
        if (time == 0) {
            // damage
            entity.applyDamage(this.damagePerHit, { cause: EntityDamageCause.contact });
        }
        // save value
        this.entityDamageTimer.set(entity.id, time);
    }
    replaceGrass() {
        // really simple, just check for grass blocks within a 3x3 of the entity, and replace
        for (let x = -1; x < 2; x++) {
            for (let y = -1; y < 2; y++) {
                for (let z = -1; z < 2; z++) {
                    let check = {
                        x: this.tornadoEntity.location.x + x,
                        y: this.tornadoEntity.location.y + y,
                        z: this.tornadoEntity.location.z + z
                    };
                    let block = this.dimension.getBlock(check);
                    if (block == undefined)
                        continue;
                    if (block.permutation.matches("minecraft:grass")) {
                        block.setPermutation(BlockPermutation.resolve("minecraft:dirt"));
                    }
                }
            }
        }
    }
    scaleRadius(value, min, max) {
        let mid = ((max - min) / 2) + min;
        if (value > mid) {
            return (((max + value) - mid) / max) * 1.3; // another scale value
        }
        return 1;
    }
    getNextTargetPointInTornado(radiusOffset) {
        let center = this.tornadoEntity.location;
        let affectHeight = this.tornadoEntity.location.y + (radiusOffset.y - this.tornadoEntity.location.y);
        let scaledRadius = this.scaleRadius(affectHeight, Math.floor(this.tornadoEntity.location.y), this.tornadoEntity.location.y + this.maxAffectHeight);
        scaledRadius *= this.spinSpeedMultiplier;
        let rad = (this.spinRadius * scaledRadius);
        let angle = degree2rad(this.spinCounter) * Math.PI * 2;
        center.x += Math.cos(angle) * rad;
        center.z += Math.sin(angle) * rad;
        return center;
    }
    getNextMovePoint(searchPoint) {
        let highest = getHighestPoint(this.dimension, searchPoint, true);
        return { x: searchPoint.x, y: highest.y + 1, z: searchPoint.z };
    }
    spawnTornado() {
        let pLoc = this.targetPlayer.location;
        let cirSpawn = randomPointOnCircle(pLoc, this.tornadoSpawnRadius);
        let top = getHighestPoint(this.dimension, cirSpawn);
        this.tornadoEntity = this.dimension.spawnEntity(this.tornadoEntityIdentifier, top);
        // sound
        for (const player of this.dimension.getPlayers()) {
            if (Vector.distance(player.location, top) <= Sounds.tornadoStartRange) {
                player.playSound(Sounds.tornadoStart);
                player.playSound(Sounds.disasterTrigger);
            }
        }
    }
}
