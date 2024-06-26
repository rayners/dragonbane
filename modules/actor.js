import DoD_Utility from "./utility.js";
import DoDSkillTest from "./tests/skill-test.js";
import DoDRoll from "./roll.js";

export class DoDActor extends Actor {

    /** @override */
    async deleteDialog(options={}) {
        // Warn if there are tokens referring to this actor
        let scenes = [];
        for (let scene of game.scenes.contents) {
            let t = scene.tokens.find(t=>t.actorId === this.id);
            if (t) scenes.push(scene.name);
        }
        let tokenMessage = "";
        if (scenes.length > 0){
            tokenMessage = `<blockquote class="info"><p>${game.i18n.localize("DoD.ui.dialog.deleteActorTokenOnScene")}:</p><ul>`;
            for (let scene of scenes) {
                tokenMessage += `<li>${scene}</li>`;
            }
            tokenMessage += "</ul></blockquote>";
        }

        const type = game.i18n.localize(this.constructor.metadata.label);
        return Dialog.confirm({
          title: `${game.i18n.format("DOCUMENT.Delete", {type})}: ${this.name}`,
          content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.format("SIDEBAR.DeleteWarning", {type})}</p>${tokenMessage}`,
          yes: this.delete.bind(this),
          options: options
        });
    }

    /** @override */
    async _preCreate(data, options, user) {

        await super._preCreate(data, options, user);

        // If the created actor has items (only applicable to duplicated actors) bypass the new actor creation logic
        if (!data.items?.length)
        {
            if (this.type !== "monster") {
                let baseSkills = await DoD_Utility.getBaseSkills();
                if (baseSkills) {
                    data.items = baseSkills;
                    this.updateSource(data);
                }
            }
            switch (this.type) {
                case "character":
                    await this.updateSource({
                        "system.age": data.system ? data.system.age : "adult",
                        "prototypeToken.actorLink": true,
                        "prototypeToken.disposition": 1, // Friendly
                        "prototypeToken.bar1.attribute": "hitPoints",
                        "prototypeToken.bar2.attribute": "willPoints",
                        "prototypeToken.displayBars": 30, // Hovered by Anyone
                        "prototypeToken.sight.enabled": true, // Vision enabled
                    });
                    break;
                case "npc":
                    await this.updateSource({
                        "prototypeToken.disposition": 0, // Neutral
                        "prototypeToken.bar1.attribute": "hitPoints",
                        "prototypeToken.displayBars": 20, // Hovered by Owner
                    });
                    break;
                case "monster":
                    await this.updateSource({
                        "system.size": data.system ? data.system.size : "normal",
                        "prototypeToken.disposition": -1, // Hostile
                        "prototypeToken.bar1.attribute": "hitPoints",
                        "prototypeToken.displayBars": 20, // Hovered by Owner
                    });
                    break;
            }
        }
    }
    static onPreUpdateActorEvent(actor, data, _options, _userId) {
        console.log("onUpdateActorEvent", actor);

        if (foundry.utils.hasProperty(data, "system.hitPoints.value")) {
            const options = {
                anchor: CONST.TEXT_ANCHOR_POINTS.LEFT,
                fill: "0xFF0000"
            };
            actor._displayScrollingText(foundry.utils.getProperty(data, "system.hitPoints.value") - actor.system.hitPoints.value, options);
        }
        if (foundry.utils.hasProperty(data, "system.willPoints.value")) {
            const options = {
                anchor: CONST.TEXT_ANCHOR_POINTS.RIGHT,
                fill: "0x00FF00"
            };
            actor._displayScrollingText(foundry.utils.getProperty(data, "system.willPoints.value") - actor.system.willPoints.value, options);
        }

    }

    /** @override */
    async _preUpdate(data, options, user) {
        await super._preUpdate(data, options, user);

        if (foundry.utils.hasProperty(data, "system.hitPoints.value")) {
            options._deltaHP = foundry.utils.getProperty(data, "system.hitPoints.value") - this.system.hitPoints.value;
        }
        if (foundry.utils.hasProperty(data, "system.willPoints.value")) {
            options._deltaWP = foundry.utils.getProperty(data, "system.willPoints.value") - this.system.willPoints.value, options;
        }
    }

    /** @override */
    async _onUpdate(data, options, user) {
        await super._onUpdate(data, options, user);

        const hasPermission = this.testUserPermission(game.user, DoD_Utility.getViewDamagePermission());

        if (!hasPermission) return;

        if (options._deltaHP) {
            this._displayScrollingText(options._deltaHP, {
                anchor: CONST.TEXT_ANCHOR_POINTS.LEFT,
                fill: "0xFF0000",
                hidden: !hasPermission
            });
        }
        if (options._deltaWP) {
            this._displayScrollingText(options._deltaWP, {
                anchor: CONST.TEXT_ANCHOR_POINTS.RIGHT,
                fill: "0x00FF00",
                hidden: !hasPermission
            });
        }
    }

    _displayScrollingText(change, options = {}) {
        if (!change) return;
        const tokens = this.isToken ? [this.token?.object] : this.getActiveTokens(true);
        const defaultOptions = {
            anchor: (change<0) ? CONST.TEXT_ANCHOR_POINTS.BOTTOM: CONST.TEXT_ANCHOR_POINTS.TOP,
            direction: (change<0) ? 1: 2,
            fontSize: 30,
            fill: change < 0 ? "0xFF0000" : "0x00FF00",
            stroke: 0x000000,
            strokeThickness: 4,
            jitter: 0.25
        };
        const scrollOptions = {...defaultOptions, ...options};
        const scrollingText = options.hidden ? "???" : change.signedString();

        for (let t of tokens) {
            if (t) {
                canvas.interface.createScrollingText(t.center, scrollingText, scrollOptions);
            }
        }
    }

    /** @override */
    prepareData() {
        // Prepare data for the actor. Calling the super version of this executes
        // the following, in order: data reset (to clear active effects),
        // prepareBaseData(), prepareEmbeddedDocuments() (including active effects),
        // prepareDerivedData().
        super.prepareData();
    }

    /** @override */
    prepareBaseData() {
        super.prepareBaseData();

        // prepare skills
        this._prepareSkills();
        this._prepareBaseChances();
        this._prepareKin();
        this._prepareProfession();
    }

    prepareEmbeddedDocuments() {
        super.prepareEmbeddedDocuments();

        switch(this.type)
        {
            case "character":
                this._prepareEquippedItems();
                break;
            case "npc":
                this._prepareEquippedItems();
                break;
            case "monster":
                this._prepareEquippedItems();
                break;
            default:
                break;
        }

    }

    prepareDerivedData() {
        super.prepareDerivedData();

        switch(this.type)
        {
            case "character":
                this._prepareCharacterData();
                break;
            case "npc":
                this._prepareNpcData();
                break;
            case "monster":
                this._prepareMonsterData();
                break;
            default:
                break;
        }
    }

    getSkill(name) {
        let a = name.toLowerCase();
        return this.system.skills?.find(skill => skill.name.toLowerCase() === a);
    }

    _prepareCharacterData() {
        this._prepareActorStats();
        this._prepareCharacterStats();
        this._prepareSpellValues();
    }

    _prepareNpcData() {
        this._prepareActorStats();
        this._prepareNpcStats();
        this._prepareSpellValues();
    }

    _prepareMonsterData() {
        if (this.system.damageBonus) {
            this.system.damageBonus.agl = 0;
            this.system.damageBonus.str = 0;
        }
    }

    _prepareEquippedItems() {
        let armor = null;
        let helmet = null;

        for (let item of this.items.contents) {
            if (item.type === 'armor' && item.system.worn) {
                if (armor) {
                    // Already wearing armor
                    item.update({ ["system.worn"]: false });
                } else {
                    armor = item;
                }
            }
            if (item.type === 'helmet' && item.system.worn) {
                if (helmet) {
                    // Already wearing helmet
                    item.update({ ["system.worn"]: false });
                } else {
                    helmet = item;
                }
            }
        }
        this.system.equippedArmor = armor;
        this.system.equippedHelmet = helmet;
    }

    _prepareSkills() {

        this.system.skills = [];
        this.system.coreSkills = [];
        this.system.weaponSkills = [];
        this.system.magicSkills = [];
        this.system.secondarySkills = [];
        this.system.trainedSkills = [];

        for (let item of this.items.contents) {
            if (item.type === 'skill') {
                let skill = item;
                skill.system.isProfessionSkill = false;
                this.system.skills.push(skill);
                if (skill.system.skillType === 'core') {
                    this.system.coreSkills.push(skill);
                    if(skill.system.value > this._getBaseChance(skill)) {
                        this.system.trainedSkills.push(skill);
                    }
                }  else if (skill.system.skillType === 'weapon') {
                    this.system.weaponSkills.push(skill);
                    if(skill.system.value > this._getBaseChance(skill)) {
                        this.system.trainedSkills.push(skill);
                    }
                } else if (skill.system.skillType === 'magic') {
                    // schools of magic are secondary skills
                    this.system.magicSkills.push(skill);
                    this.system.secondarySkills.push(skill);
                    this.system.trainedSkills.push(skill);
                } else {
                    this.system.secondarySkills.push(skill);
                    this.system.trainedSkills.push(skill);
                }
            }
        }
    }

    _prepareCharacterStats() {
        // Damage Bonus
        this.system.damageBonus.agl = DoD_Utility.calculateDamageBonus(this.system.attributes.agl.value);
        this.system.damageBonus.str = DoD_Utility.calculateDamageBonus(this.system.attributes.str.value);

        // Will Points
        let maxWillPoints = this.system.attributes.wil.value;
        const wpBonuses = this.items.filter(i => i.type === "ability" && i.system.secondaryAttribute === "willPoints").length;
        maxWillPoints += 2 * wpBonuses;

        if (this.system.willPoints.max !== maxWillPoints) {
            // Attribute changed - keep spent amount (damage) and update max value
            let damage = this.system.willPoints.max - this.system.willPoints.value;
            if (damage < 0) {
                damage = 0;
            } else if (damage > maxWillPoints) {
                damage = maxWillPoints;
            }
            this.update({
                ["system.willPoints.max"]: maxWillPoints,
                ["system.willPoints.value"]: maxWillPoints - damage });
        }

        // Hit Points
        let maxHitPoints = this.system.attributes.con.value;
        const hpBonuses = this.items.filter(i => i.type === "ability" && i.system.secondaryAttribute === "hitPoints").length;
        maxHitPoints += 2 * hpBonuses;

        if (this.system.hitPoints.max !== maxHitPoints) {
            // Attribute changed - keep damage and update max value
            let damage = this.system.hitPoints.max - this.system.hitPoints.value;
            if (damage < 0) {
                damage = 0;
            } else if (damage > maxHitPoints) {
                damage = maxHitPoints;
            }
            this.update({
                ["system.hitPoints.max"]: maxHitPoints,
                ["system.hitPoints.value"]: maxHitPoints - damage });
        }

        // Movement
        const baseMovement = Number(this.system.kin ? this.system.kin.system.movement : 10);
        const movementModifier =  DoD_Utility.calculateMovementModifier(this.system.attributes.agl.value);
        const moveBonuses = this.items.filter(i => i.type === "ability" && i.system.secondaryAttribute === "movement").length;

        this.system.movement = baseMovement + movementModifier + 2 * moveBonuses;
    }

    _prepareActorStats() {

        // Will Points
        if (!this.system.willPoints || !Number.isInteger(this.system.willPoints.max)) {
            this.update({
                ["system.willPoints.max"]: 10,
                ["system.willPoints.value"]: 10 });
        }
    }

    _prepareNpcStats() {

    }

    _getBaseChance(skill) {
        switch (this.type) {
            case "character":
                {
                    const value = this._getAttributeValueFromName(skill.system.attribute);
                    return DoD_Utility.calculateBaseChance(value);    
                }
            case "npc":
                return 5;
            case "monster":
                return 0;
            default:
                return 0;
        }
    }

    _getAttributeValueFromName(name) {
        let attribute = this.system.attributes[name.toLowerCase()];
        if (attribute) return attribute.value;
        return 0;
    }

    _prepareBaseChances() {
        for (const item of this.items.contents) {
            if (item.type === "skill") {
                const skill = item;
                const baseChance = this._getBaseChance(skill);
                if ((skill.system.skillType === "core" || skill.system.skillType === "weapon") && skill.system.value < 1) {
                    skill.system.value = baseChance;
                }
            }
        }
    }

    get isCharacter() {
        return this.type === "character";
    }

    get isNpc() {
        return this.type === "npc";
    }

    get isMonster() {
        return this.type === "monster";
    }

    get isObserver() {
        return this.testUserPermission(game.user, "OBSERVER");
    }

    get isLimited() {
        return this.testUserPermission(game.user, "LIMITED");
    }

    get hasAbilities() {
        return this.items.find(i => i.type === "ability") != null;
    }

    get hasSpells() {
        return this.items.find(i => i.type === "spell") != null;
    }

    get hasSkills() {
        return this.system.trainedSkills.length > 0;
    }

    getEquippedWeapons() {
        return this.items.filter(i => i.type === "weapon" && i.system.worn === true);
    }

    getArmorValue(damageType) {
        let armorValue = 0;
        if (this.system.equippedArmor) {
            armorValue += this.system.equippedArmor.getArmorValue(damageType);
        }
        if (this.system.equippedHelmet) {
            armorValue += this.system.equippedHelmet.getArmorValue(damageType);
        }
        if (this.type === "monster") {
            armorValue += this.system.armor;
        }
        return armorValue;
    }

    getDamageBonus(attribute) {
        if (attribute && this.system.damageBonus && this.system.damageBonus[attribute] !== "none") {
            return this.system.damageBonus[attribute];
        } else {
            return "";
        }
    }

    async applyDamage(damage) {
        let value = this.system.hitPoints.value;
        let max = this.system.hitPoints.max;
        let newValue = DoD_Utility.clamp(value - damage, 0, max);

        // Update HP
        if (value !== newValue) {
            await this.update({["system.hitPoints.value"]: newValue});
        }
        return newValue;
    }

    findAbility(abilityName) {
        let name = abilityName.toLowerCase();
        return this.items.find(item => item.type === "ability" && item.name.toLowerCase() === name);
    }

    findSkill(skillName) {
        let name = skillName.toLowerCase();
        return this.items.find(item => item.type === "skill" && item.name.toLowerCase() === name);
    }

    testSkill(skillName, options = {defaultBanesBoons: true}) {
        const skill = this.findSkill(skillName);
        if(!skill) {
            console.log("Could not find skill: " + skillName);
            return;
        }
        const test = new DoDSkillTest(this, skill, options);
        return test.roll();
    }

    findMagicSkill(schoolName) {
        if (schoolName === "DoD.spell.general") {
            // find magic skill with highest skill value
            let bestSkill = null;
            for (let item of this.items.contents) {
                if (item.type === "skill" && item.system.skillType === "magic") {
                    if (!bestSkill || bestSkill.system.value < item.system.value) {
                        bestSkill = item;
                    }
                }
            }
            return bestSkill;
        } else {
            return this.findSkill(schoolName);
        }
    }

    findSpell(spellName) {
        let name = spellName.toLowerCase();
        return this.items.find(item => item.type === "spell" && item.name.toLowerCase() === name);
    }

    hasCondition(attributeName) {
        return this.system.conditions ? this.system.conditions[attributeName].value : false;
    }

    updateCondition(attributeName, value) {
        const field = "system.conditions." + attributeName + ".value";
        this.update({[field]: value})
    }

    async removeKin() {
        let ids = [];
        //  kin items
        this.items.contents.forEach(i => {
            if (i.type === "kin") ids.push(i.id)
        });
        //  kin ability items
        this.items.contents.forEach(i => {
            if (i.type === "ability" && i.system.abilityType === "kin") ids.push(i.id)
        });
        // delete items and clear kin
        await this.deleteEmbeddedDocuments("Item", ids);
        this.system.kin = null;
    }

    async removeProfession() {
        let ids = [];
        //  profession items
        this.items.contents.forEach(i => {
            if ((i.type === "profession")
            || (i.type === "ability" && i.system.abilityType === "profession")
            || (i.type === "skill" && (i.system.skillType === "secondary" || i.system.skillType === "magic") && i.system.value === 0))
            {
                ids.push(i.id)
            }
        });

        // delete items and clear profession
        await this.deleteEmbeddedDocuments("Item", ids);
        this.system.profession = null;
    }

    async updateKinAbilities() {
        // Character's abilities
        const abilities = this.items.filter(item => item.type === "ability");

        // Ability names defined in the current kin
        const kinAbilityNames =
            (this.system.kin && this.system.kin.system.abilities.length)
                ? DoD_Utility.splitAndTrimString(this.system.kin.system.abilities) : [];


        // Remove kin abilities not in current kin
        let removeAbilityIds = [];
        for (const ability of abilities) {
            if (ability.system.abilityType === "kin" && !kinAbilityNames.find(name => name === ability.name)) {
                removeAbilityIds.push(ability.id);
            }
        }
        if (removeAbilityIds.length) {
            await this.deleteEmbeddedDocuments("Item", removeAbilityIds);
        }

        // add missing kin abilities from current kin
        let createItemData = [];
        for(const kinAbilityName of kinAbilityNames) {
            let kinAbility = this.findAbility(kinAbilityName);
            if (!kinAbility) {
                const foundAbility = await DoD_Utility.findAbility(kinAbilityName);
                if (foundAbility) {
                    const abilityData = foundAbility.toObject();
                    abilityData.system.abilityType = "kin";
                    createItemData.push(abilityData);
                } else {
                    DoD_Utility.WARNING("DoD.WARNING.kinAbility", {ability: kinAbilityName});
                }
            }
        }
        if (createItemData.length) {
            await this.createEmbeddedDocuments("Item", createItemData);
        }
    }

    async updateProfessionAbilities() {
        // Character's abilities
        const abilities = this.items.filter(item => item.type === "ability");

        // Ability names defined in the current profession
        const proAbilityNames =
            (this.system.profession && this.system.profession.system.abilities.length)
                ? DoD_Utility.splitAndTrimString(this.system.profession.system.abilities) : [];


        // Remove profession abilities not in current profession
        let removeAbilityIds = [];
        for (const ability of abilities) {
            if (ability.system.abilityType === "profession" && !proAbilityNames.find(name => name === ability.name)) {
                removeAbilityIds.push(ability.id);
            }
        }
        if (removeAbilityIds.length) {
            await this.deleteEmbeddedDocuments("Item", removeAbilityIds);
        }

        // add missing profession abilities from current profession
        let createItemData = [];
        for(const proAbilityName of proAbilityNames) {
            let professionAbility = this.findAbility(proAbilityName);
            if (!professionAbility) {
                const foundAbility = await DoD_Utility.findAbility(proAbilityName);
                if (foundAbility) {
                    const abilityData = foundAbility.toObject();
                    abilityData.system.abilityType = "profession";
                    createItemData.push(abilityData);
                } else {
                    DoD_Utility.WARNING("DoD.WARNING.professionAbility", {ability: proAbilityName});
                }
            }
        }
        if (createItemData.length) {
            await this.createEmbeddedDocuments("Item", createItemData);
        }
    }

    updateProfessionSkills() {
        this.system.professionSkills = [];
        let missingSkills = [];

        // update profession skills
        if (this.system.profession) {
            let professionSkillNames = DoD_Utility.splitAndTrimString(this.system.profession.system.skills);
            for (const skillName of professionSkillNames) {
                let skill = this.findSkill(skillName);
                if (skill) {
                    skill.system.isProfessionSkill = true;
                } else {
                    missingSkills.push(skillName);
                }
            }
        }
        return missingSkills;
    }

    async updateProfession()
    {
        await this.updateProfessionAbilities();
        return this.updateProfessionSkills();
    }

    async drawMonsterAttack(t, tableResult = null) {
        const table = t || (this.system.attackTable ? fromUuidSync(this.system.attackTable) : null);
        if (!table) return null;

        let draw = null;
        let results = null;
        let roll = null;

        if (tableResult) {
            // Create a roll with the desired result
            roll = DoDRoll.create(t.formula);

            // Check range
            const minOption = game.release.generation < 12 ? {minimize: true, async: true} : {minimize: true};
            const minRoll = (await roll.reroll(minOption)).total;
            const maxOption = game.release.generation < 12 ? {maximize: true, async: true} : {maximize: true};
            const maxRoll = (await roll.reroll(maxOption)).total;
            if ( (tableResult.range[0] > maxRoll) || (tableResult.range[1] < minRoll) ) {
                // Create a roll that guarantees the result
                roll = DoDRoll.create(tableResult.range[0].toString());
            }

            // Continue rolling until the desired result is rolled
            // This is preferred if the roll is shown
            roll = await roll.reroll(game.release.generation < 12 ? {async: true} : {});
            let iter = 0;
            while ( !(tableResult.range[0] <= roll.total && roll.total <= tableResult.range[1]) ) {
                if ( iter >= 100 ) {
                    // Stop rolling and create a roll that guarantees the result
                    roll = DoDRoll.create(tableResult.range[0].toString());
                    break;
                }
                roll = await roll.reroll(game.release.generation < 12 ? {async: true} : {});
                iter++;
            }

            // Recursive roll if the result is a table
            results = await DoD_Utility.expandTableResult(tableResult);

            // Draw from table
            draw = await table.draw({roll, displayChat: false, results});

        } else {
            draw = await table.draw({displayChat: false});
        }
        results = draw.results;
        roll = draw.roll;

        if (results[0]) {
            // Monsters never draw the same attack twice in a row - if that happens pick next attack in the table
            let newResult = null;
            let found = false;
            if (!tableResult && results[0].uuid === this.system.previousMonsterAttack) {
                // Find next attack
                for (let tableResult of table.results)
                {
                    // initialize newResult with first result, used when matching attack is the last one
                    if (!newResult) {
                        newResult = tableResult;
                    }
                    // matched attack last iteration, this is the next attack
                    if (found) {
                        newResult = tableResult;
                        break;
                    }
                    found = results[0].uuid === tableResult.uuid;
                }
                // Recursive roll if the result is a table
                draw = await table.draw({displayChat: false, results: await DoD_Utility.expandTableResult(newResult)});
                results = draw.results;
            }
            await this.update({["system.previousMonsterAttack"]: results[0].uuid});
        }
        return {results, roll};
    }

    _prepareKin() {
        this.system.kin = this.items.find(item => item.type === "kin");
    }

    _prepareProfession() {
        this.system.profession = this.items.find(item => item.type === "profession");
        this.updateProfessionSkills();
    }

    _prepareSpellValues() {
        let magicSchools = new Map;
        let maxValue = 0;

        // find skill values for schools of magic
        for (let item of this.items.contents) {
            if (item.type === "skill" && item.system.skillType === "magic") {
                let skill = item;
                magicSchools.set(skill.name, skill.system.value);
                if (skill.system.value > maxValue) {
                    maxValue = skill.system.value;
                }
            }
        }

        // set the skill value of general spells to max of all magic schools
        let generalSchool = "DoD.spell.general";
        magicSchools.set(generalSchool, maxValue);

        let generalSchoolLocalized = game.i18n.localize(generalSchool);

        for (let item of this.items.contents) {
            if (item.type === "spell") {
                let spell = item;

                // replace general spells school name with localized string if it matches
                if (spell.system.school === generalSchoolLocalized) {
                    spell.system.school = generalSchool;
                    spell.update({ ["system.school"]: generalSchool});
                }

                // set skill values for spell corresponding to school
                if (magicSchools.has(spell.system.school)) {
                    spell.system.skillValue = magicSchools.get(spell.system.school);
                } else {
                    spell.system.skillValue = 0;
                }
            }
        }
    }
}