import { EquipmentSlot, ItemStack, system, world } from "@minecraft/server";
import { Vector } from "./vector";
import { Spline } from "./equake/spline";
import { FissureEffectType } from "./equake/fissureNew";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
export var FissureDebug;
(function (FissureDebug) {
    let offsetBlock = "minecraft:bedrock";
    let destructionBlock = "minecraft:stone";
    let destructionOffsets = [];
    const overworld = world.getDimension("overworld");
    // new stuff, no splines
    let saveBlock = "minecraft:white_concrete";
    let frameOffsetBlock = "minecraft:brown_concrete";
    let frameOffsetPosition = undefined;
    let clusterBlock = "minecraft:grass";
    let radiusBlock = "minecraft:red_concrete";
    // fissures
    let fissureFrames = [];
    let activeFissureFrame = undefined;
    let giveMenuItem = "minecraft:white_concrete_powder";
    let menuItem = "minecraft:paper";
    let giveMenuItemName = "Create Frame";
    let listMenuItemName = "List Frames";
    let seeVoidItemName = "See Void Blocks";
    let resetVoidItemName = "Reset void Blocks";
    let frameOffsetItemName = "Set offset";
    let radiusItemName = "Set circle radius";
    let clusterBlockItemname = "Set square min/max";
    let saveBlockItemName = "Save data";
    let splineBlockItemName = "Spline block";
    // non tag stuff
    let voidSeeBlock = "minecraft:orange_concrete_powder";
    let voidResetBlock = "minecraft:magenta_concrete_powder";
    // splines
    let splineBlock = "minecraft:dirt";
    let splines = [];
    let activeSpline = undefined;
    let chunkLoader = undefined;
    function init() {
        system.run(tick);
    }
    FissureDebug.init = init;
    function tick() {
        for (const player of overworld.getPlayers()) {
            // see structure_void
            if (isPlayerHolding(player, voidSeeBlock)) {
                player.runCommandAsync("fill ~-15 ~-8 ~-15 ~15 ~8 ~15 stonebrick replace structure_void");
            }
            if (isPlayerHolding(player, voidResetBlock)) {
                player.runCommandAsync("fill ~-15 ~-8 ~-15 ~15 ~8 ~15 structure_void replace stonebrick");
            }
            if (isPlayerHolding(player, splineBlock)) {
                if (activeSpline == undefined)
                    return;
                activeSpline.drawPath(0.2);
            }
        }
        system.run(tick);
    }
    world.afterEvents.itemUse.subscribe((event) => {
        let item = event.itemStack;
        let player = event.source;
        if (player.typeId != "minecraft:player")
            return;
        // create item
        if (item.typeId == giveMenuItem) {
            givePlayerMenu(player);
            return;
        }
        if (item.nameTag != undefined) {
            if (item.nameTag == giveMenuItemName) {
                if (!player.isSneaking) {
                    showCreateMenu(player);
                    return;
                }
                showCreateMenuEdit(player);
                return;
            }
            if (item.nameTag == listMenuItemName) {
                showListMenu(player);
                return;
            }
        }
    });
    function givePlayerMenu(player) {
        // clear inventory
        let inventory = player.getComponent("minecraft:inventory");
        let container = inventory.container;
        container.clearAll();
        // loop over hotbar (0-9) I think
        let createMenuItem = new ItemStack(menuItem, 1);
        createMenuItem.nameTag = giveMenuItemName;
        let listMenuItem = new ItemStack(menuItem, 1);
        listMenuItem.nameTag = listMenuItemName;
        let voidSeeItem = new ItemStack(voidSeeBlock, 1);
        voidSeeItem.nameTag = seeVoidItemName;
        let voidResetItem = new ItemStack(voidResetBlock, 1);
        voidResetItem.nameTag = resetVoidItemName;
        let clusterBlockItem = new ItemStack(clusterBlock, 1);
        clusterBlockItem.nameTag = clusterBlockItemname;
        let frameOffsetItem = new ItemStack(frameOffsetBlock, 1);
        frameOffsetItem.nameTag = frameOffsetItemName;
        let radiusBlockItem = new ItemStack(radiusBlock, 1);
        radiusBlockItem.nameTag = radiusItemName;
        let saveBlockItem = new ItemStack(saveBlock);
        saveBlockItem.nameTag = saveBlockItemName;
        let splineBlockItem = new ItemStack(splineBlock);
        splineBlockItem.nameTag = splineBlockItemName;
        container.setItem(0, createMenuItem);
        container.setItem(1, listMenuItem);
        container.setItem(2, frameOffsetItem);
        container.setItem(3, radiusBlockItem);
        container.setItem(4, clusterBlockItem);
        container.setItem(5, splineBlockItem);
        container.setItem(6, saveBlockItem);
        container.setItem(7, voidSeeItem);
        container.setItem(8, voidResetItem);
    }
    function showCreateMenu(player) {
        // I need structure nane
        // frame time
        // particle count
        let form = new ModalFormData();
        form.title("Create new fissure frame");
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Structure Name"
                }
            ]
        }, {
            rawtext: [
                {
                    text: ""
                }
            ]
        });
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Frame Time"
                }
            ]
        }, {
            rawtext: [
                {
                    text: "0"
                }
            ]
        });
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Particle Count"
                }
            ]
        }, {
            rawtext: [
                {
                    text: "0"
                }
            ]
        });
        form.show(player).then((result) => {
            if (!result.canceled) {
                // parse data
                let strucName = result.formValues[0];
                let frameTime = parseInt(result.formValues[1].toString());
                let partCount = parseInt(result.formValues[2].toString());
                let data = {
                    structure: strucName,
                    frameTime: frameTime,
                    particleCount: partCount,
                    particleEmitters: []
                };
                fissureFrames.push(data);
                activeFissureFrame = data;
                // notify of offset requirement
                player.sendMessage("Please set an offset to begin.");
            }
        });
    }
    function showCreateMenuEdit(player) {
        if (activeFissureFrame == undefined) {
            player.sendMessage("No active fissure frame data exists!");
            return;
        }
        let data = activeFissureFrame;
        let form = new ModalFormData();
        form.title("Edit fissure frame");
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Structure Name"
                }
            ]
        }, {
            rawtext: [
                {
                    text: data.structure
                }
            ]
        }, data.structure);
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Frame Time"
                }
            ]
        }, {
            rawtext: [
                {
                    text: data.frameTime.toString()
                }
            ]
        }, data.frameTime.toString());
        form.textField({
            rawtext: [
                {
                    text: "\n"
                },
                {
                    text: "Particle Count"
                }
            ]
        }, {
            rawtext: [
                {
                    text: data.particleCount.toString()
                }
            ]
        }, data.particleCount.toString());
        form.show(player).then((result) => {
            if (!result.canceled) {
                // parse data
                let strucName = result.formValues[0];
                let frameTime = parseInt(result.formValues[1].toString());
                let partCount = parseInt(result.formValues[2].toString());
                // this should be ok I think
                let actData = activeFissureFrame;
                if (strucName != "")
                    actData.structure = strucName;
                if (!Number.isNaN(result.formValues[1]))
                    actData.frameTime = frameTime;
                if (!Number.isNaN(result.formValues[2]))
                    actData.particleCount = partCount;
            }
        });
    }
    function showListMenu(player) {
        if (fissureFrames.length == 0) {
            player.sendMessage("No fissure frames exist!");
            return;
        }
        // will list all items
        // and will change the active one on select or smth
        let form = new ActionFormData();
        form.title("Select frame to be active");
        for (const f of fissureFrames) {
            form.button({
                rawtext: [
                    {
                        text: f.structure
                    }
                ]
            });
        }
        form.show(player).then((result) => {
            if (!result.canceled) {
                let selected = result.selection;
                activeFissureFrame = fissureFrames[selected];
            }
        });
    }
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
        let block = event.block;
        let player = event.player;
        if (activeFissureFrame == undefined) {
            player.sendMessage("No fissure frame is selected, create one.");
            return;
        }
        if (block.permutation.matches(frameOffsetBlock)) {
            frameOffsetPosition = Vector.centeredXZ(block.location);
            player.sendMessage(`Placed offset block at ${block.x} ${block.y} ${block.z}`);
        }
        if (frameOffsetPosition == undefined)
            return;
        // radius emitter
        if (block.permutation.matches(radiusBlock)) {
            // open ui that will ask for range
            let rangeForm = new ModalFormData();
            rangeForm.title("Set Range");
            rangeForm.textField("", "Range");
            rangeForm.show(player).then((responce) => {
                if (!responce.canceled) {
                    // check for valid value
                    let range = Number.parseInt(responce.formValues[0]);
                    if (Number.isNaN(range)) {
                        player.sendMessage("Invalid value for range, rejecting");
                        return;
                    }
                    let cont = {
                        type: FissureEffectType.Circle,
                        radius: range,
                        offset: Vector.subtract(block.location, frameOffsetPosition)
                    };
                    activeFissureFrame.particleEmitters.push(cont);
                    player.sendMessage(`There are ${activeFissureFrame.particleEmitters.length} emitters`);
                }
            });
        }
        // min and max
        if (block.permutation.matches(clusterBlock)) {
            // if sneaking, create a new emitter
            if (player.isSneaking) {
                let perm = {
                    type: FissureEffectType.Square,
                    min: Vector.subtract(block.location, frameOffsetPosition)
                };
                activeFissureFrame.particleEmitters.push(perm);
                player.sendMessage(`Set a new Fissure particle emitter at ${block.x} ${block.y} ${block.z}`);
                return;
            }
            if (activeFissureFrame.particleEmitters.length == 0) {
                player.sendMessage("No emitter has been created, create one!");
                return;
            }
            // get the last perm, if its square, set
            let perm = activeFissureFrame.particleEmitters[activeFissureFrame.particleEmitters.length - 1];
            if (perm.type == FissureEffectType.Circle) {
                player.sendMessage("Wrong emitter type, create a new one with sneak place");
                return;
            }
            perm.Max = Vector.subtract(block.location, frameOffsetPosition);
            player.sendMessage(`Set emitter ${activeFissureFrame.particleEmitters.length - 1} max at ${block.x} ${block.y} ${block.z}`);
            return;
        }
        if (block.permutation.matches(splineBlock)) {
            // if sneaking, make a new spline
            if (player.isSneaking) {
                let spline = new Spline(overworld, frameOffsetPosition);
                activeSpline = spline;
                splines.push(spline);
                player.sendMessage(`new spline added: ${splines.length - 1}`);
            }
            if (activeSpline == undefined) {
                player.sendMessage("No active splines exists, add one via sneak!");
                return;
            }
            // set point
            let point = Vector.subtract(block.location, frameOffsetPosition);
            activeSpline.addPoint(point);
            player.sendMessage(`Added point to spline: ${point.x} ${point.y} ${point.z}`);
            return;
        }
        // json export or something...
        if (block.permutation.matches(saveBlock)) {
            // special stuff
            let data = {
                size: { x: 0, y: 0, z: 0 },
                duration: 0,
                frames: fissureFrames
            };
            // if (splines.length > 0){
            //     data.splines = splines;
            // }
            if (splines.length > 0) {
                let points = [];
                for (const s of splines) {
                    points.push(s.getPoints());
                }
                data.splines = points;
            }
            return;
        }
        // if (block.permutation.matches(offsetBlock)){
        //     offsetPosition = Vector.centeredXZ(block.location);
        //     let ob = `{ x:${offsetPosition.x}, y:${offsetPosition.y}, z:${offsetPosition.z} }`
        //     console.warn("Offset set to " + ob);
        //     return; 
        // }
        // if (block.permutation.matches(logBlock)){
        //     let sd: [Vector3[]] = [[]];
        //     for (const spline of splines){
        //         sd.push(spline.getPoints());
        //     }
        //     let data: ExportData = {
        //         splineData: sd
        //     }
        //     if (clusterMin != undefined) data.clusterMin = clusterMin;
        //     if (clusterMax != undefined) data.clusterMax = clusterMax;
        //     console.warn("DATA: " + JSON.stringify(data));
        //     return;
        // }
        // if (offsetPosition == undefined){
        //     world.sendMessage("No offset position set!");
        //     return;
        // }
        // if (block.permutation.matches(destructionBlock)){
        //     let offset = Vector.subtract(block.location, offsetPosition);
        //     if (!isInList(offset, destructionOffsets)){
        //         destructionOffsets.push(offset);
        //     }
        // }
        // if (block.permutation.matches(clusterBlock)){
        //     let player = event.player;
        //     let offset = Vector.subtract(block.location, offsetPosition);
        //     if (player.isSneaking){
        //         clusterMin = offset;
        //         world.sendMessage("Cluster min set");
        //         return;
        //     }
        //     clusterMax = offset;
        //     world.sendMessage("Cluster max set");
        // }
        // // this needs towork with an offset!
        // if (block.permutation.matches(splineBlock)){
        //     let player = event.player;
        //     // if we are sneaking, we add a new spline to the cache
        //     if (player.isSneaking){
        //         if (currentSplineData.has(player.id)) currentSplineData.delete(player.id);
        //         if (!currentSplineData.has(player.id)){
        //             let spline = new Spline(overworld, offsetPosition);
        //             splines.push(spline);
        //             currentSplineData.set(player.id, spline);
        //         }
        //         player.sendMessage("Added new spline data to the cache");
        //     }
        //     // get data
        //     if (!currentSplineData.has(player.id)){
        //         player.sendMessage("No active spline is registered, please add one");
        //         return;
        //     }
        //     let spline: Spline = currentSplineData.get(player.id);
        //     spline.addPoint(Vector.subtract(offsetPosition, block.location));
        // }
    });
    world.afterEvents.playerBreakBlock.subscribe((event) => {
    });
    function removeOffset(location, array) {
        for (let i = array.length - 1; i > 0; i--) {
            if (Vector.equals(array[i], location)) {
                array.splice(i, 1);
            }
        }
    }
    function isInList(location, array) {
        for (const v of array) {
            if (Vector.equals(v, location))
                return true;
        }
        return false;
    }
    function isPlayerHolding(player, item) {
        let equip = player.getComponent("minecraft:equippable");
        let heldItem = equip.getEquipment(EquipmentSlot.Mainhand);
        if (heldItem == undefined)
            return false;
        if (heldItem.typeId == item)
            return true;
        return false;
    }
})(FissureDebug || (FissureDebug = {}));
