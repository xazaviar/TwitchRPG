var FPS = 30;
var newLoad = true;

$(document).ready(function() {

    var socket = io(),
        draw = Drawing.create();
    var chatCanvas = document.getElementById('chat'),
        gameCanvas = document.getElementById('game'),
        heroCanvas = document.getElementById('hero'),
        itemCanvas = document.getElementById('items'),
        gemsCanvas = document.getElementById('gems');
    draw.correctCanvasSize(chatCanvas,"chat");
    draw.correctCanvasSize(gameCanvas, "game");
    draw.correctCanvasSize(heroCanvas, "hero");
    draw.correctCanvasSize(itemCanvas, "items");
    draw.correctCanvasSize(gemsCanvas, "gems");
    draw.loadCanvases(heroCanvas,itemCanvas);

    var chatlog = [];
    var chatLogMaxLen = 35;


    //Init Socket.io
    //Update Chat
    socket.on('chat-update', function(data) {
        // console.log(data);
        draw.receiveNewChatMessage(data);
        draw.chat(chatCanvas.getContext("2d"));
    });

    socket.on('scene-update', function(data){
        console.log(data);
        draw.receiveNewScene(data);
    });

    socket.on('vote-update', function(data){
        draw.receiveVoteUpdate(data);
    });

    socket.on('vote-result', function(data){
        draw.receiveVoteResult(data);
    });

    socket.on('statics', function(data){
        FPS = data.FPS;
        draw.receiveStatics(data);

        //Start game animation loop
        if(newLoad){
            setInterval(() => {
                draw.animateGame(gameCanvas.getContext("2d"));
            }, 1000 / FPS);

            setInterval(() => {
                draw.incrementTimer();
            }, 1000);
            newLoad = false;
        }
    });

    socket.on('new-hero', function(data){
        draw.updateHero(data);
    });

    socket.on('hero-update', function(data){
        draw.updateHero(data);
    });

    socket.on('start-combat-data', function(data){
        console.log(data);
        draw.receiveStartCombat(data);
    });

    socket.on('combat-status', function(data){
        draw.receiveCombatUpdate(data);
    });

    socket.on('combat-result', function(data){
        draw.receiveCombatResults(data);
    });

    socket.on('end-combat-result', function(data){
        draw.receiveEndCombatResults(data);
    });
    // socket.emit('request-scene');


    

});