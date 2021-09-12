/**
 * Creates a Drawing object.
 * @param {CanvasRenderingContext2D} context The context this object will
 *   draw to.
 * @constructor 
 */
function Drawing() {
    //Statics
    this.dialogRate = 2;
    this.waitFrames = 20;
    this.arrowBlinkRate = 10;


    //Main Data
    this.frameID = 0;
    this.currentScene = null;
    this.newScene = null;
    this.hero = null;
    this.combatResults = null;
    this.crIndex = 0;

    //Flags
    this.canChangeScene = true;
    this.canDrawDialogBox = true;
    this.completedDialog = false;
    this.completedResultsDialog = false;
    this.completedChoice = null;
    this.startWaitFrame = 0;
    this.voteTimer = 0;
    this.arrowOn = false;
    this.inCombat = false;

    //Chat
    this.chatlog = [];
    this.maxChatLines = 37;

    //Canvases
    this.heroCanvas = null;
    this.itemCanvas = null;

    this.loadImages();
}

//***********************************************************************
//Drawing General Functions
//**********************************************************************
/**
 * This is a factory method for creating a Drawing object.
 * @param {CanvasRenderingContext2D} context The context this object will
 *   draw to.
 * @return {Drawing}
 */
Drawing.create = function() {
    
    return new Drawing();
}

Drawing.prototype.chat = function(ctx){
    var w = $("canvas#chat").width(), 
        h = $("canvas#chat").height();

    ctx.beginPath();
    ctx.fillStyle = "#6534D2";
    ctx.fillRect(0,0,w,h);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.font = "18px Courier New";

    for(var i = 0; i < this.chatlog.length; i++){
        ctx.fillText(this.chatlog[i], 5, h - 16*(i+1)+8);
    }
    ctx.fill();
}

Drawing.prototype.animateGame = function(ctx){
    var w = $("canvas#game").width(), 
        h = $("canvas#game").height();
    this.frameID++;
    //console.log(this.frameID);

    //Determine if I need to wrap up previous scene
    if(this.newScene != null && this.canChangeScene){
        this.canChangeScene = false;
        this.currentScene = this.newScene;
        this.newScene = null;
        if(!this.inCombat)
            this.dialog = {
                "mark": 0,
                "section": 0,
                "text": textSpliter(this.currentScene.dialog, -1, 37, false)
            }
        this.completedDialog = false;
        this.completedResultsDialog = false;
        this.completedChoice = null;
    } 

    //Draw the background
    drawBackground(ctx, w, h, this.imageLibrary, this.currentScene, this.inCombat);

    //Draw Dialog Box
    if(this.canDrawDialogBox && this.dialog.text!=null){

        drawDialogBox(ctx, w, h, this.imageLibrary);

        if(this.frameID%this.dialogRate == 0) this.dialog.mark++;
        if(this.dialog.section < this.dialog.text.length-1 && this.dialog.mark>=this.dialog.text[this.dialog.section].length){
            

            if(((this.dialog.section+1)%3==0 && this.dialog.section!=0) && this.dialog.mark==this.dialog.text[this.dialog.section].length){
                this.startWaitFrame = 0+this.frameID;
            }

            if(((this.dialog.section+1)%3==0 && this.dialog.section!=0) && this.frameID > this.startWaitFrame+this.waitFrames*2){
                this.dialog.section++;
                this.dialog.mark = 0;
            }else if((this.dialog.section+1)%3!=0 || this.dialog.section==0){
                this.dialog.section++;
                this.dialog.mark = 0;
            } 

            //Blinky arrow
            if(((this.dialog.section+1)%3==0 && this.dialog.section!=0) && this.frameID%this.arrowBlinkRate == 0 && this.dialog.mark>this.dialog.text[this.dialog.section].length){
                this.arrowOn = !this.arrowOn;
            }
            if(this.arrowOn) drawDialogArrow(ctx,w,h);
        } 

        //Final dialog section
        if(this.dialog.section == this.dialog.text.length-1 && this.dialog.mark==this.dialog.text[this.dialog.section].length){
            if(this.completedDialog) this.completedResultsDialog = true;
            else this.startWaitFrame = 0+this.frameID;
            this.completedDialog = true;
        } 

        drawDialog(ctx, w, h, this.dialog);

    }else if(this.currentScene.dialog==null) this.completedDialog = true;

    //Check for special combat drawing
    if(this.inCombat){
        drawEncounter(ctx, w, h, this.encounter, this.imageLibrary, this.frameID);

        if(this.combatResults!=null && this.completedDialog && this.frameID > this.startWaitFrame+this.waitFrames){
            this.processCombatResults();
        }
    }

    //Draw Decision Options
    if(this.completedDialog && this.frameID > this.startWaitFrame+this.waitFrames && (this.currentScene.decision!=null || this.inCombat)){
        if(this.inCombat)
            drawOptions(ctx, w, h, this.combatDecisions, this.completedChoice, false, this.hero);
        else
            drawOptions(ctx, w, h, this.currentScene.decision, this.completedChoice, this.currentScene.subtype=="MERCHANT", this.hero);

        //Draw Timer
        if(this.completedChoice==null)
            drawVoteTimer(ctx, w, h, this.voteTimer);

    }else if(this.currentScene.decision==null && !this.inCombat){
        this.completedChoice = "FF";
        this.completedResultsDialog = true;
    } 

    //Check for scene completion
    if(this.completedDialog && this.completedChoice!=null && this.completedResultsDialog) this.canChangeScene = true;
    //console.log(this.completedDialog && this.completedChoice && this.completedResultsDialog)
}

Drawing.prototype.sceneDrawing = function(ctx){

}

Drawing.prototype.combatDrawing = function(ctx){

}

function drawHeroCanvas(ctx, hero){
    var w = $("canvas#hero").width(), 
        h = $("canvas#hero").height();
    var yStart = 0, yInc = 20, xPad = 5;

    ctx.beginPath();
    ctx.fillStyle = "#efe4b0";
    ctx.fillRect(0,0,w,h);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.font = yInc+"px Courier New";

    //Draw Stats
    ctx.fillText(hero.name,                               xPad, yStart+=yInc);
    ctx.fillText("LVL    : "+hero.lvl+" ["+hero.exp+"]",  xPad, yStart+=yInc);
    ctx.fillText("HP     : "+hero.hp+"/"+hero.maxhp,      xPad, yStart+=yInc);
    ctx.fillText("SPECIAL: "+hero.special+"/5",           xPad, yStart+=yInc);
    ctx.fillText("SHIELD : "+hero.shield,                 xPad, yStart+=yInc);
    ctx.fillText("SPEED  : "+hero.speed,                  xPad, yStart+=yInc);
    ctx.fillText("ATTACK : "+hero.attack,                 xPad, yStart+=yInc);
    ctx.fillText("GOLD   : "+hero.gold,                   xPad, yStart+=yInc);
    ctx.fillText("SCENES : "+hero.scenes,                 xPad, yStart+=yInc);

    ctx.fill();
}

function drawItemCanvas(ctx, hero){
    var w = $("canvas#hero").width(), 
        h = $("canvas#hero").height();
    var yStart = 0, yInc = 20, xPad = 5;

    ctx.beginPath();
    ctx.fillStyle = "#efe4b0";
    ctx.fillRect(0,0,w,h);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.font = yInc+"px Courier New";

    for(var i = 0; i < hero.items.length; i++){
        if(hero.items[i])
            ctx.fillText(i,xPad,yStart+=yInc);
    }

    ctx.fill();
}

function drawDialogBox(ctx, w, h, imageLibrary){
    //Box Fill
    ctx.beginPath();
    ctx.fillStyle = "#00576f";
    ctx.fillRect(50,20,w-100,120);
    ctx.fill();

    //Box Outline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.rect(55,25,w-110,110);
    ctx.rect(55,25,w-110,110);
    ctx.rect(55,25,w-110,110);
    ctx.rect(55,25,w-110,110);
    ctx.rect(55,25,w-110,110);
    ctx.rect(55,25,w-110,110);
    ctx.stroke();

    //TODO: Figure out why it takes multiple strokes
}

function drawDialog(ctx, w, h, dialog){
    var xPad = 70, yPad = 55;
    var startSection = parseInt(dialog.section/3)*3;
    ctx.beginPath();
    ctx.font = "30px Courier New";
    ctx.fillStyle = "#FFF";

    // console.log(dialog.mark,dialog.section,startSection, dialog.text.length);

    for(var l = 0; l < 3 && startSection+l < dialog.section+1; l++){
        if(dialog.section==startSection+l) ctx.fillText(dialog.text[startSection+l].substring(0,dialog.mark), xPad, yPad+35*l);
        else ctx.fillText(dialog.text[startSection+l], xPad, yPad+35*l);
    }
    ctx.fill();
}

function drawDialogArrow(ctx, w, h){
    ctx.beginPath();
    ctx.fillStyle = "#FFF";
    ctx.moveTo(w-70, 125);
    ctx.lineTo(w-63, 120);
    ctx.lineTo(w-77, 120);
    ctx.fill();
}

function drawOptions(ctx, w, h, options, choice, merchantScene, hero){
    var yPad = h-120, yPad2 = h-110, xPad = 50, exPad=0, spacer=0;
    var boxW = 180, boxH = 50;

    //Determine number of decisions
    if(options.length == 3){
        exPad=20;
        spacer=230;

    }else if(options.length%2 == 0){ // 2 or 4
        exPad=82;
        spacer=345;
    }


    for(var l = 0; l < 2; l++){
        var yPadAdj = (l==0?-45:45);
        if(options.length<4) yPadAdj = 0;

        for(var o = 0; (o < options.length && options.length<4) || (o < 2 && options.length==4); o++){
            if(choice==null || (choice!=null && choice==options[o+l*2].id)){
                //Draw boxes
                //Box Fill
                ctx.beginPath();
                if(merchantScene && -options[o+l*2].results[0].goldChange > hero.gold && choice==null) ctx.fillStyle = "#00172f";
                else ctx.fillStyle = "#00576f";
                ctx.fillRect(xPad+exPad+spacer*o,yPad+yPadAdj,boxW,boxH);
                ctx.fill();

                //Box Outline
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255,255,255,1)";
                ctx.rect(xPad+exPad+5+spacer*o,yPad+5+yPadAdj,boxW-10,boxH-10);
                ctx.stroke();

                //Write Option
                const maxLen = 13;
                ctx.beginPath();
                ctx.font = "20px Courier New";
                ctx.fillStyle = "#FFF";

                //Determine if option is too long
                var optsText = textSpliter(options[o+l*2].text, 2, 13, false);
                var drewUnderline = false;
                for(var t = 0; t < optsText.length; t++){
                    var padCount = 0, padding = "";
                    padCount = (maxLen - optsText[t].length)/2, padding = "";
                    for(var p = 0; p < padCount; p++) padding+=" ";
                    ctx.fillText(padding+optsText[t], xPad+exPad+10+spacer*o, yPad+30+20*t-(optsText.length==1?0:10)+yPadAdj);

                    //Draw Underline
                    if(optsText[t].search(options[o+l*2].keyword)>-1 && !drewUnderline){
                        drewUnderline = true;
                        var startX  = ctx.measureText(padding).width + optsText[t].search(options[o+l*2].keyword)*ctx.measureText(" ").width +xPad+exPad+10+spacer*o,
                            startY  = yPad+30+20*t-(optsText.length==1?0:10)+2+yPadAdj;
                        var lineWid = ctx.measureText(options[o+l*2].keyword).width;
                        var endX    = startX+lineWid;

                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(255,255,255,1)";
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(endX, startY);
                        ctx.stroke();
                    }
                }
                ctx.fill();


                //Write Option ID
                ctx.beginPath();
                ctx.font = "25px Courier New";
                ctx.fillStyle = "#000";
                ctx.fillText("     "+options[o+l*2].id, xPad+exPad+10+spacer*o, yPad-5+yPadAdj);
                ctx.fillStyle = "#FFF";
                ctx.fillText("     "+options[o+l*2].id, xPad+exPad+9+spacer*o, yPad-4+yPadAdj);
                ctx.fill();


                //Draw Cost Bubble if Merchant Scene
                if(merchantScene && options[o+l*2].results[0].goldChange < 0){
                    var xCenter = xPad+exPad+spacer*o, yCenter = yPad+yPadAdj;
                    var cost = -options[o+l*2].results[0].goldChange;

                    //Draw Circle
                    ctx.beginPath();
                    if(-options[o+l*2].results[0].goldChange > hero.gold && choice==null) ctx.fillStyle = "#e91e63";
                    else ctx.fillStyle = "#8bc34a";
                    ctx.arc(xCenter, yCenter, 20, 0, 2 * Math.PI, false);
                    ctx.fill();

                    //Box Outline
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255,255,255,1)";
                    ctx.arc(xCenter, yCenter, 18, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.font = "20px Courier New";
                    ctx.fillStyle = "#FFF";
                    if(cost<10) ctx.fillText("0"+cost, xCenter-12, yCenter+7);
                    else ctx.fillText(cost, xCenter-12, yCenter+7);
                    ctx.fill();
                }
            }
        }

        if(options.length<4) break;
    }
}

function drawVoteTimer(ctx, w, h, time){
    var xCenter = w-45, yCenter = h-45;

    //Draw Circle
    ctx.beginPath();
    ctx.fillStyle = "#00576f";
    ctx.arc(xCenter, yCenter, 40, 0, 2 * Math.PI, false);
    ctx.fill();

    //Box Outline
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.arc(xCenter, yCenter, 35, 0, 2 * Math.PI, false);
    ctx.stroke();

    ctx.beginPath();
    ctx.font = "40px Courier New";
    ctx.fillStyle = "#FFF";
    if(time<10) ctx.fillText("0"+time, xCenter-25, yCenter+10);
    else ctx.fillText(time, xCenter-25, yCenter+10);
    ctx.fill();
}

function drawBackground(ctx, w, h, imageLibrary, scene, combat){
    //TODO: Make this better and more interactive when selecting scenes

    //Clear background
    ctx.beginPath();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0,0,w,h);
    ctx.fill();

    if(scene.id == -9999){
        ctx.beginPath();
        ctx.fillStyle = "#3f51b5";
        ctx.fillRect(0,0,w,h);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.font = "120px Courier New";
        ctx.fillText("TwitchRPG",80,300);
        ctx.fill();
    }
    else if(scene.id == -9998){
        ctx.beginPath();
        ctx.fillStyle = "rgba(40,40,40,1)";
        ctx.fillRect(0,0,w,h);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "rgba(158,0,0,1)";
        ctx.font = "120px Courier New";
        ctx.fillText("GAME OVER",80,300);
        ctx.fill();
    }
    else if(scene.id == -1){
        ctx.beginPath();
        ctx.drawImage(imageLibrary["backgrounds"].campfire.image,0,0);
        ctx.fill();
    }
    else if(scene.subregion!="DUNGEON"){
        ctx.beginPath();
        if(combat) ctx.drawImage(imageLibrary["backgrounds"].field_combat.image,0,0);
        else ctx.drawImage(imageLibrary["backgrounds"].field.image,0,0);
        ctx.fill();
    }else{
        ctx.beginPath();
        if(combat) ctx.drawImage(imageLibrary["backgrounds"].dungeon_combat.image,0,0);
        else ctx.drawImage(imageLibrary["backgrounds"].dungeon.image,0,0);
        ctx.fill();
    }
}

function drawEncounter(ctx, w, h, encounter, imageLibrary, frameID){
    var sX = 0, sY = 200;
    var spacing = w / encounter.monsters.length;

    //Temp idea
    var modelsUsed = [];

    for(var m = encounter.monsters.length-1; m >-1 ; m--){
        if(encounter.monsters[m].hp >0){
            var img = imageLibrary.monsters[encounter.monsters[m].model];
            var monWid = img.wid*img.scale, monHei = img.hei*img.scale;
            var pX = spacing/2-monWid/2, pY = 150/2-monHei/2;

            if(frameID%img.speed == 0 && !modelsUsed[encounter.monsters[m].model]) img.frame = (img.frame+1)%img.loop.length;
            ctx.drawImage(img.image,img.loop[img.frame]*img.wid+img.xOff,img.hei*0,img.wid,img.hei, sX+pX+spacing*m,sY+pY,monWid,monHei);

            modelsUsed[""+encounter.monsters[m].model] = true;
        }
    }
}



//***********************************************************************
//Data Update Functions
//***********************************************************************
Drawing.prototype.receiveNewScene = function(scene){
    if(this.newScene == null) this.newScene = scene;
}

Drawing.prototype.receiveCombatUpdate = function(combat){
    if(combat){
        //Update Flags
        this.dialog = null;
        this.completedDialog = false;
        this.completedResultsDialog = false;
        this.completedChoice = null;
    }
    this.inCombat = combat;
}

Drawing.prototype.receiveCombatResults = function(data){
    console.log(data);

    this.completedChoice = data.option;
    this.combatResults = data.results;
    this.crIndex = 0;

    //Process first dialog
    this.processCombatResults();
}

Drawing.prototype.receiveEndCombatResults = function(data){
    console.log(data);
    this.dialog = {
        "mark": 0,
        "section": 0,
        "text": textSpliter(data.dialog, -1, 37, false)
    };
    this.completedDialog = false;
}

Drawing.prototype.receiveStartCombat = function(data){
    this.dialog = {
        "mark": 0,
        "section": 0,
        "text": textSpliter(data.dialog, -1, 37, false)
    };
    this.completedDialog = false;
    this.completedChoice = null;
    this.encounter = data.encounter;
    this.combatDecisions = data.decisions;
}

Drawing.prototype.receiveVoteUpdate = function(vote){
    if(this.voteTimer < vote.time)
    this.voteTimer = vote.time;
}

Drawing.prototype.receiveVoteResult = function(data){
    // console.log(data);

    this.completedChoice = data.option;
    this.dialog = {
        "mark": 0,
        "section": 0,
        "text": textSpliter(data.result.dialog, -1, 37, false)
    };
}

Drawing.prototype.receiveStatics = function(data){
    this.dialogRate = data.DIALOG_SPEED;
    this.waitFrames = data.WAIT_FRAMES;
}

Drawing.prototype.incrementTimer = function(){
    if(this.voteTimer > 0) this.voteTimer--;
}

Drawing.prototype.receiveNewChatMessage = function(msg){
    var newLines = textSpliter(msg.user+": "+msg.message,-1,34,false);

    for(var n = 0; n < newLines.length; n++){
        this.chatlog.unshift(newLines[n]);
        if(this.chatlog.length > this.maxChatLines) this.chatlog.pop();
    }
}

Drawing.prototype.updateHero = function(hero){
    this.hero = hero;
    drawHeroCanvas(this.heroCanvas.getContext("2d"), hero);
    drawItemCanvas(this.itemCanvas.getContext("2d"), hero);
}

//***********************************************************************
//Onload Functions
//***********************************************************************
Drawing.prototype.loadImages = function(){
    this.imageLibrary = [];


    // Background images
    this.imageLibrary["backgrounds"] = [];
    this.imageLibrary["monsters"] = [];

    var tempImg = new Image;
    tempImg.src = "/images/backgrounds/campfire.png";
    this.imageLibrary["backgrounds"]["campfire"] = {
        "type": "background",
        "name": "campfire",
        "image": tempImg
    };

    var tempImg = new Image;
    tempImg.src = "/images/backgrounds/dungeon.png";
    this.imageLibrary["backgrounds"]["dungeon"] ={
        "type": "background",
        "name": "dungeon",
        "image": tempImg
    };
    var tempImg = new Image;
    tempImg.src = "/images/backgrounds/field.png";
    this.imageLibrary["backgrounds"]["field"] ={
        "type": "background",
        "name": "field",
        "image": tempImg
    };

    var tempImg = new Image;
    tempImg.src = "/images/backgrounds/field_combat.png";
    this.imageLibrary["backgrounds"]["field_combat"] = {
        "type": "background",
        "name": "field_combat",
        "image": tempImg
    };

    var tempImg = new Image;
    tempImg.src = "/images/backgrounds/dungeon_combat.jpg";
    this.imageLibrary["backgrounds"]["dungeon_combat"] = {
        "type": "background",
        "name": "dungeon_combat",
        "image": tempImg
    };


    //Monster Images
    var tempImg = new Image;
    tempImg.src  = "/images/monsters/slime.png";
    this.imageLibrary["monsters"]["slime"] = {
        "type": "monster",
        "model": "slime",
        "image": tempImg,
        "scale": 4,
        "frame": 0,
        "loop": [0,1,2,3,4,5,6,7,8,9],
        "speed": 5,
        "wid": 32,
        "hei": 32,
        "xOff": 0,
        "yOff": 0
    };

    var tempImg = new Image;
    tempImg.src  = "/images/monsters/bandit.png";
    this.imageLibrary["monsters"]["bandit"] = {
        "type": "monster",
        "model": "bandit",
        "image": tempImg,
        "scale": 4,
        "frame": 0,
        "loop": [1,0,1,2],
        "speed": 6,
        "wid": 24,
        "hei": 32,
        "xOff": 7,
        "yOff": 0
    };

    var tempImg = new Image;
    tempImg.src  = "/images/monsters/wolf.png";
    this.imageLibrary["monsters"]["wolf"] = {
        "type": "monster",
        "model": "wolf",
        "image": tempImg,
        "scale": .6,
        "frame": 0,
        "loop": [1,2,3,4,5,6],
        "speed": 7,
        "wid": 336,
        "hei": 160,
        "xOff": 10,
        "yOff": 0
    };

    var tempImg = new Image;
    tempImg.src  = "/images/monsters/orc.png";
    this.imageLibrary["monsters"]["orc"] = {
        "type": "monster",
        "model": "orc",
        "image": tempImg,
        "scale": .5,
        "frame": 0,
        "loop": [0],
        "speed": 6,
        "wid": 220,
        "hei": 220,
        "xOff": 0,
        "yOff": 0
    };

    //Character Images
    var tempImg = new Image;
    tempImg.src  = "/images/character_sheet.png";
    this.imageLibrary["character_sheet"] ={
        "type": "characters",
        "name": "character_sheet",
        "image": tempImg
    };

    console.log("loaded Images");

    console.log(this.imageLibrary);
}

Drawing.prototype.correctCanvasSize = function(canvas, id){
    var ratio = pixel_ratio(canvas.getContext('2d'));
    var w = $("canvas#"+id).width(), 
        h = $("canvas#"+id).height();

    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
}

Drawing.prototype.loadCanvases = function(hero, item){
    this.heroCanvas = hero;
    this.itemCanvas = item;
}

//***********************************************************************
//Helper Functions
//***********************************************************************
//Ref: https://stackoverflow.com/questions/15661339/how-do-i-fix-blurry-text-in-my-html5-canvas
function pixel_ratio(ctx) {
    var dpr = window.devicePixelRatio || 1,
        bsr = ctx.webkitBackingStorePixelRatio ||
              ctx.mozBackingStorePixelRatio ||
              ctx.msBackingStorePixelRatio ||
              ctx.oBackingStorePixelRatio ||
              ctx.backingStorePixelRatio || 1;

    return dpr / bsr;
}

/*
 * Returns an array with the text split nicely by spaces. Should be run 1 time per 
 * dialog or chat. This assumes mono font
 *
 * Text: text to manipulate
 * maxLine: maximum lines the array is allowed to have. -1 for no max
 * maxLen: The maximum number of characters per line
 * reverse: Denotes if the array should return the lines in reverse order
 */
function textSpliter(text, maxLines, maxLen, reverse){
    //TODO: Remove mono font requirement if possible
    var array = [], textParse = ""+text;

    if(text=="" || text==null) return null;

    for(var l = 0; l < (maxLines==-1?100:maxLines) && textParse.length>0; l++){
        var split = textParse.slice(0,Math.min(maxLen,textParse.length));
        // console.log("SPLIT",l,split);
        var space = false;

        if(split!==textParse){
            //Find the space
            for(var s = split.length; s > -1; s--){
                if(split.slice(s,s+1) == " "){
                    space = true;

                    if(reverse) array.unshift(split.slice(0,s));
                    else        array.push(split.slice(0,s));

                    textParse = textParse.slice(s+1,textParse.length);

                    break;
                }
            }
        }

        if(!space){
            if(reverse) array.unshift(split);
            else        array.push(split);

            textParse = textParse.slice(split.length,textParse.length);

        }
    }




    return array;
}


Drawing.prototype.processCombatResults = function(){
    //Should always be formatted, dialog and what the dialog does

    //Catch end case
    if(this.crIndex>=this.combatResults.length){
        this.crIndex = 0;
        this.combatResults = null;
        return;
    }

    //Dialog
    if(this.combatResults[this.crIndex].type == "dialog"){
        this.dialog = {
            "mark": 0,
            "section": 0,
            "text": textSpliter(this.combatResults[this.crIndex].dialog, -1, 37, false)
        };
        this.completedDialog = false;

        //Increment
        this.crIndex++;
    }

    //Process text
    else if(this.combatResults[this.crIndex].type == "result"){
        if(this.combatResults[this.crIndex].id=="player"){
            if(this.combatResults[this.crIndex].change=="death"){
                //Death animation trigger?
            }else if(this.combatResults[this.crIndex].change=="item"){
                //Item animation trigger?
            }else{
                this.hero[""+this.combatResults[this.crIndex].change] += this.combatResults[this.crIndex].amt;
            }
            drawHeroCanvas(this.heroCanvas.getContext("2d"), this.hero);
        }else{
            if(this.combatResults[this.crIndex].change=="death"){
                //Death animation trigger?
            }else if(this.combatResults[this.crIndex].change=="item"){
                //Item animation trigger?
            }else{
                this.encounter.monsters[this.combatResults[this.crIndex].id][""+this.combatResults[this.crIndex].change] += this.combatResults[this.crIndex].amt;
            }
        }

        //Increment
        this.crIndex++;

        //Call process again
        this.processCombatResults();
    }
}