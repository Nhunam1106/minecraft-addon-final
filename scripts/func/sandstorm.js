// this is just the blizzard, but without some of the effects and heat mechanic
import { EntityDamageCause, WeatherType, system } from "@minecraft/server";
import { Disaster } from "../disaster";
import { Fog } from "../fog";
import { clamp, getArmorCount, getHighestPoint, isBlockLoaded } from "../util";
import { Sounds } from "../soundConfig";
import { Groups } from "../grouping";
export class Sandstorm extends Disaster {
    constructor(name) {
        super(name);
        // particle effects
        this.sandstormParticle = "spark_disasters:sandstorm";
        this.sandstormSweepParticle = "spark_disasters:sandstorm_sweep";
        this.sandstormCloudsParticle = "spark_disasters:sandstorm_clouds";
        this.sandstormBaseFog = "spark_disasters:fog_sandstorm";
        this.sandstormCloseFog = "spark_disasters:fog_sandstorm_blind";
        // player biome mappings
        this.playerInSandstorm = new Set();
        this.testerEntity = "spark_disasters:sandstorm_tester";
        // damage stuff
        this.damagePerHit = 2;
        this.entityDamageTimer = new Map();
        this.entityDamageInterval = 40;
        this.playerTimeInSandstorm = new Map();
        this.playerTimeRecovery = 5;
        this.slownessMax = 4;
        this.slownessIntensityDefault = 0.01;
        this.closeFogTriggerTime = 80;
        this.shakeIntensityDefault = 0.005;
        this.shakeDenominator = 20;
        this.shakeMax = 0.15;
        this.shakeRecoverSpeed = 2;
        this.isItemTriggered = false;
        this.armorSlotMitigationAmount = 0.05;
        this.enableFullArmorDamageMitigation = false;
        this.playerDamageTime = 20;
        this.stormDirection = { x: 0.4, y: 0, z: -0.6 };
        this.healAmount = 1;
        this.healInterval = 20;
        // both fogs
        Fog.register(this.sandstormBaseFog, this.sandstormBaseFog, 1);
        Fog.register(this.sandstormCloseFog, this.sandstormCloseFog, 1);
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
    trigger() {
        this.randomiseDisasterLength();
        this.isActive = true;
        this.generateCenterPoint();
        this.overworld.setWeather(WeatherType.Clear, this.activeTime);
        // poll for biome and wait 4 ticks
        // then play the sounds if they are in the correct biome
        // play sounds for all players
        for (const player of this.overworld.getPlayers()) {
            this.detectBiome(player);
            player.runCommandAsync(`effect ${player.name} speed 90 1 true`);
            player.runCommandAsync(`animation @s spark_disasters:sandstorm_animation`);
            system.runTimeout(() => {
                if (this.playerInSandstorm.has(player.id)) {
                    player.playSound(Sounds.sandstormStart);
                    player.playSound(Sounds.disasterTrigger);
                }
            }, 3);
        }
    }
    triggerOnPlayer(player) {
        if (!player.hasTag("nam:game")) {
            player.sendMessage({
                rawtext: [
                    {
                        text: "§cBạn không có quyền sử dụng Arashi!"
                    }
                ]
            });
            return;
    }
        if (this.activeTime > 0) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.sandstorm"
                    }
                ]
            });
            return;
        }
        player.runCommandAsync(`effect @s fire_resistance 69 255 true`);
        player.runCommand("playanimation @s animation.dragon.hehe run");
        system.runTimeout(() => {
            player.runCommandAsync(`effect @p invisibility 1 0 true`);
            player.runCommandAsync(`tp @s ^^1^4`);
    }, 10);
        this.isItemTriggered = true;
        this.trigger();
        this.disasterCenterPoint = player.location;
        player.sendMessage({
            rawtext: [
                {
                    text: "§7§lArashi"
                }
            ]
        });
    }
    save() {
    }
    isBehindWall(entity) {
        for (let i = 0; i < 2; i++) {
            let hit = entity.dimension.getBlockFromRay({ x: entity.location.x, y: entity.location.y + i, z: entity.location.z }, this.stormDirection, { maxDistance: 5, includePassableBlocks: false });
            if (hit == undefined)
                return false;
        }
        return true;
    }
    cleanup() {
        this.playerInSandstorm.clear();
        this.playerTimeInSandstorm.clear();
        Fog.removeAllFogOnAllPlayers();
        this.clearSoundMap();
        this.isItemTriggered = false;
        this.activeTime = 0;
    }
    processEffect() {
        let players = this.overworld.getPlayers();
        for (const player of players) {
            if (!this.playerInSandstorm.has(player.id)) {
                continue;
            }
            let inEffectRange = this.isInEffectRange(player);
            if (inEffectRange) {
                if (this.activeTime % 20 == 0) {
                    // detect biome
                    this.detectBiome(player);
                }
                // effects
                if (!this.playerInSandstorm.has(player.id))
                    continue;
                this.effectTick(player);
                // sounds
                if (!this.playerSoundMap.has(player.id)) {
                    this.playerSoundMap.set(player.id, 0);
                }
                let soundTime = this.playerSoundMap.get(player.id);
                soundTime++;
                this.playerSoundMap.set(player.id, soundTime);
                if (!this.playerInSandstorm.has(player.id)) {
                    this.playerSoundMap.set(player.id, -1); // stop playing
                }
                if (soundTime % Sounds.sandstormLoopTime == 0) {
                    // play sound
                    player.playSound(Sounds.sandstormLoop);
                }
            }
            // process damage
            this.processEntityDamage(player);
            if (!inEffectRange) {
                // remove fogs
                Fog.removeFogOnPlayer(player, this.sandstormCloseFog);
                Fog.removeFogOnPlayer(player, this.sandstormBaseFog);
                // reset effct time
                if (this.playerTimeInSandstorm.has(player.id)) {
                    this.playerTimeInSandstorm.set(player.id, 0);
                }
            }
            // always draw unless we are in the wrong biome or smth
            // if (this.playerInSandstorm.has(player.id)) {
            //     this.draw(player);
            // }
        }
        // slow entities
        this.slowEntities();
        // the extra draw setup!
        for (const ply of Groups.getGroupPlayers(12)) {
            if (this.playerInSandstorm.has(ply.id)) {
                this.draw(ply);
            }
        }
    }
    slowEntities() {
        for (const entity of this.overworld.getEntities({ excludeTypes: ["minecraft:item", "minecraft:player"] })) {
            let inEffectRange = this.isInEffectRange(entity);
            if (!inEffectRange)
                continue;
            this.processEntityDamage(entity);
            // just shake
            let id = entity.id;
            if (!this.playerTimeInSandstorm.has(id)) {
                this.playerTimeInSandstorm.set(id, 0);
            }
            let effectTime = this.playerTimeInSandstorm.get(id);
            let isBehindWall = this.isBehindWall(entity);
            isBehindWall == false ? effectTime++ : effectTime = clamp(effectTime - this.shakeRecoverSpeed, 0, Number.MAX_SAFE_INTEGER);
            this.playerTimeInSandstorm.set(id, effectTime);
            let slowness = Math.floor(clamp((this.slownessIntensityDefault * effectTime * 0.9), 0, this.slownessMax));
            if (slowness != 0) {
                entity.addEffect("slowness", 40, { showParticles: false, amplifier: slowness });
            }
        }
    }
    getEntityHeath(entity) {
        let health = entity.getComponent("minecraft:health");
        return health.currentValue;
    }
    effectTick(player) {
        let id = player.id;
        if (!this.playerTimeInSandstorm.has(id)) {
            this.playerTimeInSandstorm.set(id, 0);
        }
        // block above head
        let isBehindWall = this.isBehindWall(player);
        let isInSandstorm = this.playerInSandstorm.has(id);
        let effectTime = this.playerTimeInSandstorm.get(id);
        if (!isInSandstorm)
            return;
        isInSandstorm == true && isBehindWall == false ? effectTime++ : effectTime = clamp(effectTime - this.playerTimeRecovery, 0, Number.MAX_SAFE_INTEGER);
        this.playerTimeInSandstorm.set(id, effectTime);
        // if there is a block above the player, we remove the slowness quickly
        // and remove the inner fog
        // TODO: convert slowness to function like it doesn in the blizzard
        let slowness = Math.floor(clamp((this.slownessIntensityDefault * effectTime), 0, this.slownessMax));
        let closeFogTrigger = this.closeFogTriggerTime <= effectTime;
        let shake = clamp((this.shakeIntensityDefault * effectTime) / this.shakeDenominator, 0, this.shakeMax);
        if (isBehindWall) {
            slowness = 0;
            closeFogTrigger = false;
        }
        const healingInterval = 10; // Giả sử hồi máu mỗi 20 ticks (1 giây)
    if (slowness != 0 && effectTime % healingInterval == 0) {
        player.runCommandAsync("effect @s instant_health 1 1 true");
        }
        if (shake != 0) {
            player.runCommandAsync(`camerashake add @s ${shake} 0.03 positional`);
        }
        //closeFogTrigger == true ? Fog.setFogOnPlayer(player, this.sandstormCloseFog) : Fog.setFogOnPlayer(player, this.sandstormBaseFog);
    }
    processEntityDamage(entity) {
        // Kiểm tra xem thực thể có nằm trong phạm vi ảnh hưởng không
        if (!this.isInEffectRange(entity)) return;
        if (entity.typeId === 'minecraft:player') return;
    
        // Nếu thực thể chưa có timer, khởi tạo timer
        if (!this.entityDamageTimer.has(entity.id)) {
            this.entityDamageTimer.set(entity.id, 1);
        }
    
        let isBehindWall = this.isBehindWall(entity);
        
        // Nếu thực thể không đứng sau tường, bắt đầu xử lý sát thương
        if (!isBehindWall) {
            // Lấy giá trị thời gian sát thương
            let time = this.entityDamageTimer.get(entity.id);
            time++;
            time = time % this.entityDamageInterval;  // Điều chỉnh thời gian dựa trên interval
    
            // Kiểm tra nếu đã đến thời điểm gây sát thương
            if (time % this.playerDamageTime == 0) {
                try {
                    // Nếu máu của thực thể nhỏ hơn hoặc bằng sát thương cần gây ra
                    if (this.getEntityHeath(entity) <= this.damagePerHit) {
                        // Triệu hồi thực thể gây sát thương tạm thời, sau đó xóa nó
                        let ent = entity.dimension.spawnEntity("spark_disasters:sandstorm_name", entity.location);
                        entity.applyDamage(this.damagePerHit, { cause: EntityDamageCause.contact, damagingEntity: ent });
                        system.runTimeout(() => {
                            ent.triggerEvent("spark_disasters:despawn");
                        }, 1);
                    } else {
                        // Gây sát thương cho thực thể
                        entity.applyDamage(this.damagePerHit, { cause: EntityDamageCause.contact });
                    }
                } catch (error) {
                    console.log("Error applying damage: " + error);
                }
            }
    
            // Lưu lại giá trị thời gian
            this.entityDamageTimer.set(entity.id, time);
        } else {
            // Nếu thực thể đứng sau tường, đặt lại timer
            this.entityDamageTimer.set(entity.id, 1);
        }
    }    
    draw(player) {
        let origin = this.getEffectPoint(player.location);
        if (origin == undefined)
            return;
        let highestPoint = getHighestPoint(this.overworld, origin);
        if (player.location.y > highestPoint.y)
            highestPoint.y = player.location.y;
        if (!isBlockLoaded(highestPoint, this.overworld))
            return;
        this.overworld.spawnParticle(this.sandstormCloudsParticle, highestPoint);
        this.overworld.spawnParticle(this.sandstormSweepParticle, highestPoint);
        this.overworld.spawnParticle(this.sandstormParticle, highestPoint);
    }
    detectBiome(player) {
        if (this.isItemTriggered) {
            if (this.playerInSandstorm.has(player.id)) {
                this.playerInSandstorm.delete(player.id);
            }
            this.playerInSandstorm.add(player.id);
            return;
        }
        this.pollForBiome(player, player.dimension.spawnEntity(this.testerEntity, player.location));
    }
    pollForBiome(player, tester) {
        system.runTimeout(() => {
            let value = tester.getProperty("spark_disasters:can_sandstorm");
            if (this.playerInSandstorm.has(player.id)) {
                this.playerInSandstorm.delete(player.id);
            }
            // we remove them each check, so we can easily add them back
            if (value == true) {
                this.playerInSandstorm.add(player.id);
            }
            tester.triggerEvent("spark_disasters:despawn");
        }, 2);
    }
}
