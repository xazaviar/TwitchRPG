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
        draw.heroCanvas(heroCanvas.getContext("2d"), data);
        draw.itemCanvas(itemCanvas.getContext("2d"), data);
    });

    socket.on('hero-update', function(data){
        draw.heroCanvas(heroCanvas.getContext("2d"), data);
        draw.itemCanvas(itemCanvas.getContext("2d"), data);
    });

    // socket.emit('request-scene');


    

});