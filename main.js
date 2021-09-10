//Dependencies
require('dotenv').config();
const PORT = parseInt(process.env.PORT) || 8080;
const FPS = parseInt(process.env.FPS) || 30;

const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const socketIO = require('socket.io');
const tmi = require('tmi.js');
const Game = require('./lib/Game');


const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const logFormat = printf(({ level, message, timestamp }) => {
	return `${timestamp} ${level}: ${message}`;
});
const consoleFormat = printf(({ level, message}) => {
	return `${level}: ${message}`;
});

//Logs
const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp(),
        logFormat
    ),
    defaultMeta: { service: 'user-service' },
    transports: [
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' })
    ]
});

logger.add(new transports.Console({
	format: consoleFormat
}));


// Initialization
var app = express();
var server = http.Server(app);
var io = socketIO(server);
var game = Game.create(logger);

app.set('port', PORT);
app.use(bodyParser.json());
app.use('/public', express.static(__dirname + '/public'));


app.get('/', function(req, res){
    res.sendFile( __dirname + "/public/index.html" );
});

app.get('/*', function (req, res, next) {
    var file = req.params[0];

    fs.readFile(__dirname + '/public/' + file, 'utf-8', function (err, data) {
        var ip = req.header('x-forwarded-for') || req.connection.remoteAddress;

        if(err){
            logger.error("No such file or directory '"+err.path+"' [REQUEST FROM: "+ip+"]");
            res.sendFile( __dirname + "/public/404.html" );
        }else{
            res.sendFile( __dirname + '/public/' + file);
        }
    });
});


/**
 * Server side input handler, modifies the state of the players and the
 * game based on the input it receives. Everything here runs asynchronously.
 */
var mainSocket = null;
io.on('connection', (socket) => {
	if(mainSocket==null){
		mainSocket = socket;
		game.updateSocket(socket);

		socket.emit('statics', {
			"FPS": parseInt(process.env.FPS),
			"WAIT_FRAMES": parseInt(process.env.WAIT_FRAMES),
			"DIALOG_SPEED": parseInt(process.env.DIALOG_SPEED),
			"VOTING_TIME": parseInt(process.env.VOTING_TIME),
			"COMBAT_DECISON": game.getCombatDecision()
		});
    	socket.emit('scene-update', game.getScene());
    	socket.emit('new-hero', game.getHero());
	} 

    socket.on('request-scene', () => {
    	socket.emit('scene-update', game.getScene());
    });

    socket.on('disconnect', () => {
        mainSocket = null;
    });
});


/**
 * Start the server.
 */
server.listen(PORT, function() {
    logger.info("***********************************");
    logger.info(`STARTING SERVER ON PORT ${PORT}`);
    logger.info(Date());
    if(process.env.ISPROD==false) logger.info("DEVELOPER MODE ENABLED");
    logger.info("***********************************");
});



/**
 * Start game loop
 */
 setInterval(() => {
 	if(game.hasStarted())
    	game.mainLoop();
}, 1000);


/**
 * Twitch Chat Hook up
 */
const client = new tmi.Client({
    options: { debug: true, messagesLogLevel: "info" },
    connection: {
        reconnect: true,
        secure: true
    },
	identity: {
        username: `${process.env.TWITCH_USERNAME}`,
        password: `oauth:${process.env.TWITCH_OAUTH}`
    },
	channels: [`${process.env.TWITCH_CHANNEL}`]
});
client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
    if (self) return;

    switch (message.toLowerCase()) {
        // case 'hi':
        //     client.say(channel, `Hello @${tags.username}, what's up?!`);
        //     break;

        case 'start':
        	if(tags['user-id'] == 45787477){
        		game.startGame();
        	}

        	if(mainSocket){
        		mainSocket.emit('chat-update', {user: tags.username, message: message, tags: tags});
        	}
        	break;

        default:
        	if(mainSocket){
        		mainSocket.emit('chat-update', {user: tags.username, message: message, tags: tags});
        	}

        	if(game.voteOpen()){
        		if(!parseInt(process.env.UNIQUE_VOTING)){
        			//check for valid vote
        			var vote = game.getChoices();
        			for(var v = 0; v < vote.length; v++){
        				if(message.toUpperCase() == vote[v].id ||
        				   message.toLowerCase() == vote[v].text.toLowerCase() ||
        				   message.toLowerCase() == vote[v].keyword.toLowerCase()){
        					game.newVote(v);
        					break;
        				}
        			}
        		}
        	}

        	break;
    }
});

/**
 * Code to run code right before the program closes
 */
process.stdin.resume();

function exitHandler(options, exitCode){
    // if (options.cleanup){
    //     console.log("CLEAN UP?");
    // }

    if (options.error){
    	console.log(exitCode);
        // logger.error(""+exitCode);
    }
    if (exitCode || exitCode === 0){
    	logger.info("Exit code: "+exitCode);
    	process.exit();
    } 
    if (options.exit){
        logger.info("SERVER PREPARING TO SHUT DOWN");
        // game.saveGameData(function(){
        //     game.savePlayerData(function(){
        //         logger.info("SERVER SHUTTING DOWN");
                process.exit();
        //     },true);
        // },true);
    } 
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:false,error:true}));