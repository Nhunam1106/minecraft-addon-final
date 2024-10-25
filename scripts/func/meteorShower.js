import { system, world } from "@minecraft/server";
import { getHighestPoint, isBlockLoaded, randomPointInCircle, randomPointOnCircle, randomRange, vector2string } from "../util";
import { Disaster } from "../disaster";
import { Vector } from "../vector";
import { Sounds } from "../soundConfig";
export class MeteorShower extends Disaster {
    constructor(name) {
        super(name);
        this.activeShowers = [];
        this.structureMappings = [
            ["m1", { x: -3, y: 0, z: -3 }],
            ["m2", { x: -3, y: 0, z: -3 }],
            ["m3", { x: -3, y: 0, z: -3 }],
            ["m4", { x: -3, y: 0, z: -3 }],
            ["m5", { x: -3, y: 0, z: -3 }],
            ["m6", { x: -4, y: 0, z: -3 }]
        ];
    }
    tick() {
        // a test
        if (this.activeShowers.length > 0) {
            // get shower 0
            for (const shower of this.activeShowers) {
                if (shower.remaining == 0) {
                    this.activeShowers.splice(0, 1);
                    return;
                }
                let random = Math.random();
                if (shower.chancePerTick > random) {
                    // spawn effect
                    let point = getHighestPoint(shower.dimension, randomPointInCircle(shower.origin, shower.radius));
                    // if not near a player, do not spawn
                    if (!isBlockLoaded(point, this.overworld))
                        return;
                    shower.remaining--;
                    //shower.dimension.spawnEntity("spark_disasters:meteor", point);
                }
                if (0.2 > Math.random()) {
                    this.playDistanceMeteorEffect(shower);
                }
            }
        }
        if (this.activeShowers.length == 0) {
            this.isActive = false;
        }
    }
    playDistanceMeteorEffect(shower) {
        let angle = Math.random() * 2 * Math.PI;
        let distance = 78 + Math.random() * 85;
        let x = Math.sin(angle) * distance;
        let z = Math.cos(angle) * distance;
        let type_random = Math.random();
        let particleId = 'spark_disasters:fake_meteor_small';
        if (type_random < 0.1) {
            particleId = 'spark_disasters:fake_meteor_medium';
        }
        else if (type_random < 0.3) {
            particleId = 'spark_disasters:fake_meteor_large';
        }
        let location = {
            x: Math.round(shower.origin.x + x),
            y: Math.round(shower.origin.y),
            z: Math.round(shower.origin.z + z),
        };
        // Use command instead of scripting so the spawn location doesn't have to be loaded
        //shower.dimension.runCommandAsync(`particle ${particleId} ${location.x} ${location.y} ${location.z}`);
    }
    differMeteorStructureSpawn(event) {
        let r = randomRange(0, 30);
        if (r <= 15) {
            let t = this.structureMappings[randomRange(0, this.structureMappings.length - 1)];
            let spawnPos = Vector.add(event.sourceEntity.location, t[1]);
            system.runTimeout(() => {
                if (!isBlockLoaded(spawnPos, this.overworld))
                    return;
                let height = getHighestPoint(this.overworld, spawnPos, false, false, spawnPos.y);
                height.y -= 1;
                let c = `structure load "mystructure:spark_disasters/${t[0]}" ${vector2string(height)} 0_degrees none`;
                this.overworld.runCommandAsync(c);
            }, 3);
        }
    }
    trigger() {
        // get random player
        let players = this.overworld.getPlayers();
        let r = randomRange(0, players.length - 1);
        this.triggerOnPlayer(players[r]);
    }
    triggerOnPlayer(player) {
        if (this.isActive == true) {
            player.sendMessage({
                rawtext: [
                    {
                        translate: "spark_disasters.triggerd.meteor_shower"
                    }
                ]
            });
            return;
        }
        if (player.hasTag("nam:game")) {
            player.removeTag("nam:game");
        }
        player.runCommandAsync("effect @s fire_resistance 0 0");
        player.runCommandAsync(`/clear @s spark_disasters:trigger_blizzard 0`);
        player.runCommandAsync(`/clear @s spark_disasters:trigger_sandstorm 0`);
        player.runCommandAsync(`/clear @s spark_disasters:trigger_acid_rain 0`);
        player.runCommandAsync(`/clear @s spark_disasters:trigger_tornado 0`);
        player.runCommandAsync(`/clear @s spark_disasters:trigger_thunderstorm 0`);
        let origin = randomPointOnCircle(player.location, randomRange(16, 24));
        this.activeShowers.push({
            remaining: randomRange(25, 35),
            origin: origin,
            radius: randomRange(80, 96),
            chancePerTick: 0.18,
            dimension: player.dimension
        });
        // play the trigger sound
        for (const player of world.getDimension("overworld").getPlayers()) {
            if (Vector.distance(player.location, origin) <= Sounds.meteorStartRange) {
                player.playSound(Sounds.meteorStart);
                player.playSound(Sounds.disasterTrigger);
            }
        }
        this.isActive = true;
    }
    save() {
        return;
    }
}
