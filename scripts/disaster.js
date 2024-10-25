// namespace that will tick and trigger disasters
// being done first cos that make sence.... trigger nothing bro.
import { world } from "@minecraft/server";
import { Vector } from "./vector";
import { normalizeLocation, randomPointInCircle, randomRange, randomRangeFloat } from "./util";
// this is a very basic class, it does not need to do much at all
export class Disaster {
    constructor(name) {
        this.isActive = false;
        this.isEnabled = false;
        this.disasterName = "";
        this.scoreboardName = "";
        this.activeTime = 0;
        this.disasterCenterPoint = undefined;
        this.disasterRange = 512;
        this.effectVisualRange = 64;
        this.effectRange = 16;
        this.effectCenterRandomOffsetRange = 32;
        this.defaultDuration = 20 * 60;
        this.overworld = world.getDimension("overworld");
        // sounds
        this.playerSoundMap = new Map();
        this.disasterName = name;
        this.scoreboardName = "." + name.replace(" ", "_");
    }
    clearSoundMap() {
        this.playerSoundMap.clear();
    }
    // protected getPlayerEffectPoint(player: Player): Vector3 | undefined {
    //     if (this.disasterCenterPoint == undefined) return undefined;
    //     let pDist = Vector.distance(this.disasterCenterPoint, player.location);
    //     if (pDist <= this.disasterRange) return player.location;
    //     // if we are geater than both ranges, we are too far from the effect
    //     if (pDist > (this.disasterRange + this.effectVisualRange)) return undefined;
    //     // we are within disasterRange and disasterRange + effectRange
    //     // we need to return the point where the player crossed the range bounds
    //     return this.getPlayerIntersectPoint(player.location);
    // }
    getEffectPoint(location) {
        if (this.disasterCenterPoint == undefined)
            return undefined;
        let pDist = Vector.distance(this.disasterCenterPoint, location);
        if (pDist <= this.disasterRange)
            return location;
        // if we are geater than both ranges, we are too far from the effect
        if (pDist > (this.disasterRange + this.effectVisualRange))
            return undefined;
        // we are within disasterRange and disasterRange + effectRange
        // we need to return the point where the player crossed the range bounds
        return this.getIntersectPoint(location);
    }
    isInEffectRange(entity) {
        if (this.disasterCenterPoint == undefined)
            return false;
        return Vector.distance(this.disasterCenterPoint, entity.location) <= (this.disasterRange + this.effectRange) ? true : false;
    }
    isPointInEffectRange(location) {
        // need to make a new interface
        // if I set to a new vairable it modifies the input
        // this is super stupid and should never happen, js is useless.
        let check = { x: location.x, y: this.disasterCenterPoint.y, z: location.z };
        let dist = Vector.distance(check, this.disasterCenterPoint);
        if (dist <= (this.disasterRange + this.effectRange))
            return true;
        return false;
    }
    // should work, untested!
    getIntersectPoint(location) {
        // https://stackoverflow.com/questions/13053061/circle-line-intersection-points
        let lineB = this.disasterCenterPoint;
        let baX = lineB.x - location.x;
        let baZ = lineB.z - location.z;
        let caX = this.disasterCenterPoint.x - location.x;
        let caZ = this.disasterCenterPoint.z - location.z;
        let a = baX * baX + baZ * baZ;
        let bBy2 = baX * caX + baZ * caZ;
        let c = caX * caX + caZ * caZ - this.disasterRange * this.disasterRange;
        let pBy2 = bBy2 / a;
        let q = c / a;
        let disc = pBy2 * pBy2 - q;
        if (disc < 0)
            return undefined;
        let tmpS = Math.sqrt(disc);
        let abScalin1 = -pBy2 + tmpS;
        return { x: location.x - baX * abScalin1, y: location.y, z: location.z - baZ * abScalin1 };
    }
    generateCenterPoint() {
        let players = this.overworld.getPlayers();
        let r = randomRange(0, players.length - 1);
        // a bit more randomness
        this.disasterCenterPoint = normalizeLocation(randomPointInCircle(players[r].location, this.effectCenterRandomOffsetRange));
    }
    randomiseDisasterLength(time) {
        if (time != undefined) {
            this.activeTime = Math.floor(time * randomRangeFloat(1.2, 1.6));
            return;
        }
        this.activeTime = Math.floor(this.defaultDuration * randomRangeFloat(1.2, 1.6));
    }
}
