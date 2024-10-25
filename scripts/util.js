import { EquipmentSlot, world } from "@minecraft/server";
import { Vector } from "./vector";
const eatableTypes = [
    // flowers
    "minecraft:yellow_flower",
    "minecraft:red_flower",
    "minecraft:double_plant",
    "minecraft:torchflower",
    "minecraft:pitcher_plant",
    "minecraft:wither_rose",
    "minecraft:tallgrass",
    // leaves
    "minecraft:leaves",
    "minecraft:leaves2",
    "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves",
    "minecraft:azalea_leaves",
    "minecraft:azalea_leaves_flowered",
    // wool
    "minecraft:wool",
    // crops
    "minecraft:beetroot",
    "minecraft:carrots",
    "minecraft:melon_block",
    "minecraft:melon_stem",
    "minecraft:potatoes",
    "minecraft:pumpkin",
    "minecraft:carved_pumpkin",
    "minecraft:pumpkin_stem",
    "minecraft:reeds",
    "minecraft:wheat",
    "minecraft:vine",
    // snow?
    "minecraft:snow_layer",
    // dirt
    "minecraft:grass"
];
const leavesType = [
    // leaves
    "minecraft:leaves",
    "minecraft:leaves2",
    "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves",
    "minecraft:azalea_leaves",
    "minecraft:azalea_leaves_flowered"
];
const logTypes = [
    "minecraft:oak_log",
    "minecraft:spruce_log",
    "minecraft:birch_log",
    "minecraft:jungle_log",
    "minecraft:acacia_log",
    "minecraft:dark_oak_log",
    "minecraft:mangrove_log",
    "minecraft:cherry_log",
    "minecraft:crimson_stem",
    "minecraft:warped_stem"
];
const heatEmittingBlocks = [
    "minecraft:lit_furnace",
    "minecraft:torch",
    "minecraft:campfire",
    "minecraft:soul_campfire",
    "minecraft:flowing_lava",
    "minecraft:lava",
    "minecraft:lit_pumpkin",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:lantern",
    "minecraft:soul_lantern"
];
const mainArmorSlots = [
    EquipmentSlot.Chest,
    EquipmentSlot.Feet,
    EquipmentSlot.Head,
    EquipmentSlot.Legs
];
/**
 * Clamps the input value to between the two numbers
 */
export const clamp = function (value, min, max) {
    return Math.max(Math.min(value, max), min);
};
export const lerp = function (start, end, lerp) {
    return start + (end - start) * lerp;
};
export const randomRange = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
};
export const randomRangeFloat = function (min, max) {
    return min + Math.random() * (max - min);
};
export const randomPointOnCircle = function (origin, radius) {
    let vec = { x: origin.x, y: origin.y, z: origin.z };
    let initAngle = Math.random() * Math.PI * 2;
    vec.x += Math.floor(Math.cos(initAngle) * radius) + 0.5;
    vec.z += Math.floor(Math.sin(initAngle) * radius) + 0.5;
    return vec;
};
export const randomPointInCircle = function (origin, radius) {
    let vec = { x: 0, y: origin.y, z: 0 };
    let r = radius * Math.sqrt(Math.random());
    let theta = Math.random() * 2 * Math.PI;
    vec.x = Math.floor(origin.x + r * Math.cos(theta)) + 0.5;
    vec.z = Math.floor(origin.z + r * Math.sin(theta)) + 0.5;
    return vec;
};
export const getHighestPoint = function (dimension, location, liquid = false, passable = false, maxHeight = 320) {
    let block = dimension.getBlockFromRay({ x: location.x, y: maxHeight, z: location.z }, Vector.down, { maxDistance: maxHeight + 64, includeLiquidBlocks: liquid, includePassableBlocks: passable });
    if (block == undefined)
        return { x: 0, y: -64, z: 0 };
    return { x: block.block.x, y: block.block.y, z: block.block.z };
};
export const getAboveHighestPoint = function (dimension, location) {
    let point = getHighestPoint(dimension, location);
    return Vector.add(point, Vector.up);
};
export const getBelowHighestPoint = function (dimension, location) {
    let point = getHighestPoint(dimension, location);
    return Vector.add(point, Vector.down);
};
export const isUnderGround = function (entity, maxHeight = 320) {
    let hit = entity.dimension.getBlockFromRay(entity.location, Vector.up, { maxDistance: maxHeight + 64, includePassableBlocks: false });
    if (hit == undefined)
        return false;
    return true;
};
export const isBlockAboveHead = function (entity) {
    let hit = entity.dimension.getBlockFromRay(entity.location, Vector.up, { maxDistance: 2 });
    return hit == undefined ? false : true;
};
export function getOrCreateScoreboard(id) {
    let scoreboard = world.scoreboard.getObjective(id);
    if (!scoreboard) {
        scoreboard = world.scoreboard.addObjective(id, id);
    }
    return scoreboard;
}
/*
*   This is not a good way of doing this... but it has to be done.
*/
export const isBlockEatable = function (block) {
    if (block.isLiquid)
        return false;
    for (const t of eatableTypes) {
        if (block.permutation.matches(t))
            return true;
    }
    return false;
};
export const isBlockHeatEmitting = function (block) {
    if (block.isAir)
        return false;
    for (const h of heatEmittingBlocks) {
        if (block.permutation.matches(h))
            return true;
    }
    return false;
};
export const isBlockLeaf = function (block) {
    if (block.isAir)
        return false;
    if (block.isLiquid)
        return false;
    for (const h of leavesType) {
        if (block.permutation.matches(h))
            return true;
    }
    return false;
};
export const isBlockLog = function (block) {
    if (block.isAir)
        return false;
    if (block.isLiquid)
        return false;
    for (const l of logTypes) {
        if (block.permutation.matches(l))
            return true;
    }
    return false;
};
export const isBlockPartOfTree = function (block) {
    if (block.isAir)
        return false;
    if (block.isLiquid)
        return false;
    if (isBlockLeaf(block))
        return true;
    if (isBlockLog(block))
        return true;
    return false;
};
export const getSnowLayerData = function (block) {
    for (let i = 0; i < 8; i++) {
        if (block.permutation.matches("minecraft:snow_layer", { height: i })) {
            return i;
        }
    }
    return -1;
};
export const isBlockLoaded = function (location, dimension) {
    try {
        return dimension.getBlock(location).isValid();
    }
    catch (e) {
        return false;
    }
    return false;
};
export const isBlockAtLocation = function (dimension, location, type) {
    if (isBlockLoaded(location, dimension)) {
        if (dimension.getBlock(location).permutation.matches(type))
            return true;
        return false;
    }
    return false;
};
export const degree2rad = function (degree) {
    return degree * (Math.PI / 180);
};
export const getKeyFromBlock = function (block) {
    return getKeyFromVector(block.location);
};
export const getKeyFromVector = function (location) {
    return location.x.toString() + ":" + location.y.toString() + ":" + location.z.toString();
};
export const getVectorFromBlockKey = function (location) {
    let parts = location.split(":").map(Number);
    return { x: parts[0], y: parts[1], z: parts[2] };
};
export const combineKey = function (location, type) {
    return location + ";" + type;
};
export const rotOffset2D = function (angle, origin, offset) {
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
};
export const normalizedEntityLocation = function (entity) {
    return { x: entity.location.x, y: 0, z: entity.location.z };
};
export const normalizeLocation = function (location) {
    return { x: location.x, y: 0, z: location.z };
};
export const vector2string = function (v) {
    return `${v.x.toString()} ${v.y.toString()} ${v.z.toString()}`;
};
export const getArmorCount = function (entity) {
    let equipment = entity.getComponent("minecraft:equippable");
    let count = 0;
    for (const equip of mainArmorSlots) {
        let result = equipment.getEquipment(equip);
        if (result != undefined) {
            count++;
        }
    }
    return count;
};
