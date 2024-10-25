import { Vector } from "../vector";
import { getAboveHighestPoint, rotOffset2D } from "../util";
export class Spline {
    constructor(dim, origin) {
        this.points = [];
        this.length = 0;
        this.offset = new Vector(0.5, 0, 0.5);
        this.rotation = 0;
        this.visualStep = 0;
        this.particleTrace = "minecraft:redstone_wire_dust_particle";
        this.specialTraceEffect = "spark_disasters:earthquake_appear_dust";
        this.dimension = dim;
        this.origin = origin;
    }
    addPoint(location) {
        this.points.push(Vector.centeredXZ(location));
        this.calculateLength();
    }
    addPoints(points) {
        for (const p of points) {
            this.points.push(Vector.centeredXZ(p));
        }
        this.calculateLength();
    }
    getPoints() {
        return this.points;
    }
    setRotation(rotation) {
        this.rotation = rotation;
    }
    setEffect(effect) {
        this.particleTrace = effect;
    }
    removePointAt(location) {
        for (let i = this.points.length - 1; i > -1; i++) {
            let point = this.points[i];
            if (Vector.equals(point, location)) {
                this.removePoint(i);
                return;
            }
        }
    }
    removePoint(point) {
        if (this.points.length >= point) {
            this.points.splice(point, 1);
        }
    }
    drawPath(step) {
        this.visualStep += step;
        if (this.visualStep > this.length) {
            this.visualStep = 0;
        }
        let point = Vector.add(this.origin, this.getPoint(this.visualStep));
        let highest = getAboveHighestPoint(this.dimension, point);
        let r = Math.random();
        // play effect :D
        // this.dimension.spawnParticle(this.particleTrace, Vector.add(highest, this.offset));
        this.dimension.spawnParticle(r <= 0.01 ? this.specialTraceEffect : this.particleTrace, highest);
    }
    getPoint(step) {
        if (step > this.length) {
            return this.points[this.points.length - 1];
        }
        // dumb, but it works for now
        let totalDistance = 0;
        let lastDist = 0;
        for (let i = 0; i < this.points.length - 1; i++) {
            let dist = Vector.distance(this.points[i], this.points[i + 1]);
            totalDistance += dist;
            if (step <= totalDistance) {
                // we are in the correct segment
                // calculate the intermediat distance from lastDist
                let intermediat = step - lastDist;
                let p0 = this.rotation == 0 ? this.points[i] : rotOffset2D(this.rotation, this.origin, this.points[i]);
                let p1 = this.rotation == 0 ? this.points[i + 1] : rotOffset2D(this.rotation, this.origin, this.points[i + 1]);
                // calc, this should be all that we need...
                let dir = Vector.subtract(p1, p0).normalized();
                let scale = Vector.multiplyScalar(dir, intermediat);
                return Vector.add(p0, scale);
            }
            lastDist += dist;
        }
        // at this stage, its broke
        return this.points[0];
    }
    calculateLength() {
        if (this.points.length == 1) {
            this.length = 0;
            return;
        }
        this.length = 0;
        for (let i = 0; i < this.points.length - 1; i++) {
            let localDistance = Vector.distance(this.points[i], this.points[i + 1]);
            this.length += localDistance;
        }
    }
}
