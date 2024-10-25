import { Vector } from "../vector";
import { getHighestPoint, randomRange } from "../util";
import { Spline } from "./spline";
export class Fissure {
    constructor(structure, dimension, spawnLocation, spawnOffset, duration = 20 * 15) {
        this.splineCorrection = { x: 1, y: 0, z: 1 };
        this.debrisSplines = [];
        this.debrisEntity = "spark_disasters:earthquake_env_debris";
        this.rotation = 0;
        this.timer = 0;
        this.endTime = 0;
        this.maxParticleAttemptsPerTick = 4;
        this.particleSpawnChance = 0.1;
        this.effectSpawnRange = 32;
        this.effectEntity = "spark_disasters:earthquake_destruction";
        this.frames = 0;
        this.frameCount = 0;
        this.frameMod = 8;
        this.effectClusterMin = undefined;
        this.effectClusterMax = undefined;
        this.isFinished = false;
        this.structure = structure;
        this.dimension = dimension;
        this.spawnLocation = spawnLocation;
        this.spawnOffset = spawnOffset;
        this.trueSpawnLocation = Vector.add(this.spawnLocation, this.spawnOffset);
        this.endTime = duration;
        // spawn a chunk loaded
        this.chunkLoader = this.dimension.spawnEntity("spark_disasters:chunk_loader", this.trueSpawnLocation);
    }
    setFrames(value) {
        this.frames = value;
        let end = (this.frames * this.frameMod) + 1;
        this.endTime -= end;
    }
    setSize(size) {
        this.fissureSize = size;
    }
    setClusterData(min, max) {
        this.effectClusterMin = min;
        this.effectClusterMax = max;
    }
    // just a simple setter, we do not need to rotate values until spawn.
    rotate(radians) {
        this.rotation = radians;
        // rotate all points in the spline
        for (const spline of this.debrisSplines) {
            spline.spline.setRotation(this.rotation);
        }
    }
    addDebrisSpline(locations) {
        let spline = new Spline(this.dimension, this.trueSpawnLocation);
        spline.addPoints(locations);
        let data = {
            spline: spline,
            distanceIncrement: 0.4,
            currentStep: 0
        };
        this.debrisSplines.push(data);
    }
    tick() {
        if (this.timer >= this.endTime) {
            if (this.frames > 0) {
                this.updateStructureAnimation();
            }
            if (this.frames == 0) {
                this.isFinished = true;
                // remove stuff
                for (const sd of this.debrisSplines) {
                    sd.currentStep = 0;
                }
                // splines get deleted, we can just drop all of the debrisData
                for (const spud of this.dimension.getEntities({ type: this.debrisEntity })) {
                    spud.triggerEvent("spark_disasters:despawn");
                }
                // spawn in structure
                let command = `structure load ${this.structure} ${this.spawnLocation.toString()} ${this.rotation.toString()}_degrees none`;
                this.dimension.runCommandAsync(command);
                this.chunkLoader.triggerEvent("spark_disasters:despawn");
                return;
            }
        }
        // each tick, check for a random entry in the splines
        // if its not 0, start its motion
        let r = randomRange(0, this.debrisSplines.length - 1);
        let splineTest = this.debrisSplines[r];
        if (splineTest.currentStep == 0) {
            // spawn
            this.spawnDebris(splineTest);
        }
        // the update loop
        for (const sd of this.debrisSplines) {
            if (sd.currentStep > 0) {
                // move it
                sd.currentStep += sd.distanceIncrement;
                this.moveSplineEntity(sd);
            }
            if (sd.currentStep > sd.spline.length) {
                // remove entity, reset data
                sd.debrisEntity.triggerEvent("spark_disasters:despawn");
                sd.currentStep = 0;
            }
        }
        // other effects
        for (let i = 0; i < this.maxParticleAttemptsPerTick; i++) {
            let r = Math.random();
            if (r <= this.particleSpawnChance) {
                // spawn particle
                this.spawnEffect();
            }
        }
        this.timer++;
    }
    updateStructureAnimation() {
        if (this.timer % this.frameMod == 0) {
            // send the next part of this animation
            this.frameCount++;
            let structureID = this.structure + this.frameCount.toString();
            // spawn in structure
            let command = `structure load ${structureID} ${this.spawnLocation.toString()} ${this.rotation.toString()}_degrees none`;
            this.dimension.runCommandAsync(command);
        }
        if (this.frameCount == this.frames) {
            this.isFinished = true;
            // remove stuff
            for (const sd of this.debrisSplines) {
                sd.currentStep = 0;
            }
            // splines get deleted, we can just drop all of the debrisData
            for (const spud of this.dimension.getEntities({ type: this.debrisEntity })) {
                spud.triggerEvent("spark_disasters:despawn");
            }
            this.chunkLoader.triggerEvent("spark_disasters:despawn");
        }
    }
    spawnEffect() {
        if (this.effectClusterMin == undefined) {
            // let r = randomPointInCircle(this.trueSpawnLocation, this.effectSpawnRange);
            let rx = randomRange(0, this.fissureSize.x);
            let rz = randomRange(0, this.fissureSize.z);
            let r = { x: this.spawnLocation.x + rx, y: this.spawnLocation.y, z: this.spawnLocation.z + rz };
            let top = getHighestPoint(this.dimension, r);
            this.dimension.spawnEntity(this.effectEntity, top);
            return;
        }
        // the other way of doing this
        let rx = randomRange(this.effectClusterMin.x, this.effectClusterMax.x);
        let rz = randomRange(this.effectClusterMin.z, this.effectClusterMax.z);
        let r = { x: this.spawnLocation.x + rx, y: this.spawnLocation.y, z: this.spawnLocation.z + rz };
        let top = getHighestPoint(this.dimension, r);
        this.dimension.spawnEntity(this.effectEntity, top);
    }
    moveSplineEntity(data) {
        let ePos = data.debrisEntity.location;
        let nPos = Vector.add(this.trueSpawnLocation, data.spline.getPoint(data.currentStep));
        // fix offset?
        let heightPoint = getHighestPoint(this.dimension, Vector.subtract(nPos, this.splineCorrection));
        let v = Vector.subtract(heightPoint, ePos).normalized();
        // just yeet I think
        data.debrisEntity.applyImpulse(v);
    }
    spawnDebris(data) {
        let pos = Vector.add(this.trueSpawnLocation, data.spline.getPoint(data.currentStep));
        // in case we need to handle anything else
        data.debrisEntity = this.dimension.spawnEntity(this.debrisEntity, pos);
        data.currentStep += data.distanceIncrement;
    }
}
