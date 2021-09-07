//Dependencies
require('dotenv').config();
const fs = require('fs');
var logger = require('winston');
const Player = require('./Player');

function Game(log) {
    //Initialize main variables
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
	this.mainSocket = null;
	this.player = null;
	this.heroNames = null;

	//Flags
	this.gameStarted = false;
	this.vote = null;
	this.waitTimer = 0;
	this.sceneTransition = false;
	this.inCombat = false;
	//this.sceneSequence = ["startScene","startDialog","vote","resultDialog","combat","endScene"];
	this.seqID = 0;


	//Scene/Region Tranisions
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


/**
 * Main Game functions
 */
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
			//Chose result
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

				this.player.loadNewHero(this.currentScene.decision[topChoice].text, name);

				this.mainSocket.emit('new-hero', this.player.stats());
			}
			else if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "FORK" && this.currentScene.decision[topChoice].id=="A"){
				//Choose long road
				this.region.targetScenes += randomInt(2,4);
			}
			else if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "MERCHANT" && this.currentScene.decision[topChoice].id!="D"){
				//Purchase Item
				if(this.currentScene.decision[topChoice].id!="C") this.player.buyItem(result.goldChange,result.itemChange);
				else{
					this.player.changeGold(result.goldChange);
					this.player.changeHp(result.hpChange);
				}
			}
			else{
				if(result.expChange!=0) 	this.player.gainEXP(result.expChange);
				if(result.goldChange!=0) 	this.player.changeGold(result.goldChange);
				if(result.itemChange!=null) this.player.buyItem(0,result.itemChange);
				if(result.hpChange!=0) 		this.player.changeHp(result.hpChange);

				result.dialog = appendableVariables(result.dialog, this.player.stats().name);
			}

			//Send result to display
			this.mainSocket.emit('vote-result', {"option":this.currentScene.decision[topChoice].id, "result":result});
			this.mainSocket.emit('hero-update', this.player.stats());

			//Set dialog timer
	    	if(result.dialog!=null){
		    	var dialogSpeed = 1000 / parseInt(process.env.FPS) / process.env.DIALOG_SPEED;
		    	this.waitTimer = parseInt(result.dialog.length/dialogSpeed)+1;
	    	}
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

		//Transition to combat
		this.seqID = 4;
	}else if(this.waitTimer <= 0 && this.seqID == 4){
		logger.info("STARTING END SCENE");

		//Transition to End Scene
		this.seqID = 5;
		this.player.completeScene();
		this.player.changeHp(-2);
		this.mainSocket.emit('hero-update', this.player.stats());
	}else if(this.waitTimer <= 0 && this.seqID == 5){
		//Transition to new scene
		this.seqID = 6;
		logger.info("READY FOR NEW SCENE");
		this.selectNewScene();
	}
}

Game.prototype.processCombat = function(){

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


/**
 * Accessor functions
 */
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



/**
 * Mutator functions
 */
Game.prototype.updateSocket = function(socket){
	this.mainSocket = socket;
}

Game.prototype.newVote = function(voteID){
	var countVote = true;

	//Validate Vote
	if(this.currentScene.type == "SPECIAL" && this.currentScene.subtype == "MERCHANT"){
		countVote = (this.player.stats().gold + this.currentScene.decision[voteID].results[0].goldChange) > -1;
	}


	if(countVote){
		console.log("Valid vote for "+this.vote[voteID].id);
		this.vote[voteID].votes++;
	} 
}


/**
 * File saving and loading
 */
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
	var fileCount = 0, targetCount = 6;

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
        	ctx.sceneList = rebuildSceneArray(JSON.parse(data));
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
        	ctx.monsters = JSON.parse(data);
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
        	ctx.itemList = JSON.parse(data);
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



/**
 * Additional Functions
 */
function randomInt(min,max){
	return Math.floor(Math.random()*max)+min;
}

function rebuildSceneArray(data){
	var temp = [];
	for(var i = 0; i < data.length; i++){
		temp[""+data[i].id] = data[i];
	}

	return temp;
}

/*
 * Replaces keyword text for extra customization
 */
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

module.exports = Game;