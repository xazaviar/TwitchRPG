//STATICS
const MAX_HP = 10,
	  MAX_ATK = 8,
	  MAX_ST_SPEC = 5,
	  MAX_SPECIAL = 5,
	  MAX_SHIELD = 3,
	  MAX_LVL = 5,
	  EXP_THRESHOLDS = [10,25,45,70,100];

//Dependencies
require('dotenv').config();


function Player(heroes){
	//load defaults
	this.defaultHeroes = heroes;

	//Load base player stats
	this.name 		= "N/A";
	this.hero 		= "N/A";
	this.hp 		= 0;
	this.maxhp 		= 0;
	this.atk 		= 0;
	this.shield 	= 0;
	this.special 	= 0;
	this.st_spec 	= 0;
	this.exp 		= 0;
	this.lvl 		= 0;
	this.scaling	= {
		"hp": 0,
		"atk": 0,
		"shield": 0,
		"st_spec": 0
	}
	this.items 		= [];
	this.specials 	= [];
	this.gold 		= 0;	
	this.scenes 	= 0;	

	//Set all items to false
	for(var i = 0; i < process.env.itemCount; i++)
		this.items.push(false);


	//Flags
	this.leveledUp = false;
}


Player.create = function(heroes) {
    
    return new Player(heroes);
}

Player.prototype.loadNewHero = function(hero, name){
	var selectedHero = 0;
	switch(hero){
		case "Swordsman":
			selectedHero = 0;
			break;
		case "Wizard":
			selectedHero = 1;
			break;
		case "Rogue":
			selectedHero = 2;
			break;
	}
	
	this.name 		= name;
	this.lvl 		= 0;
	this.exp 		= 0;
	this.gold 		= 0;
	this.scenes 	= 0;
	this.hero 		= this.defaultHeroes[selectedHero].hero+"";
	this.hp 		= this.defaultHeroes[selectedHero].hp+0;
	this.maxhp 		= this.defaultHeroes[selectedHero].hp+0;
	this.atk 		= this.defaultHeroes[selectedHero].atk+0;
	this.shield 	= this.defaultHeroes[selectedHero].shield+0;
	this.special 	= this.defaultHeroes[selectedHero].st_spec+0;
	this.st_spec 	= this.defaultHeroes[selectedHero].st_spec+0;
	this.specials	= JSON.parse(JSON.stringify(this.defaultHeroes[selectedHero].specials));
	this.scaling	= JSON.parse(JSON.stringify(this.defaultHeroes[selectedHero].scaling));

	//Set all items to false
	this.items = [];
	for(var i = 0; i < process.env.ITEM_COUNT; i++)
		this.items.push(false);

	//Load items
	for(var i = 0; i < this.defaultHeroes[selectedHero].items.length; i++)
		this.items[this.defaultHeroes[selectedHero].items[i]] = true;

}


Player.prototype.levelUp = function(){
	if(this.lvl == MAX_LVL) return;

	//Increase stats
	this.lvl++;
	this.maxhp += this.scaling.hp;
	this.atk += this.scaling.atk;
	this.shield += this.scaling.shield;
	this.st_spec += this.scaling.st_spec;

	//Refresh HP
	if(this.maxhp > MAX_HP) this.maxhp = MAX_HP;
	this.hp = this.maxhp;

	//Send flag to display a level up
	this.leveledUp = true;
}


//******************************************************************
//Accessors
//******************************************************************
Player.prototype.stats = function(){
	return {
		"name": 	this.name,
		"hero": 	this.hero,
		"scenes": 	this.scenes,
		"hp": 		this.hp,
		"maxhp": 	this.maxhp,
		"special": 	this.special,
		"st_spec": 	this.st_spec,
		"shield": 	this.shield,
		"atk": 		this.atk,
		"lvl": 		this.lvl,
		"exp": 		this.exp,
		"gold": 	this.gold,
		"items": 	this.items
	}
}

Player.prototype.isDead = function(){
	return this.hp <= 0;
}


//******************************************************************
//Mutators
//******************************************************************
Player.prototype.gainEXP = function(exp){
	this.exp += exp;
	if(this.exp >= EXP_THRESHOLDS[this.lvl]) this.levelUp();
}

Player.prototype.changeHp = function(health){
	this.hp += health;

	if(this.hp > this.maxhp) this.hp = this.maxhp;
}

Player.prototype.changeGold = function(gold){
	this.gold += gold;

	if(this.gold < 0) this.gold = 0;
}

Player.prototype.buyItem = function(cost, itemID){
	this.gold += cost;
	this.items[itemID] = true;
}

Player.prototype.gotLevelup = function(){
	this.leveledUp = false;
}

Player.prototype.completeScene = function(){
	this.scenes++;
}

module.exports = Player;