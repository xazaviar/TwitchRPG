var chatlog = [];

$(document).ready(function() {

    var socket = io();
    var canvas = document.getElementById('chat');
    var ratio = pixel_ratio(canvas.getContext('2d'));
    var w = $("canvas#chat").width(), 
        h = $("canvas#chat").height();

    canvas.width = w * ratio;
    canvas.height = h * ratio;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.getContext("2d").setTransform(ratio, 0, 0, ratio, 0, 0);
    drawChat(canvas.getContext("2d"));
    // game.animate(); 


    socket.on('chat-update', function(data) {
        // console.log(data);
        chatlog.unshift(data);
        drawChat(canvas.getContext("2d"));
    });

    //Connect to the server
    socket.emit('game-connect', {
        hello: true
    });

});


function drawChat(ctx){
    var w = $("canvas#chat").width(), 
        h = $("canvas#chat").height();

    // ctx.clearRect(0, 0, ctx.width, ctx.height);
    ctx.beginPath();
    ctx.fillStyle = "#6534D2";
    ctx.fillRect(0,0,w,h);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.font = "18px Courier New";


    //TODO: split the text more nicely, also remove mono font if possible
    const maxLines = 38, maxLen = 25;
    for(var i = 0, lines = 0; i < chatlog.length && lines < maxLines; i++){
        var mes = chatlog[i].user +": "+chatlog[i].message;
        // console.log("width:",ctx.measureText(mes).width);

        if(mes.length > maxLen){
            // var split = mes;
            for(var split = parseInt(mes.length/maxLen); split > -1; split--){
                ctx.fillText(mes.substring(split*maxLen,Math.min(mes.length,split*maxLen+maxLen)), 5, h - 16*(lines+1)+8);
                lines++;
            }
        }
        else{
            ctx.fillText(mes, 5, h - 16*(lines+1)+8);
            lines++;
        }
       
    }
    ctx.fill();

}


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