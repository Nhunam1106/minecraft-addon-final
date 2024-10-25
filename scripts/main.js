import { WeatherType, system, world } from "@minecraft/server";
import { getOrCreateScoreboard, isBlockLoaded, randomRange } from "./util";
import { MeteorShower } from "./func/meteorShower";
import { ModalFormData } from "@minecraft/server-ui";
import { AcidRain } from "./func/acidRain";
import { Blizzard } from "./func/blizzard";
import { Fog } from "./fog";
import { Sandstorm } from "./func/sandstorm";
import { Alarm } from "./alarm";
import { AnimatedBlock } from "./animatedBlock";
import { Guidebook } from "./guidebook";
import { Tornado } from "./func/tornado";
import { Thunderstorm } from "./func/thunderstorm";
import { Earthquake } from "./equake/earthquake";
// import { FissureDebug } from "./fissureDebug";
import { Sounds } from "./soundConfig";
let difficulty = 1;
let timer = (20 * 60) * 30; // long time for disaster trigger
let rainEffectTimer = 0;
const difficultySettings = new Map();
const disasters = [];
const itemMappings = new Map();
const removedEntityMap = new Map();
const settingsBoard = getOrCreateScoreboard("spark_disasters:disaster_controller");
let nextDisaster = "";
let warnTime = 1200;
const warnDivider = 10;
const playerBiomes = new Map();
const sandstormTester = "spark_disasters:sandstorm_tester";
const blizzardTester = "spark_disasters:blizzard_tester";
// need ---
// alarm - trigger effect, warning messages
// earthquake, lang, shift effect origin
// meteor fragments
function init() {
    // alarms
    Alarm.init();
    // FissureDebug.init();
    // animated block stuff
    AnimatedBlock.registerBlock("spark_disasters:alarm_block");
    let soundAmin = AnimatedBlock.registerAnimation("spark_disasters:alarm_block.pulse", "spark_disasters:texture_state", 0, 10, 2);
    soundAmin.soundToPlay = "sound.spark_disasters.alarm_ringing";
    soundAmin.soundFrameTrigger = 0;
    AnimatedBlock.registerAnimation("spark_disasters:alarm_block.off", "spark_disasters:texture_state", 0, 0, 0);
    AnimatedBlock.init();
    // setup fog stuff
    Fog.init();
    // populate difficulty
    difficultySettings.set(1, [25, 30]);
    difficultySettings.set(2, [15, 20]);
    difficultySettings.set(3, [10, 15]);
    difficultySettings.set(4, [5, 10]);
    difficultySettings.set(5, [2, 5]);
    disasters.push(new MeteorShower("meteor_shower"));
    itemMappings.set("spark_disasters:trigger_meteor", disasters[0]);
    disasters.push(new AcidRain("acid_rain"));
    itemMappings.set("spark_disasters:trigger_acid_rain", disasters[1]);
    disasters.push(new Blizzard("blizzard"));
    itemMappings.set("spark_disasters:trigger_blizzard", disasters[2]);
    disasters.push(new Sandstorm("sandstorm"));
    itemMappings.set("spark_disasters:trigger_sandstorm", disasters[3]);
    disasters.push(new Tornado("tornado"));
    itemMappings.set("spark_disasters:trigger_tornado", disasters[4]);
    disasters.push(new Thunderstorm("thunderstorm"));
    itemMappings.set("spark_disasters:trigger_thunderstorm", disasters[5]);
    // spark_disasters:trigger_earthquake
    disasters.push(new Earthquake("earthquake"));
    itemMappings.set("spark_disasters:trigger_earthquake", disasters[6]);
    // scoreboard
    setupScoreboard();
    system.run(internalAutoRunTick);
}
function setupScoreboard() {
    if (!settingsBoard.hasParticipant(".difficulty")) {
        settingsBoard.setScore(".difficulty", difficulty);
    }
    if (!settingsBoard.hasParticipant(".time")) {
        settingsBoard.setScore(".time", timer);
    }
    // loop over the disasters
    for (const dis of disasters) {
        if (!settingsBoard.hasParticipant(dis.scoreboardName)) {
            settingsBoard.setScore(dis.scoreboardName, dis.isEnabled == true ? 1 : 0);
        }
    }
    loadSettings();
}
function loadSettings() {
    // load all values again
    difficulty = settingsBoard.getScore(".difficulty");
    timer = settingsBoard.getScore(".time");
    for (const dis of disasters) {
        let value = settingsBoard.getScore(dis.scoreboardName);
        dis.isEnabled = value == 1 ? true : false;
    }
    // the .next thing
    let nextCheck = settingsBoard.getParticipants();
    for (let i = nextCheck.length - 1; i > -1; i--) {
        if (nextCheck[i].displayName.includes(".next:")) {
            let name = nextCheck[i].displayName;
            let elements = name.split(":");
            nextDisaster = elements[1];
        }
    }
    // link to alarm system
    for (const dis of disasters) {
        if (dis.disasterName == nextDisaster) {
            Alarm.setNextDisaster(dis);
            break;
        }
    }
}
// will be run after every settings change
function saveSettings() {
    settingsBoard.setScore(".difficulty", difficulty);
    for (const dis of disasters) {
        settingsBoard.setScore(dis.scoreboardName, dis.isEnabled == true ? 1 : 0);
    }
    // next
    let nextCheck = settingsBoard.getParticipants();
    for (let i = nextCheck.length - 1; i > -1; i--) {
        if (nextCheck[i].displayName.includes(".next:")) {
            settingsBoard.removeParticipant(nextCheck[i]);
        }
    }
    if (nextDisaster != "") {
        settingsBoard.setScore(".next:" + nextDisaster, 1);
    }
}
function saveTime() {
    settingsBoard.setScore(".time", timer);
}
function tick() {
    if (timer <= 0) {
        triggerDisaster();
    }
    queueNext();
    // update events
    for (const dis of disasters) {
        if (dis.isActive) {
            dis.tick();
        }
    }
    // update alarms
    Alarm.tick(timer);
    if (timer % 20 == 0) {
        saveTime();
    }
    timer--;
    // Rain effects
    if (rainEffectTimer >= 50) {
        let testers = {};
        let overworld = world.getDimension("overworld");
        for (let player of overworld.getPlayers()) {
            player.removeTag('spark_disasters.in_rain');
            if (player.location.y < 60)
                continue;
            let player_in_range = overworld.getPlayers({ location: player.location, maxDistance: 20 }).find(player => {
                return testers[player.id];
            });
            if (player_in_range)
                continue;
            try {
                let tester = overworld.spawnEntity('spark_disasters:rain_tester', player.location);
                testers[player.id] = tester;
            }
            catch (err) {
            }
        }
        system.runTimeout(() => {
            for (let player of overworld.getPlayers()) {
                if (player.location.y < 60)
                    continue;
                let tester = testers[player.id];
                if (!tester || !tester.isValid())
                    return;
                let raining = tester.getProperty('spark_disasters:is_raining');
                if (raining) {
                    player.addTag('spark_disasters.in_rain');
                }
            }
        }, 2);
        rainEffectTimer = 0;
    }
    if (rainEffectTimer % 4 == 0) {
        let overworld = world.getDimension("overworld");
        let players = overworld.getPlayers({ tags: ['spark_disasters.in_rain'] });
        // remove rain if blizzard is active
        if (disasters[2].isActive) {
            let time = disasters[2].activeTime;
            if (time < 100)
                time = 100;
            overworld.setWeather(WeatherType.Clear, time);
            return;
        }
        for (let player of players) {
            if (isBlockLoaded(player.location, overworld)) {
                overworld.spawnParticle('spark_disasters:light_wind_gust', player.location);
                overworld.spawnParticle('spark_disasters:light_rain_drizzle', player.location);
            }
        }
    }
    rainEffectTimer++;
}
function triggerDisaster() {
    // TODO: modify this to only choose the disasters that are enabled!
    // this should work
    let disaster = undefined;
    for (const dis of disasters) {
        if (dis.disasterName == nextDisaster) {
            disaster = dis;
            break;
        }
    }
    disaster.trigger();
    resetTimer();
}
function queueNext() {
    // biome testing
    if (timer == warnTime + 5) {
        let overworld = world.getDimension("overworld");
        for (const player of overworld.getPlayers()) {
            if (playerBiomes.has(player.id))
                playerBiomes.delete(player.id);
            let sand = overworld.spawnEntity(sandstormTester, player.location);
            let blizz = overworld.spawnEntity(blizzardTester, player.location);
            // sandstorm
            system.runTimeout(() => {
                // new 
                let value = sand.getProperty("spark_disasters:can_sandstorm");
                if (playerBiomes.has(player.id))
                    return;
                // we remove them each check, so we can easily add them back
                if (value == true) {
                    playerBiomes.set(player.id, "sandstorm");
                }
                sand.triggerEvent("spark_disasters:despawn");
            }, 2);
            // blizzard
            system.runTimeout(() => {
                // new 
                let value = blizz.getProperty("spark_disasters:can_blizzard");
                if (playerBiomes.has(player.id))
                    return;
                // we remove them each check, so we can easily add them back
                if (value == true) {
                    playerBiomes.set(player.id, "blizzard");
                }
                blizz.triggerEvent("spark_disasters:despawn");
            }, 2);
        }
    }
    if (timer == warnTime + 1) {
        let enabled = getEnabled();
        // if no disasters are available
        // reset time
        if (enabled.length == 0) {
            resetTimer();
            return;
        }
        let r = randomRange(0, enabled.length - 1);
        let dis = enabled[r];
        nextDisaster = dis.disasterName;
        // need to biome test for both the sandstorm and blizzard
        if (dis.disasterName == "blizzard" || dis.disasterName == "sandstorm") {
            if (!anyPlayerInValidBiome(dis.disasterName)) {
                resetTimer();
                return;
            }
        }
        saveSettings();
        // warn alarms nad stuff
        Alarm.setNextDisaster(dis);
    }
}
function anyPlayerInValidBiome(biome) {
    let isValid = false;
    for (const player of world.getDimension("overworld").getPlayers()) {
        if (playerBiomes.has(player.id)) {
            if (playerBiomes.get(player.id) == biome) {
                isValid = true;
            }
        }
    }
    return isValid;
}
function getEnabled() {
    let enabled = [];
    for (const dis of disasters) {
        if (dis.isEnabled) {
            // only allow meteor shower to play during night time
            if (dis.disasterName == "meteor_shower") {
                let worldTime = world.getTimeOfDay();
                if (worldTime > 13000 && worldTime < 23000) {
                    enabled.push(dis);
                }
                continue;
            }
            enabled.push(dis);
        }
    }
    return enabled;
}
function resetTimer() {
    let span = difficultySettings.get(difficulty);
    let r = randomRange(span[0], span[1]);
    timer = ((20 * 60) * r) + 1;
    // warnTime = Math.floor((((20 * 60) * span[1]) + 1) / warnDivider);
}
function getMaxDifficulty() {
    return difficultySettings.size;
}
// events and stuff
world.afterEvents.itemUse.subscribe((event) => {
    if (event.itemStack.typeId == "spark_disasters:disaster_controller") {
        showSettings(event.source);
    }
    if (itemMappings.has(event.itemStack.typeId)) {
        let disaster = itemMappings.get(event.itemStack.typeId);
        // set as current disaster for alarm
        Alarm.setNextDisaster(disaster);
        disaster.triggerOnPlayer(event.source);
    }
});
system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id == "spark_disasters:diff") {
        let mess = event.message.split(" ");
        if (mess.length == 0)
            return;
        let setting = parseInt(mess[0]);
        difficulty = setting;
        resetTimer();
    }
    if (event.id == "spark_disasters:time") {
        let mess = event.message.split(" ");
        if (mess.length == 0)
            return;
        let time = parseInt(mess[0]);
        timer = time;
    }
    // differ structure pasting
    if (event.id == "spark_disasters:explode_large") {
        if (event.sourceEntity.typeId == "spark_disasters:meteor") {
            disasters[0].differMeteorStructureSpawn(event);
        }
    }
});
// settings menu
function showSettings(player) {
    let form = new ModalFormData();
    // form title
    form.title({
        rawtext: [
            {
                translate: "spark_disasters.ui.menu.title"
            }
        ]
    });
    // difficulty lang
    form.slider({
        rawtext: [
            {
                text: "\n"
            },
            {
                translate: "spark_disasters.ui.menu.flavor",
                with: [
                    "\n"
                ]
            },
            {
                text: "\n"
            },
            {
                translate: "spark_disasters.ui.menu.disasters_slider"
            }
        ]
    }, 1, getMaxDifficulty(), 1, difficulty);
    // disaster lang
    for (const dis of disasters) {
        form.toggle({
            rawtext: [
                {
                    translate: `spark_disasters.ui.menu.${dis.disasterName.replace(" ", "_")}.name`
                }
            ]
        }, dis.isEnabled);
    }
    // show
    form.show(player).then((result) => {
        if (!result.canceled) {
            let values = result.formValues;
            let diff = values[0];
            if (diff != difficulty) {
                difficulty = diff;
                resetTimer();
            }
            for (let i = 0; i < disasters.length; i++) {
                let dis = disasters[i];
                dis.isEnabled = values[i + 1];
            }
            // regenerate .next if required
            if (timer <= warnTime) {
                let enabled = getEnabled();
                let r = randomRange(0, enabled.length - 1);
                let dis = enabled[r];
                nextDisaster = dis.disasterName;
            }
            // save
            saveSettings();
        }
    });
    player.playSound(Sounds.uiOpenSound);
    // saving
}
function internalAutoRunTick() {
    system.run(internalAutoRunTick);
    tick();
}
// events and stuff
world.beforeEvents.entityRemove.subscribe((entity) => {
    if (entity.removedEntity.typeId != "spark_disasters:meteor")
        return;
    if (!removedEntityMap.has(entity.removedEntity.id)) {
        removedEntityMap.set(entity.removedEntity.id, entity.removedEntity.location);
    }
});
world.afterEvents.entityRemove.subscribe((entity) => {
    let id = entity.removedEntityId;
    if (!removedEntityMap.has(id))
        return;
    let location = removedEntityMap.get(id);
    let overworld = world.getDimension("overworld");
    if (!isBlockLoaded(location, overworld))
        return;
    // get items around it and remove
    let items = overworld.getEntities({ type: "minecraft:item", location: location, maxDistance: 10 });
    for (const item of items) {
        if (item.isValid()) {
            item.teleport({ x: location.x, y: -100, z: location.z });
        }
    }
    removedEntityMap.delete(id);
}, {
    entityTypes: ["spark_disasters:meteor"]
});
init();
// guidebook on join
Guidebook.init({
    entityId: 'spark_disasters:guide_book',
    itemId: 'spark_disasters:guide_book_spawn_egg',
    tag: 'spark_disasters:has_joined_before',
    projectName: "disasters"
});
