import { world } from "@minecraft/server";
import { getHighestPoint, isBlockLoaded, randomPointInCircle, randomRange, vector2string } from "../util";
import { Vector } from "../vector";
import { Spline } from "./spline";
import { Sounds } from "../soundConfig";
const splineParticleEffectIdentifier = "spark_disasters:earthquake_crack_appear_spot_f";
export class FissureNew {
    constructor(spawnLocation, size, duration) {
        this.isFinished = false;
        this.frames = [];
        this.currentFrame = 0;
        this.currentFrameTime = 0;
        this.fissureEffectEntity = "spark_disasters:earthquake_destruction";
        // splines
        this.splines = [];
        this.splineTriggerTime = 0;
        this.splineSpeed = -1;
        this.activeSplines = [];
        // chunk loader, spawn at center
        this.chunkLoader = undefined;
        this.spawnLocation = spawnLocation;
        this.size = size;
        this.center = { x: this.spawnLocation.x + (this.size.x / 2), y: 0, z: this.spawnLocation.z + (this.size.z / 2) };
        this.overworld = world.getDimension("overworld");
        this.duration = duration;
        this.triggerTime = duration - 1;
        this.effectTime = 0;
        this.rotation = 0;
        this.chunkLoader = this.overworld.spawnEntity("spark_disasters:chunk_loader", this.center);
    }
    static fromData(spawnLocation, data) {
        let f = new FissureNew(spawnLocation, data.size, data.duration);
        // frames
        f.frames = data.frames;
        // calculate trigger time from frams
        let total = 0;
        for (const frame of f.frames) {
            total += frame.frameTime;
        }
        f.triggerTime = total;
        // splines
        if (data.splines != undefined) {
            for (const s of data.splines) {
                let spline = new Spline(world.getDimension("overworld"), spawnLocation);
                spline.setEffect(splineParticleEffectIdentifier);
                spline.addPoints(s);
                f.splines.push(spline);
            }
            data.splineDuration == undefined ? f.splineTriggerTime = 200 : f.splineTriggerTime = data.splineDuration;
            data.splineSpeed == undefined ? f.splineSpeed = -1 : f.splineSpeed = data.splineSpeed;
            // if (data.splineDuration == undefined){
            //     // a default
            //     f.splineTriggerTime = f.duration = 200;
            // }
            // if (data.splineDuration != undefined){
            //     f.splineTriggerTime = data.splineDuration;
            // }
        }
        return f;
    }
    // implementation
    tick() {
        if (this.duration <= this.triggerTime) {
            this.processFrameEffects();
        }
        // check for players around the center of the structure
        // if they exist, spawn in the block effects at the players feet
        // add extra effects around the center point or something.
        this.processOtherEffects();
        if (this.duration <= 0) {
            this.isFinished = true;
        }
        this.duration--;
    }
    processFrameEffects() {
        // get current frame 
        let currentFrame = this.frames[this.currentFrame];
        if (this.currentFrameTime == 0) {
            // process effect
            this.drawFrameEffect(currentFrame);
        }
        this.currentFrameTime++;
        if (this.currentFrameTime == currentFrame.frameTime) {
            this.currentFrameTime = 0;
            this.currentFrame++;
        }
        if (this.currentFrame > this.frames.length - 1) {
            // we done
            this.isFinished = true;
        }
    }
    drawFrameEffect(frame) {
        // paste in structure
        let command = `structure load spark_disasters:${frame.structure} ${this.vector2string(this.spawnLocation)} ${this.rotation.toString()}_degrees none`;
        this.overworld.runCommandAsync(command);
        // loop over the emitters
        for (let i = 0; i < frame.particleCount; i++) {
            let emitter = frame.particleEmitters[randomRange(0, frame.particleEmitters.length - 1)];
            if (emitter.type == FissureEffectType.Circle) {
                let rawLocation = randomPointInCircle(emitter.offset, emitter.radius);
                let location = Vector.add(this.spawnLocation, rawLocation);
                let highest = getHighestPoint(this.overworld, location);
                this.spawnEffect(highest);
                continue;
            }
            if (emitter.type == FissureEffectType.Square) {
                let rx = randomRange(emitter.min.x, emitter.Max.x);
                let rz = randomRange(emitter.min.z, emitter.Max.z);
                let location = Vector.add(this.spawnLocation, { x: rx, y: this.spawnLocation.y, z: rz });
                let highest = getHighestPoint(this.overworld, location);
                this.spawnEffect(highest);
                continue;
            }
        }
        // if last frame
        if (this.frames[0].structure == frame.structure) {
            // play sounds
            for (const player of this.overworld.getPlayers()) {
                // work out the required values
                let sound = randomRange(0, 1) == 0 ? Sounds.earthquakeFissureLarge : Sounds.earthquakeFissureSmall;
                player.runCommandAsync(`playsound ${sound} @s`);
            }
        }
    }
    spawnEffect(location) {
        if (isBlockLoaded(location, this.overworld)) {
            // this.overworld.spawnParticle(this.fissureEffectEntity, location);
            this.overworld.spawnEntity(this.fissureEffectEntity, location);
        }
    }
    processOtherEffects() {
        // hook spline back up for the effects
        // and play those if a player is near thaty should show the crack that will form
        // sounds
        if (this.duration % Sounds.earthquakeFissureWarningMod == 0) {
            let highest = getHighestPoint(this.overworld, this.center);
            this.overworld.runCommandAsync(`playsound ${Sounds.earthquakeFissureWarning} @a ${vector2string(highest)} 4 1 1`);
        }
        if (this.duration <= this.splineTriggerTime) {
            // chance to trigger a spline
            for (const spline of this.splines) {
                if (spline.visualStep == 0) {
                    // a random chance to activate this spline
                    if (Math.random() <= 0.05) {
                        this.activeSplines.push(spline);
                    }
                }
            }
            // remove spline if required
            // and update spline
            for (let i = this.activeSplines.length - 1; i > -1; i--) {
                let spline = this.activeSplines[i];
                if (spline.visualStep >= spline.length) {
                    this.activeSplines.splice(i, 1);
                    continue;
                }
                // update over time
                let step = spline.length / this.splineTriggerTime;
                if (this.splineSpeed > 0)
                    step = this.splineSpeed;
                spline.drawPath(step);
            }
        }
    }
    vector2string(v) {
        return `${v.x.toString()} ${v.y.toString()} ${v.z.toString()}`;
    }
}
export var FissureEffectType;
(function (FissureEffectType) {
    FissureEffectType[FissureEffectType["Square"] = 0] = "Square";
    FissureEffectType[FissureEffectType["Circle"] = 1] = "Circle";
})(FissureEffectType || (FissureEffectType = {}));
