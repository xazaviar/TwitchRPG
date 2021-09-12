//Dependencies
require('dotenv').config();
const fs = require('fs');
var logger = require('winston');
const Player = require('./Player');

function Game(log) {
    //Initialize main variables
    this.mainSocket = null;
	this.player = null;
	this.heroNames = null;
	this.combatDecisions = [
		{
			"id": "A",
			"text": "Fight",
			"keyword": "Fight"
		},
		{
			"id": "B",
			"text": "Guard",
			"keyword": "Guard"
		},
		{
			"id": "C",
			"text": "Use Special",
			"keyword": "Special"
		},
		{
			"id": "D",
			"text": "Use Item",
			"keyword": "Item"
		}
	];
	this.encounter = null;

	//Flags
	this.gameStarted = false;
	this.vote = null;
	this.waitTimer = 0;
	this.sceneTransition = false;
	this.inCombat = false;
	//this.sceneSequence = ["startScene","startDialog","vote","resultDialog","combat","endScene"];
	this.seqID = 0;


	//Scene/Region Tranisions
	this.currentScene = { //Game Start screen
		"id": -9999,
		"region": null,
		"subregion": null,
		"type": "SPECIAL",
		"subtype": null,
		"combat": false,
		"encounter_id": null,
		"dialog": null,
		"background": null,
		"prereq": null,
		"NPC": null,
		"decision": null
	};
	this.currentResult = null;
	this.sceneHistory = [];
	this.region = null;
	this.regionVote = "FIELD"; //TODO: select region via scene decision
	this.regionList = [];
	this.scenePool = [];
	this.endScene = null;
	this.normalScene = null;
	this.regionSceneCount = 0;
	this.inDungeon = false;
	this.specialSceneChance = parseFloat(process.env.SPECIAL_SCENE_CHANCE);


    logger = log;

    var context = this;


	loadAllGameFiles(context, function(){
        logger.info("All game data loaded. Game will begin playing.");
        context.launchGame();
    });
}

Game.create = function(logger) {
    
    return new Game(logger);
}


//******************************************************************
//Main Game Functions
//******************************************************************
Game.prototype.launchGame = function(){
	//Load title screen
	this.currentScene = this.sceneList["-9999"];
}

/**
 * This function is called after receiving the start command
 */
Game.prototype.startGame = function(){
	if(this.gameStarted) logger.info("The game has already been started.");
	else{
		this.gameStarted = true;
    	logger.info("Launching game from start game screen.");
    	this.currentScene = JSON.parse(JSON.stringify(this.sceneList["-1"]));

    	//Launch New scene
    	this.mainSocket.emit('scene-update', this.currentScene);
    	this.waitTimer = 0;

	}
}

/**
 * This function is called every 1 seconds
 */
Game.prototype.mainLoop = function(){
	// logger.info(this.currentScene.id, this.seqID, this.waitTimer);

	//Check timer
	if(this.waitTimer>0) this.waitTimer--;

	
	if(this.inCombat) this.processCombat();
	else this.processScene();
}

Game.prototype.processScene = function(){
	//Check timer endings
	if(this.waitTimer <= 0 && this.seqID == 0){
		logger.info("STARTING INTRO DIALOG");

		//Transition to start dialog
		this.seqID = 1;

    	//Set dialog timer
    	if(this.currentScene.dialog!=null){
	    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
	    	var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
	    	this.waitTimer = parseInt(this.currentScene.dialog.length/dialogSpeed+parseInt(this.currentScene.dialog.length/37)*waitFrames);
    	}
	}else if(this.waitTimer <= 0 && this.seqID == 1){
		logger.info("STARTING VOTE");

		//Transition to voting
		this.seqID = 2;

		if(this.currentScene.decision!=null){
			this.waitTimer = process.env.VOTING_TIME;
			this.vote = [];
			for(var v = 0; v < this.currentScene.decision.length; v++)
				this.vote.push({
					"id": this.currentScene.decision[v].id,
					"text":this.currentScene.decision[v].text,
					"keyword":this.currentScene.decision[v].keyword,
					"votes": 0
				});

			//Tell display to start vote countdown
			this.mainSocket.emit('vote-update', {"time":this.waitTimer});
		}
	}else if(this.waitTimer <= 0 && this.seqID == 2 && this.vote!=null){
		logger.info("STARTING RESULT DIALOG");

		//Transition to resultDialog
		this.seqID = 3;

		//Close voting
		var tempVote = this.vote;
		this.vote = null;
		//Tell display to stop vote countdown
		this.mainSocket.emit('vote-update', {"time":-1});

		//Count the vote
		var topChoice = 0;
		for(var v = 1; v < tempVote.length; v++){
			if(tempVote[v].votes > tempVote[topChoice].votes) topChoice = v;
			else if(tempVote[v].votes == tempVote[topChoice].votes && Math.random()>.5) topChoice = v;
		}

		//Verify a vote happened
		if(tempVote[topChoice].votes > 0){
			logger.info("The group voted for option "+tempVote[topChoice].id+": "+tempVote[topChoice].text);

			//Save Scene History
			this.sceneHistory.push({
				"sceneID": this.currentScene.id,
				"decisionID": tempVote[topChoice].id
			});

			//Do some kind of vote processing
			//Choose result
			var r = Math.random(), threshold = 0;
			var result;
			for(var d = 0; d < this.currentScene.decision[topChoice].results.length; d++){
				if(r < this.currentScene.decision[topChoice].results[d].weight+threshold){
					result = this.currentScene.decision[topChoice].results[d];
					break;
				}
				threshold+=this.currentScene.decision[topChoice].results[d].weight;
			}


			//Process the result
			if(this.currentScene.id == -1){
				//Character select Scene -> Init a hero
				var n = randomInt(0,this.heroNames.names.length),
				    t = randomInt(0,this.heroNames.titles.length);
				var name = this.heroNames.names[n]+this.heroNames.titles[t];

				this.player.loadNewHero(this.currentScene.decision[topChoice].text, name, this.itemList);

				this.mainSocket.emit('new-hero', this.player.stats());
			}
			else if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "FORK" && this.currentScene.decision[topChoice].id=="A"){
				//Choose long road
				this.region.targetScenes += randomInt(2,4);
			}
			else if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "MERCHANT" && this.currentScene.decision[topChoice].id!="D"){
				//Purchase Item
				if(this.currentScene.decision[topChoice].id!="C") this.player.buyItem(result.goldChange,result.itemChange,this.itemList[""+result.itemChange].type);
				else{
					this.player.changeGold(result.goldChange);
					this.player.changeHp(result.hpChange);
				}
			}
			else{
				if(result.expChange!=0) 	this.player.gainEXP(result.expChange);
				if(result.goldChange!=0) 	this.player.changeGold(result.goldChange);
				if(result.itemChange!=null) this.player.buyItem(0,result.itemChange,this.itemList[""+result.itemChange].type);
				if(result.hpChange!=0) 		this.player.changeHp(result.hpChange);

				result.dialog = appendableVariables(result.dialog, this.player.stats().name);
			}

			//Send result to display
			this.mainSocket.emit('vote-result', {"option":this.currentScene.decision[topChoice].id, "result":result});
			this.mainSocket.emit('hero-update', this.player.stats());

			//Set dialog timer
	    	if(result.dialog!=null){
		    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
	    		var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
		    	this.waitTimer = parseInt(result.dialog.length/dialogSpeed+parseInt(result.dialog.length/37)*waitFrames);
	    	}

	    	this.currentResult = JSON.parse(JSON.stringify(result));

		}else{
			//Invalid vote, relaunch vote
			this.seqID = 1;
		}
	}else if(this.waitTimer >  0 && this.seqID == 2 && this.vote!=null){
		//As a backup emit time left for vote
		this.mainSocket.emit('vote-update', {"time":this.waitTimer});
	}else if(this.waitTimer <= 0 && this.seqID == 2 && this.vote==null){
		//No voting on this scene
		this.seqID = 3

		//Save Scene History
		if(this.currentScene.id!=-9999)
			this.sceneHistory.push({
				"sceneID": this.currentScene.id,
				"decisionID": null
			});
	}else if(this.waitTimer <= 0 && this.seqID == 3){
		logger.info("STARTING COMBAT");

		if(this.currentScene.combat || (this.currentResult!=null && this.currentResult.combat)){
			this.inCombat = true;
			this.seqID = 0; 
			this.mainSocket.emit('combat-status', this.inCombat);
			this.waitTimer = 1;
		}else this.seqID = 4;
		
	}else if(this.waitTimer <= 0 && this.seqID == 4){
		logger.info("STARTING END SCENE");

		//Transition to End Scene
		this.seqID = 5;
		this.player.completeScene();
		this.mainSocket.emit('hero-update', this.player.stats());
	}else if(this.waitTimer <= 0 && this.seqID == 5){
		//Transition to new scene
		this.seqID = 6;
		logger.info("READY FOR NEW SCENE");
		this.selectNewScene();
		this.currentResult = null;
	}
}

Game.prototype.processCombat = function(){
	if(this.waitTimer <= 0 && this.seqID == 0){
		logger.info("COMBAT: BUILDING ENCOUNTER");
		if(this.currentResult!=null)
			this.encounter = buildEncounter(this.encounterList, this.currentResult.encounter_id, this.currentScene.region, this.currentScene.subregion, this.monsterList);
		else
			this.encounter = buildEncounter(this.encounterList, this.currentScene.encounter_id, this.currentScene.region, this.currentScene.subregion, this.monsterList);

		//Send updated info to frontend
		var dialog = "What will you do?";
		this.mainSocket.emit('start-combat-data', {"encounter":this.encounter,"decisions":this.combatDecisions,"dialog":dialog});

		//Set dialog timer
    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
		var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
    	this.waitTimer = parseInt(dialog.length/dialogSpeed+parseInt(dialog.length/37)*waitFrames);

		//Maybe have a wait time to display monsters and starting encounter animation

		this.seqID = 1;
	}else if(this.waitTimer <= 0 && this.seqID == 1){
		logger.info("COMBAT: STARTING VOTE");

		//Transition to voting
		this.seqID = 2;

		this.waitTimer = process.env.VOTING_TIME;
		this.vote = [];
		for(var v = 0; v < this.combatDecisions.length; v++)
			this.vote.push({
				"id": this.combatDecisions[v].id,
				"text":this.combatDecisions[v].text,
				"keyword":this.combatDecisions[v].keyword,
				"votes": 0
			});

		//Tell display to start vote countdown
		this.mainSocket.emit('vote-update', {"time":this.waitTimer});
	}else if(this.waitTimer <= 0 && this.seqID == 2){
		logger.info("COMBAT: PROCESSING VOTE");

		this.seqID = 3;

		//Close voting
		var tempVote = this.vote;
		this.vote = null;
		//Tell display to stop vote countdown
		this.mainSocket.emit('vote-update', {"time":-1});

		//Count the vote
		var topChoice = 0;
		for(var v = 1; v < tempVote.length; v++){
			if(tempVote[v].votes > tempVote[topChoice].votes) topChoice = v;
			else if(tempVote[v].votes == tempVote[topChoice].votes && Math.random()>.5) topChoice = v;
		}

		//Verify a vote happened
		if(tempVote[topChoice].votes > 0){
			logger.info("The group voted for option "+tempVote[topChoice].id+": "+tempVote[topChoice].text);

			var roundOrder = [];

			//Player Choice
			var pStats = this.player.stats();
			if(tempVote[topChoice].text == "Fight"){
				roundOrder.push({
					"speed": pStats.speed,
					"action": "Fight",
					"id": "player"
				});
			}else if(tempVote[topChoice].text == "Guard"){
				roundOrder.push({
					"speed": pStats.speed+parseInt(process.env.GUARD_SPEED_MODIFIER),
					"action": "Guard",
					"id": "player"
				});
			}else if(tempVote[topChoice].text == "Use Special"){
				//TODO: Build specials
				roundOrder.push({
					"speed": pStats.speed,
					"action": "Special",
					"id": "player"
				});
			}else if(tempVote[topChoice].text == "Use Item"){
				roundOrder.push({
					"speed": pStats.speed+this.itemList[""+pStats.activeItem].speed,
					"action": "Item",
					"item_id": pStats.activeItem,
					"id": "player"
				});
			}


			//Monster Actions
			for(var m = 0; m < this.encounter.monsters.length; m++){
				var mon = this.encounter.monsters[m];
				if(mon.hp > 0){
					var r = Math.random();

					if(r < 0.1){
						roundOrder.push({
							"speed": mon.speed+parseInt(process.env.GUARD_SPEED_MODIFIER),
							"action": "Guard",
							"id": mon.id
						});
					}else if(r < 0.6 && mon.special > 0 && mon.specials.length > 0){
						//USE SPECIAL
						roundOrder.push({
							"speed": mon.speed,
							"action": "Special",
							"id": mon.id
						});
					}else{
						roundOrder.push({
							"speed": mon.speed,
							"action": "Fight",
							"id": mon.id
						});

					}
				}
			}

			//Sort Round Order, greatest to least, player breaks ties
			roundOrder.sort(function(a,b){
				if(a.speed > b.speed) return -1;
				else if(a.speed < b.speed) return 1;
				else if(a.speed == b.speed && a.id == "player") return -1;
				else if(a.speed == b.speed && b.id == "player") return 1;
				else return 0;
			});

			console.log(roundOrder);

			var results = processCombatLogic(roundOrder,this.encounter.monsters,this.player,this.itemList);

			console.log(results);

			//Send result to display
			this.mainSocket.emit('combat-result', {"option":tempVote[topChoice].id, "results":results});

			var calcText = "";
			var pauses = 0;
			for(var d = 0; d < results.length; d++){
				if(results[d].type == "dialog"){
					calcText += results[d].dialog;
					pauses++;
				}
			}

			//Set dialog timer
	    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
    		var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
	    	this.waitTimer = parseInt(calcText.length/dialogSpeed+pauses*waitFrames)+1;

		}else{
			//Invalid vote, relaunch vote
			this.seqID = 1;
		}
	}else if(this.waitTimer >  0 && this.seqID == 2 && this.vote!=null){
		//As a backup emit time left for vote
		this.mainSocket.emit('vote-update', {"time":this.waitTimer});
	}else if(this.waitTimer <= 0 && this.seqID == 3){
		logger.info("COMBAT: CHECK FOR END COMBAT");

		var endCombat = true, exp = 0; gold = 0;
		for(var m = 0; m < this.encounter.monsters.length; m++){
			if(this.encounter.monsters[m].hp > 0){
				endCombat = false;
				break;
			}else{
				exp+=this.encounter.monsters[m].exp;
				gold+=this.encounter.monsters[m].gold;
			}
		}

		if(this.player.stats().hp <= 0){
			logger.info("COMBAT: EMERGENCY EXIT COMBAT");
			this.inCombat = false;
			this.seqID = 4; 
			this.mainSocket.emit('combat-status', this.inCombat);
		}else if(endCombat){
			//Combat has ended in victory, distribute rewards and update player
			this.seqID = 4;

			//Rewards
			var dialog = "You are victorious! You gain "+exp+" exp and "+gold+" gold.";

			player.gainEXP(exp);
			player.changeGold(gold);

			this.mainSocket.emit('end-combat-results', {"dialog":dialog});

			//Set dialog timer
	    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
    		var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
	    	this.waitTimer = parseInt(dialog.length/dialogSpeed+parseInt(dialog.length/37)*waitFrames);

		}else{
			this.seqID = 1; //Restart Combat Round

			//Send updated info to frontend
			var dialog = "What will you do?";
			this.mainSocket.emit('start-combat-data', {"encounter":this.encounter,"decisions":this.combatDecisions,"dialog":dialog});

			//Set dialog timer
	    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / parseInt(process.env.DIALOG_SPEED);
    		var waitFrames	= 1000 / parseInt(process.env.FPS) / parseInt(process.env.WAIT_FRAMES);
	    	this.waitTimer = parseInt(dialog.length/dialogSpeed+parseInt(dialog.length/37)*waitFrames);
		}

		this.mainSocket.emit('hero-update', this.player.stats());
	}else if(this.waitTimer <= 0 && this.seqID == 4){
		logger.info("COMBAT: EXIT COMBAT");
		this.inCombat = false;
		this.mainSocket.emit('combat-status', this.inCombat);
	}

	
}

Game.prototype.selectNewScene = function(){

	//Check if the scene that should be sent is the death scene
	if(this.currentScene.id == "-9998"){
    	this.currentScene = JSON.parse(JSON.stringify(this.sceneList["-1"]));
		this.mainSocket.emit('scene-update', this.getScene());
		this.waitTimer = 0;
		this.seqID = 0;
		return "END";
	}else if(this.player.isDead()){
		this.currentScene = JSON.parse(JSON.stringify(this.sceneList["-9998"]));

		//Correct dialog
		this.currentScene.dialog = appendableVariables(this.currentScene.dialog, this.player.stats().name);

		this.mainSocket.emit('scene-update', this.getScene());
		this.waitTimer = 0;
		this.seqID = 0;
		return "END";
	}

	//Two cases to change Regions
	//1. Leaving character/region select screen
	//2. Entering a sub region
	if(this.currentScene.id == -1 || this.currentScene.type == "END"){
		var regionSubType = null;
		this.scenePool = []; //Clear scene pool
		this.regionSceneCount = 0;

		if(this.currentScene.type == "END" && this.currentScene.subregion==null){
			//Enter the dungeon
			this.inDungeon = true;
			regionSubType = "DUNGEON";
			this.specialSceneChance = parseFloat(process.env.SPECIAL_SCENE_CHANCE);
			this.region["targetScenes"] = randomInt(this.region.dungeonSize,this.region.dungeonSize+this.region.dungonVariance);
		}
		else{
			for(var r in this.regionList){
				if(this.regionVote == this.regionList[r].name){
					this.region = this.regionList[r];
					this.region["targetScenes"] = randomInt(this.regionList[r].size,this.regionList[r].size+this.regionList[r].variance);
					break;
				}
			}
		}

		//Populate scene pool
		for(var s in this.sceneList){
			if(this.sceneList[s].region == this.region.name && this.sceneList[s].subregion == regionSubType){
				if(this.sceneList[s].type == "SPECIAL" && this.sceneList[s].startingPool) this.scenePool.push(this.sceneList[s].id);
				else if(this.sceneList[s].type =="END") this.endScene = this.sceneList[s];
				else if(this.sceneList[s].type =="NORMAL") this.normalScene = this.sceneList[s];
			}
		}
	}

	//Check to see if we need to give the last scene
	var r = Math.random();

	// console.log(this.regionSceneCount, this.specialSceneChance, r);

	if(this.regionSceneCount == this.region.targetScenes-1){
		//Load end scene
		this.currentScene = JSON.parse(JSON.stringify(this.endScene));
		logger.info(">>SELECTED END SCENE");
	}
	else if(r < this.specialSceneChance){
		this.specialSceneChance = 0;

		var rSceneID = this.scenePool.splice(randomInt(0,this.scenePool.length),1);
		this.currentScene = JSON.parse(JSON.stringify(this.sceneList[""+rSceneID]));
		logger.info(">>SELECTED SPECIAL SCENE: "+rSceneID);

		//Load Merchant Scene
		if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "MERCHANT"){
			//Grab valid item pool
			var itemPool = buildItemPool(this.itemList, "SHOP", this.player.stats().items);

			//Choose 2 random items, and verify they don't match up to 10 times.
			if(itemPool.length>1){
				var matching = true;
				var r1 = randomInt(0,itemPool.length-1), r2 = randomInt(0,itemPool.length-1);
				for(var i = 0; i < 10; i++){
					if(r1!=r2){
						matching = false;
						break;
					} 
					r1 = randomInt(0,itemPool.length-1); 
					r2 = randomInt(0,itemPool.length-1);
				}

				if(matching){
					r1 = 0;
					r2 = 1;
				}

				r1 = itemPool[r1];
				r2 = itemPool[r2];

				this.currentScene.decision[0].text = "Buy "+this.itemList[r1].name;
				this.currentScene.decision[0].keyword = ""+this.itemList[r1].keyword;
				this.currentScene.decision[0].results[0].dialog = this.currentScene.decision[0].results[0].dialog.replace("__ITEM__",this.itemList[r1].name);
				this.currentScene.decision[0].results[0].goldChange = -this.itemList[r1].price;
				this.currentScene.decision[0].results[0].itemChange = 0+this.itemList[r1].id;

				this.currentScene.decision[1].text = "Buy "+this.itemList[r2].name;
				this.currentScene.decision[1].keyword = ""+this.itemList[r2].keyword;
				this.currentScene.decision[1].results[0].dialog = this.currentScene.decision[1].results[0].dialog.replace("__ITEM__",this.itemList[r2].name);
				this.currentScene.decision[1].results[0].goldChange = -this.itemList[r2].price;
				this.currentScene.decision[1].results[0].itemChange = 0+this.itemList[r2].id;
			}
			else if(itemPool.length==1){
				//Only 1 item available, shouldn't happen?

				this.currentScene.decision[0].text = "Buy "+this.itemList[itemPool[0]].name;
				this.currentScene.decision[0].keyword = ""+this.itemList[itemPool[0]].keyword;
				this.currentScene.decision[0].results[0].dialog = this.currentScene.decision[0].results[0].dialog.replace("__ITEM__",this.itemList[itemPool[0]].name);
				this.currentScene.decision[0].results[0].goldChange = -this.itemList[itemPool[0]].price;
				this.currentScene.decision[0].results[0].itemChange = 0+this.itemList[itemPool[0]].id;

				this.currentScene.decision.splice(1,1); //Remove second dialog option
			}
			else{
				//NO ITEMS IN POOL?
				this.currentScene.decision.splice(0,2); //Remove both dialog options
			}

			//Random chance for discount
			var discount = Math.random();
			if(discount < parseFloat(process.env.MERCHANT_DISCOUNT_CHANCE)){
				discount = randomInt(0,this.currentScene.decision.length-1);
				this.currentScene.decision[discount].results[0].goldChange = parseInt(this.currentScene.decision[discount].results[0].goldChange/2);
			}
		}
	}else{
		this.specialSceneChance += parseFloat(process.env.SPECIAL_SCENE_CHANCE);
		this.currentScene = JSON.parse(JSON.stringify(this.normalScene));

		//Select 1 random dialog
		this.currentScene.dialog = ""+this.normalScene.dialog[randomInt(0,this.normalScene.dialog.length)];

		logger.info(">>SELECTED NORMAL SCENE");
	}

	//Grab all new linked scenes
	if(this.currentScene.linked!=null)
		for(var l = 0; this.currentScene.linked.length; l++)
			this.scenePool.push(this.currentScene.linked[l]);

	//Correct dialog
	this.currentScene.dialog = appendableVariables(this.currentScene.dialog, this.player.stats().name);

	this.regionSceneCount++;
	this.mainSocket.emit('scene-update', this.getScene());
	this.seqID = 0;
}


//******************************************************************
//Accessors
//******************************************************************
Game.prototype.getScene = function(){
	return this.currentScene;
}

Game.prototype.getHero = function(){
	return this.player.stats();
}

Game.prototype.voteOpen = function(){
	return this.vote != null;
}

Game.prototype.getChoices = function(){
	return this.vote;
}

Game.prototype.hasStarted = function(){
	return this.gameStarted;
}

Game.prototype.getCombatDecision = function(){
	return this.combatDecisions;
}

Game.prototype.isInCombat = function(){
	return this.inCombat;
}

Game.prototype.combatData = function(){
	return {"encounter":this.encounter,"decisions":this.combatDecisions,"dialog":"What will you do?"};
}



//******************************************************************
//Mutators
//******************************************************************
Game.prototype.updateSocket = function(socket){
	this.mainSocket = socket;
}

Game.prototype.newVote = function(voteID){
	var countVote = true;

	//Validate Vote
	if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "MERCHANT"){
		countVote = (this.player.stats().gold + this.currentScene.decision[voteID].results[0].goldChange) > -1;
	}
	if(this.inCombat && this.vote[voteID].text == "Use Special"){
		countVote = this.player.stats().special > 0;
	}


	if(countVote){
		console.log("Valid vote for "+this.vote[voteID].id);
		this.vote[voteID].votes++;
	} 
}


//******************************************************************
//File Saving and Loading
//******************************************************************
Game.prototype.saveGameData = function(callback, gameClose){
    var data = {};
    var context = this;
    fs.writeFile("./game_data/game_saves/"+this.id+".json", JSON.stringify(data, null, 4), function(err){
        if(err) logger.error(err);
        else{
            logger.info(context.name+"'s game data saved");
            if(callback) callback();
        } 
    });
}

function loadAllGameFiles(ctx, callback){
	var fileCount = 0, targetCount = 7;

	fs.readFile("./game_data/statics/regions.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD REGION DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.regionList = JSON.parse(data);
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/scenes.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD SCENE DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.sceneList = rebuildArray(JSON.parse(data));
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/monsters.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD MONSTER DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.monsterList = rebuildArray(JSON.parse(data));
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/encounters.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD ENCOUNTER DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.encounterList = rebuildArray(JSON.parse(data));
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/items.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD ITEMS DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.itemList = rebuildArray(JSON.parse(data));
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/heroes.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD HERO DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.player = Player.create(JSON.parse(data));
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
    fs.readFile("./game_data/statics/hero_names.json", function(err, data){
        if(err){
            logger.error("FAILED TO LOAD HERO NAME DATA");
            logger.error(err);
            process.exit(1);
        } 
        else{
        	ctx.heroNames = JSON.parse(data);
        	fileCount++;

        	if(fileCount == targetCount) callback();
        } 
    });
}


//******************************************************************
//Helper functions
//******************************************************************
function randomInt(min,max){
	return Math.floor(Math.random()*max)+min;
}

function rebuildArray(data){
	var temp = [];
	for(var i = 0; i < data.length; i++){
		temp[""+data[i].id] = data[i];
	}

	return temp;
}

function appendableVariables(text, pName){
	var finalText = ""+text;

	//BossName
	finalText = finalText.replace("__BOSSNAME__", "BILLY BOB JOHNSON");
	finalText = finalText.replace("__PLAYERNAME__", pName);

	return finalText;
}

function buildItemPool(itemList, pool, pItems){
	var retPool = [];

	for(var i = 0; i < itemList.length; i++){
		//Verify if item is unlocked
		if(itemList[i].starting &&
		//Verify if item is in correct pool
		(itemList[i].pool == pool || itemList[i].pool == "ALL") &&
		//Verify item is not already owned
		(!pItems[i])){
			retPool.push(itemList[i].id);
		}
	}

	return retPool;
}

function buildEncounter(encounterList, encounter_id, region, subregion, monsterList){
	//TODO: Make way more efficent, maybe set to only call one time?

	var encounter = null;

	//Select Encounter
	if(encounter_id!=null) encounter = JSON.parse(JSON.stringify(encounterList[""+encounter_id]));
	else{
		var tempList = [];
		for(var e = 0; e < encounterList.length; e++){
			if(encounterList[e].region == region && encounterList[e].subregion == subregion && encounterList[e].type == "NORMAL") 
				tempList.push(encounterList[e]);
		}

		var r = randomInt(0,tempList.length-1);
		encounter = JSON.parse(JSON.stringify(tempList[r]));
	}

	//Populate Monsters
	var rID = ["A","B","C","D","E"]; //Maybe?
	for(var m = 0; m < encounter.monsters.length; m++){
		encounter.monsters[m] = JSON.parse(JSON.stringify(monsterList[""+encounter.monsters[m]]));
		encounter.monsters[m].id = m;
	}

	return encounter;
}

function processCombatLogic(roundOrder, monsters, player, itemList){
	var results = [];

	//Loop through each action
	for(var o = 0; o < roundOrder.length; o++){
		console.log("PROCSSING ACTION:",roundOrder[o]);


		//*********************************************************************
		//FIGHTING
		//*********************************************************************
		if(roundOrder[o].action == "Fight"){
			if(roundOrder[o].id == "player"){
				//Choose target
				var target = 0;
				for(var m = 0; m < monsters.length; m++){
					if(monsters[m].hp > 0){
						if(monsters[m].hp < monsters[target].hp || monsters[target].hp <= 0) target = m;
						else if(monsters[m].hp == monsters[target].hp && monsters[m].threat > monsters[target].threat) target = m;
					}
				}

				if(Math.random() < parseFloat(process.env.UNIVERSAL_DODGE_CHANCE)){
					var text = player.stats().name+" attacks "+monsters[target].name+", but they dodge the attack!";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":target,"change":"hp","amt":0});
				}else if(Math.random() < parseFloat(process.env.UNIVERSAL_CRIT_CHANCE)){
					var dmg = Math.max((parseInt(player.stats().attack*parseFloat(process.env.CRIT_DAMAGE_MOD))-Math.floor(monsters[target].shield)),0);
					var text = player.stats().name+" attacks "+monsters[target].name+" and lands a crital hit dealing "+dmg+"damage!"

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":target,"change":"hp","amt":-dmg});

					monsters[target].hp -= dmg;
				}else{
					var dmg = Math.max((parseInt(player.stats().attack)-Math.floor(monsters[target].shield)),0);
					var text = player.stats().name+" attacks "+monsters[target].name+" dealing "+dmg+" damage!";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":target,"change":"hp","amt":-dmg});

					monsters[target].hp -= dmg;
				}

				if(monsters[target].hp <= 0){
					var text = monsters[target].name+" dies...";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":target,"change":"death"});
				}

			}else if(monsters[roundOrder[o].id].hp>0){
				if(Math.random() < parseFloat(process.env.UNIVERSAL_DODGE_CHANCE)){
					var text = monsters[roundOrder[o].id].name+" attacks "+player.stats().name+", but you dodge the attack!";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":"player","change":"hp","amt":0});
				}else{
					var dmg = Math.max((parseInt(monsters[roundOrder[o].id].attack)-Math.floor(player.stats().shield)),0);
					var text = monsters[roundOrder[o].id].name+" attacks "+player.stats().name+" dealing "+dmg+" damage!";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":"player","change":"hp","amt":-dmg});

					player.changeHp(-dmg);
				}

				if(player.stats().hp <= 0){
					var text = player.stats().name+" dies...";

					results.push({"type":"dialog","dialog":text});
					results.push({"type":"result","id":"player","change":"death"});
					break; //No need to process any other actions
				}
			}
		}

		//*********************************************************************
		//GUARDING
		//*********************************************************************
		else if(roundOrder[o].action == "Guard"){
			if(roundOrder[o].id == "player"){
				var text = player.stats().name+" guards.";

				results.push({"type":"dialog","dialog":text});
				results.push({"type":"result","id":"player","change":"shield","amt":1});

				player.gainShield(1);
			}else if(monsters[roundOrder[o].id].hp>0){
				var text = monsters[roundOrder[o].id].name+" guards.";

				results.push({"type":"dialog","dialog":text});
				results.push({"type":"result","id":roundOrder[o].id,"change":"shield","amt":1});

				monsters[roundOrder[o].id].shield+=1;
			}
		}

		//*********************************************************************
		//USE SPECIAL
		//*********************************************************************
		else if(roundOrder[o].action == "Special"){
			//TODO
			if(roundOrder[o].id == "player"){
				var text = player.stats().name+" used [SPECIAL].";

				results.push({"type":"dialog","dialog":text});
				results.push({"type":"result","id":"player","change":"special","amt":-player.stats().special});
			}else if(monsters[roundOrder[o].id].hp>0){
				var text = monsters[roundOrder[o].id].name+" used [SPECIAL].";

				results.push({"type":"dialog","dialog":text});
				results.push({"type":"result","id":roundOrder[o].id,"change":"special","amt":-monsters[roundOrder[o].id].special});
			}
		}

		//*********************************************************************
		//USE ITEM
		//*********************************************************************
		else if(roundOrder[o].action == "Item"){
			//Player only action
			var text = player.stats().name+" used "+itemList[""+player.stats().activeItem].name+".";

			results.push({"type":"dialog","dialog":text});
			results.push({"type":"result","id":"player","change":"item"});
		}
	}

	//Remove temporary buffs
	//Increase special of those alive
	for(var o = 0; o < roundOrder.length; o++){
		if(roundOrder[o].id != "player"){
			if(roundOrder[o].action == "Guard"){
				monsters[roundOrder[o].id].shield--;
				results.push({"type":"result","id":roundOrder[o].id,"change":"shield","amt":-1});
			}
			if(roundOrder[o].action != "Special")
				results.push({"type":"result","id":roundOrder[o].id,"change":"special","amt":1});
		}else{
			player.endRoundofCombat(roundOrder[o].action);
		}
	}
	

	return results;
}

module.exports = Game;