import { BlockPermutation, system, world } from "@minecraft/server";
import { getOrCreateScoreboard, isBlockAtLocation, randomRange } from "./util";
import { Vector } from "./vector";
export var AnimatedBlock;
(function (AnimatedBlock) {
    const animatedBlockBoard = getOrCreateScoreboard("spark_disasters:animated_blocks");
    const animationStore = new Map();
    // animation stuff
    const animatedBlocks = new Map();
    const activeAnimation = new Map();
    const animatedTypes = new Set();
    // only supports overworld currently
    const overworld = world.getDimension("overworld");
    // range in square (24)
    // animations are paused when out of range!
    const animateRangeSquared = 2304;
    function init() {
        // load all blocks from that board :D
        loadFromBoard(animatedBlockBoard);
        system.run(tick);
    }
    AnimatedBlock.init = init;
    function tick() {
        // do the loop yes :D
        let players = overworld.getPlayers();
        // loop over each active block, if they have an active animation, process
        for (const block of animatedBlocks) {
            if (isPlayingAnimation(block[0])) {
                // TODO: pause when out of range (change later)
                if (!isPlayerInRange(block[1].location, players))
                    continue;
                processAnimation(block[0], block[1]);
            }
        }
        system.run(tick);
    }
    function processAnimation(key, blockData) {
        // frame stuff
        let anim = activeAnimation.get(key);
        let data = animationStore.get(anim);
        if (!isBlockAtLocation(overworld, blockData.location, blockData.type)) {
            animatedBlocks.delete(key);
            return;
        }
        if (Number.isNaN(blockData.currentTick)) {
            blockData.currentTick = 0;
        }
        if (data.isStatic) {
            let block = overworld.getBlock(blockData.location);
            // if current block state != animation default blockstate
            let r = {};
            r[data.permutationIdentifier] = blockData.frame;
            let isDefaultPerm = block.permutation.matches(blockData.type, r);
            if (!isDefaultPerm) {
                // set to default
                let r = {};
                r[data.permutationIdentifier] = data.startFrame;
                block.setPermutation(BlockPermutation.resolve(blockData.type, r));
            }
        }
        // we can do the block stuff later
        blockData.currentTick++;
        blockData.currentTick = blockData.currentTick % data.ticksPerFrame;
        if (blockData.currentTick == 0) {
            // we can advance to the next frame
            blockData.frame++;
            // wrap
            if (blockData.frame > data.endFrame)
                blockData.frame = data.startFrame;
            // sounds
            if (data.soundToPlay != undefined) {
                if (blockData.frame == data.soundFrameTrigger) {
                    // play sound, not a good solution
                    world.playSound(data.soundToPlay, blockData.location, { "volume": 8.0 });
                }
            }
            // for now we just update the permutation
            // no saving yet.
            let block = overworld.getBlock(blockData.location);
            block.setPermutation(BlockPermutation.resolve(blockData.type, {
                "spark_disasters:texture_state": blockData.frame
            }));
        }
    }
    function playAnimation(location, animation) {
        if (!animationStore.has(animation))
            throw new Error(`Animation does not exist ${animation}, check your spelling.`);
        let animData = animationStore.get(animation);
        let key = getKeyFromVector(location);
        if (activeAnimation.has(key)) {
            if (activeAnimation.get(key) == animation)
                return;
        }
        if (!animatedBlocks.has(key))
            throw new Error(`Block does not exist in animationBlocks ${key}`);
        let blockData = animatedBlocks.get(key);
        // reset block data
        blockData.frame = animData.startFrame;
        activeAnimation.set(key, animation);
    }
    AnimatedBlock.playAnimation = playAnimation;
    function stopAnimation(location) {
        let key = getKeyFromVector(location);
        if (activeAnimation.has(key)) {
            // reset data
            let blockData = animatedBlocks.get(key);
            blockData.frame = 0;
            activeAnimation.delete(key);
        }
    }
    AnimatedBlock.stopAnimation = stopAnimation;
    function registerBlock(type) {
        // type stuff
        if (animatedTypes.has(type))
            throw new Error(`Duplicate type in animationTypes ${type}`);
        animatedTypes.add(type);
    }
    AnimatedBlock.registerBlock = registerBlock;
    function registerAnimation(key, permutationIdentifier, startFrame, endFrame, ticksPerFrame) {
        if (animationStore.has(key))
            throw new Error(`Key already exists in animationStore: ${key}`);
        let data = {
            permutationIdentifier: permutationIdentifier,
            startFrame: startFrame,
            endFrame: endFrame,
            ticksPerFrame: ticksPerFrame,
            isStatic: (startFrame == endFrame) ? true : false
        };
        animationStore.set(key, data);
        return data;
    }
    AnimatedBlock.registerAnimation = registerAnimation;
    function isPlayerInRange(location, players) {
        for (const player of players) {
            if (Vector.distanceSquared(location, player.location) < animateRangeSquared) {
                return true;
            }
        }
        return false;
    }
    function loadFromBoard(board) {
        let entries = board.getParticipants();
        for (const entry of entries) {
            // load the data :D
            let elements = entry.displayName.split(";");
            let key = elements[0];
            let frame = board.getScore(entry);
            let vec = getVectorFromBlockKey(key);
            if (animatedBlocks.has(key))
                continue;
            animatedBlocks.set(key, {
                location: vec,
                frame: frame,
                type: elements[1],
                currentTick: randomRange(0, 100) // a offset for random looking animations and such
            });
        }
    }
    function isPlayingAnimation(key) {
        if (activeAnimation.has(key))
            return true;
        return false;
    }
    // events
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
        let block = event.block;
        let type = getTypeFromPermutation(block.permutation);
        if (type == "")
            return;
        let key = getKeyFromBlock(block);
        let fullKey = combineKey(key, type);
        // create animation data
        animatedBlockBoard.setScore(fullKey, 0);
        // add type
        let data = {
            location: block.location,
            frame: 0,
            type: type,
            currentTick: randomRange(0, 100) // a offset for random looking animations and such
        };
        animatedBlocks.set(key, data);
        // make it play an animation for now
        // playAnimation(block.location, "spark_disasters:alarm_block.pulse");
    });
    world.afterEvents.playerBreakBlock.subscribe((event) => {
        let block = event.block;
        let type = getTypeFromPermutation(event.brokenBlockPermutation);
        if (type == "")
            return;
        let key = getKeyFromBlock(block);
        let fullKey = combineKey(key, type);
        // TODO: mark for delete, this creates ghost blocks currently
        if (animatedBlockBoard.hasParticipant(fullKey))
            animatedBlockBoard.removeParticipant(fullKey);
        // clear stuff for this block
        if (animationStore.has(key))
            animationStore.delete(key);
        if (animatedBlocks.has(key))
            animatedBlocks.delete(key);
    });
    function getTypeFromPermutation(perm) {
        for (const t of animatedTypes) {
            if (perm.matches(t)) {
                return t;
            }
        }
        return "";
    }
    function getKeyFromBlock(block) {
        return getKeyFromVector(block.location);
    }
    function getKeyFromVector(location) {
        return location.x.toString() + ":" + location.y.toString() + ":" + location.z.toString();
    }
    function getVectorFromBlockKey(location) {
        let parts = location.split(":").map(Number);
        return { x: parts[0], y: parts[1], z: parts[2] };
    }
    function combineKey(location, type) {
        return location + ";" + type;
    }
})(AnimatedBlock || (AnimatedBlock = {}));
