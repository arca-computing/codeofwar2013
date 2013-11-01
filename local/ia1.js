/*!
 * Copyright 2013 ARCA Computing
 * 
 * author : Lorenzo Arcaini
 */
 
/**
* nom de l'IA
*/
var name = "Jarvis";

/**
 * couleur d'affichage
*/
var color = 0;

/** message de debugage
 *  utilisé par le systeme et affiché dans la trace à chaque tour du combat
*/
var debugMessage="";

/* Id de l'IA */
var id = 545;

/**
 * @internal method
*/
onmessage = function(event)
{
	if(event.data != null) {
		var turnMessage = event.data;
		id = turnMessage.playerId;
		postMessage(new TurnResult( getOrders(turnMessage.galaxy), debugMessage));
	} 
	else postMessage("data null");
};


var IA = {};
IA.LAST_TURN = 500;
IA.MAX = 40;
IA.TURN = -1;
IA.P_COUNTER = 1;
IA.P_LAST_COUNTER = 1;
IA.P_LAST_INCREASE_TURN = -1;
IA.P_WAIT_FOR_CHANGE = 20;
IA.P_WAIT_FOR_INCREASE = 30;
IA.P_CURRENT_WAIT = 0;
IA.ENEMY_ID;
IA.ENEMY_COUNTER;
IA.SCORING_MODE = false;
IA.SCORING_START_COUNTDOWN = false;
IA.SCORING_COUNTDOWN = 40;
IA.MAX_SCORING_POPULATION_TARGET = 200;

function defenseThenAttack(a,b) {
	if (a.owner.id != b.owner.id) {
		if (a.owner.id == id) {
			return -1;
		} else {
			return 1;
		}
	}

	return a.distance - b.distance;
}

/**
 * Invoquée tous les tours pour recuperer la liste des ordres à exécuter.
 * C'est la methode à modifier pour cabler son IA.
 * @param context:Galaxy
 * @return result:Array<Order>
*/
var getOrders = function(context) {
	IA.TURN++;
	
	var result = new Array();

	IA.galaxy = context;
	IA.allPlanets = context.content;
	IA.myPlanets = GameUtil.getPlayerPlanets(id, context );
	IA.otherPlanets = GameUtil.getEnnemyPlanets(id, context);

	initShips();
	IA.ENEMY_COUNTER = 1;

	improveModel();
	computeState(IA.allPlanets);
	
	// Identification de l'adversaire
	
	if (IA.ENEMY_ID == undefined) {
		checkEnemyID();
	}
	
	if (IA.ENEMY_ID == undefined) {
		IA.enemyPlanets = IA.otherPlanets;
	} else {
		IA.enemyPlanets = GameUtil.getPlayerPlanets(IA.ENEMY_ID, context);
	}
	IA.neutralPlanets = getNeutrals(IA.otherPlanets);
	
	// Gestion du mode de scoring
	
	IA.SCORING_MODE = IA.enemyPlanets.length == 1;
	IA.SCORING_START_COUNTDOWN = IA.SCORING_START_COUNTDOWN || (IA.SCORING_MODE && (IA.otherPlanets.length == 1));
	if (IA.SCORING_START_COUNTDOWN) {
		IA.SCORING_COUNTDOWN--;
	}
	
	// Gestion des blocages
	
	IA.P_COUNTER = IA.myPlanets.length;
	if (IA.P_COUNTER > IA.P_LAST_COUNTER) {
		IA.P_LAST_INCREASE_TURN = IA.TURN;
	}
	if (IA.TURN - IA.P_LAST_INCREASE_TURN > IA.P_WAIT_FOR_CHANGE && IA.P_CURRENT_WAIT <= 0) {
		IA.P_CURRENT_WAIT = IA.P_WAIT_FOR_INCREASE;
	}
	
	if (IA.P_CURRENT_WAIT > 0 && !IA.SCORING_MODE) {
		invalidPlanets(IA.otherPlanets);
	}
	
	IA.allPlanets.sort(defenseThenAttack);
	
	// Check for neutral captured by enemy
	/*
	var candidatesBack = [];
	for (var index in IA.neutralPlanets) {
		var target = IA.neutralPlanets[index];
		if (callForSnapbackCandidates(target)) {
			target.snapback = true;
			candidatesBack.push(target);
		}
	}
	*/
	// Check for one shot targets
	
	var candidatesOS = [];
	for (var index in IA.allPlanets) {
		var target = IA.allPlanets[index];
		if (callForOneShotCandidates(target)) {
			target.os = true;
			candidatesOS.push(target);
		}
	}

	resetDistance();
	
	// Check for other targets
	
	candidatesNOS = [];
	for (var index in IA.allPlanets) {
		var target = IA.allPlanets[index];
		if (callForCandidates(target)) {
			candidatesNOS.push(target);
		}
	}
	/*
	var candidates = candidatesBack.concat(candidatesOS);
	candidates = candidates.concat(candidatesNOS);
	*/
	var candidates = candidatesOS.concat(candidatesNOS);
	
	// Attack

	candidates.sort(defenseThenAttack);
	for (var index in candidates) {
		var target = candidates[index];
		
		// Protège la dernière planète ennemie avant la fin de partie
		if (target.owner.id == IA.ENEMY_ID) {
			IA.ENEMY_COUNTER++;
			if (IA.ENEMY_COUNTER >= IA.enemyPlanets.length && IA.SCORING_COUNTDOWN > 0) {
				target.validTarget = false;
			}
		}
		
		if (target.snapback) {
			result = result.concat(callFoSnapbackFleet(target));
		} else if (target.os) {
			result = result.concat(callForOneShotFleet(target));
		} else {
			result = result.concat(callForFleet(target));
		}
	}
	
	// Check over population
	
	var overflow = [];
	var freeSlots = [];
	
	var myPlanets = IA.myPlanets;
	for (var index in myPlanets) {
		var planet = myPlanets[index];
		if (isOverflowing(planet)) {
			overflow.push(planet);
		} else {
			freeSlots.push(planet);
		}
	}

	for (var index in overflow) {
		var planet = overflow[index];
		result = result.concat(manageOverflow(planet, freeSlots));
	}
	
	// results
	
	IA.P_LAST_COUNTER = IA.P_COUNTER;
	if (IA.P_CURRENT_WAIT > 0) {
		IA.P_CURRENT_WAIT--;
		if (IA.P_CURRENT_WAIT <= 0) {
			IA.P_LAST_INCREASE_TURN = IA.TURN;
		}
	}
	
	return result;
};

var initShips = function() {
	IA.myShips = [];
	IA.otherShips = [];
	
	for (var index in IA.galaxy.fleet) {
		var ships = IA.galaxy.fleet[index];
		if (ships.owner.id == id) {
			IA.myShips.push(ships);
		} else {
			IA.otherShips.push(ships);
		}
	}
}

var improveModel = function () {
	var planets = IA.allPlanets;
	for (var index in planets) {
		var planet = planets[index];

		planet.capacity = planet.population;
		planet.attackedBy = 0;
		planet.distance = 0;
		planet.validTarget = true;
		planet.overflow = 0;
		planet.os = false;
		planet.snapback = false;
		planet.decisiveTurn = 0;

		planet.t = [];
		planet.c = [];
		
		if (planet.owner.id == id) {
			planet.t[0] = planet.population;
		} else {
			planet.t[0] = -1 * planet.population;
		}
		
		planet.state = planet.t[0];
		planet.c[0] = planet.id == id;
		
		for (var i = 1; i <= IA.MAX; i++) {
			planet.t[i] = 0;
			planet.c[i] = planet.c[0];
		}

	}
}

var resetDistance = function () {
	var planets = IA.allPlanets;
	for (var index in planets) {
		var planet = planets[index];
		planet.distance = 0;
	}
}

var invalidPlanets = function(planets) {
	for (var index in planets) {
		var planet = planets[index];
		planet.validTarget = false;
	}
}

var checkEnemyID = function() {
	if (IA.otherShips.length > 0) {
		IA.ENEMY_ID = IA.otherShips[0].owner.id;
	}
}

var computeState = function(planets) {
	for (var index in IA.galaxy.fleet) {
		var ship = IA.galaxy.fleet[index];
		var planet = getById(planets, ship.target.id);
		
		var range = getShipRangeInTurn(ship);

		if (planet.owner.id == ship.owner.id && planet.owner.id == id) {
			planet.state += ship.crew;
			planet.t[range] += ship.crew;
		} else if (planet.owner.id != ship.owner.id && planet.owner.id != id) {
			planet.state += ship.crew;
			planet.t[range] += ship.crew;
			planet.attackedBy += ship.crew;
		} else {
			planet.state -= ship.crew;
			planet.t[range] -= ship.crew;
			planet.attackedBy += ship.crew;
		}
	}

	var planets = IA.allPlanets;
	for (var index in planets) {
		var planet = planets[index];
		
		if (planet.owner.id == id) {
			planet.capacity -= planet.attackedBy;
			
			if (!IA.SCORING_MODE) {
				var nearestAll = getNearestPlanet(planet, planets);
				var nearestMine = getNearestPlanet(planet, IA.myPlanets);
				if (nearestMine.id != nearestAll.id && nearestAll.owner.id == IA.ENEMY_ID) {
					planet.capacity = Math.floor(planet.capacity / 2);
				}
			}
		} else {
			planet.validTarget = (planet.state <= 0);
		}

		var score = 0;
		for (var i = 0; i <= IA.MAX; i++) {
			score += planet.t[i];
			
			if (score > 0) {
				score += Game.PLANET_GROWTH;
			} else {
				score -= Game.PLANET_GROWTH;
			}
			
			planet.c[i] = score > 0;
		}

		var previous = planet.c[0];
		var turn = 0;
		for (var i = 1; i <= IA.MAX; i++) {
			var current = planet.c[i];
			if (previous != current) {
				turn = i;
				previous = current;
			}
		}
		planet.decisiveTurn = turn;
	}

}

/*
var callForSnapbackCandidates = function(target) {
	if (!target.validTarget && target.owner.id != id) {
		return false;
	}
	
	var previous = target.c[0];
	
	for (var i = 1; i <= IA.MAX; i++) {
		var current = target.c[i];
		if (previous != current) {
			previous = current;
		}
	}
	
	return !previous;
}
*/

var callForOneShotCandidates = function(target) {
	if (!target.validTarget && target.owner.id != id) {
		return false;
	}

	var score = 0;

	for (var i = 0; i <= IA.MAX; i++) {
		score += target.t[i];
		
		if (score > 0) {
			score += Game.PLANET_GROWTH;
		} else {
			score -= Game.PLANET_GROWTH;
		}

		var myPlanets = _getAtExactRangeInTurn(i, target, IA.myPlanets);
		for (var index in myPlanets) {
			var myPlanet = myPlanets[index];
			
			if (myPlanet.id != target.id ) {
				var wanted = Math.abs(score);
				var fleet = getFleet(myPlanet, wanted + 1, getMax(target) + 1);
				if (fleet >= wanted) {
					target.distance += i;
					return true;
				}
			}
		}
		
	}

	return false;
}

var callForCandidates = function(target) {
	if (!target.validTarget && target.owner.id != id) {
		return false;
	}

	var score = 0;

	for (var i = 0; i <= IA.MAX; i++) {
		score += target.t[i];
		
		if (score > 0) {
			score += Game.PLANET_GROWTH;
		} else {
			score -= Game.PLANET_GROWTH;
		}

		var myPlanets = _getAtExactRangeInTurn(i, target, IA.myPlanets);
		for (var index in myPlanets) {
			var myPlanet = myPlanets[index];
			
			if (score <= 0 && myPlanet.id != target.id ) {
				var wanted = Math.abs(score);
				var fleet = getFleet(myPlanet, wanted + 1, getMax(target) + 1);
				if (fleet > 0) {
					score += fleet;
					target.distance += i;
				}
			}
		}
		
	}

	return score > 0;
}

/*
var callFoSnapbackFleet = function (target) {
	if (!target.validTarget && target.owner.id != id) {
		return [];
	}

	var orders = [];
	var score = 0;
	for (var i = 0; i <= target.decisiveTurn; i++) {
		score += target.t[i];
		
		if (score > 0) {
			score += Game.PLANET_GROWTH;
		} else {
			score -= Game.PLANET_GROWTH;
		}
	}
	
	var snapbackScore = score;
	var myPlanets = _getInRangeInTurn(target.decisiveTurn, target, IA.myPlanets);
	for (var index in myPlanets) {
		var myPlanet = myPlanets[index];
		
		if (snapbackScore <= 0 && myPlanet.id != target.id ) {
			var wanted = Math.abs(snapbackScore);
			var fleet = getFleet(myPlanet, wanted + 1, getMax(target) + 1);
			if (fleet >= wanted) {
				orders.push(new Order(myPlanet.id, target.id, fleet));
				target.t[i] += fleet;
				snapbackScore += fleet;
				takeFleet(myPlanet, fleet);
			}
		}
	}
	
	if (snapbackScore > 0) {
		target.validTarget = false;
		return orders;
	} else {
		target.snapback = false;
		resetOrders(orders);
		return [];
	}
	
	return [];
}
*/

var callForOneShotFleet = function(target) {
	if (!target.validTarget && target.owner.id != id) {
		return [];
	}
	
	var orders = [];

	var score = 0;

	for (var i = 0; i <= IA.MAX; i++) {
		score += target.t[i];
		
		if (score > 0) {
			score += Game.PLANET_GROWTH;
		} else {
			score -= Game.PLANET_GROWTH;
		}

		var myPlanets = _getInRangeInTurn(i, target, IA.myPlanets);
		for (var index in myPlanets) {
			var myPlanet = myPlanets[index];
			
			if (score <= 0 && myPlanet.id != target.id ) {
				var wanted = Math.abs(score);
				var fleet = getFleet(myPlanet, wanted + 1, getMax(target) + 1);
				if (fleet >= wanted) {
					orders.push(new Order(myPlanet.id, target.id, fleet));
					target.t[i] += fleet;
					score += fleet;
					takeFleet(myPlanet, fleet);
				}
			}
		}
		
	}

	if (score > 0) {
		target.validTarget = false;
		return orders;
	} else {
		target.os = false;
		resetOrders(orders);
		return [];
	}
}

var callForFleet = function(target) {
	if (!target.validTarget && target.owner.id != id) {
		return [];
	}
	
	var orders = [];

	var score = 0;

	for (var i = 0; i <= IA.MAX; i++) {
		score += target.t[i];
		
		if (score > 0) {
			score += Game.PLANET_GROWTH;
		} else {
			score -= Game.PLANET_GROWTH;
		}

		var myPlanets = _getAtExactRangeInTurn(i, target, IA.myPlanets);
		for (var index in myPlanets) {
			var myPlanet = myPlanets[index];
			
			if (score <= 0 && myPlanet.id != target.id ) {
				var wanted = Math.abs(score);
				var fleet = getFleet(myPlanet, wanted + 1, getMax(target) + 1);
				if (fleet > 0) {
					orders.push(new Order(myPlanet.id, target.id, fleet));
					target.t[i] += fleet;
					score += fleet;
					takeFleet(myPlanet, fleet);
				}
			}
		}
		
	}

	if (score > 0) {
		target.validTarget = false;
		return orders;
	} else {
		resetOrders(orders);
		return [];
	}
}

var computeOverflow = function(planet) {
	var nextPopulation = planet.capacity + Game.PLANET_GROWTH + planet.t[1];
	planet.overflow = nextPopulation - (getMax(planet) - Game.PLANET_GROWTH);
}

var isOverflowing = function(planet) {
	computeOverflow(planet);
	return planet.overflow > 0;
}

var manageOverflow = function(planet, destinations) {
	var orders = [];
	
	var target = getNearestPlanet(planet, destinations);
	if (target == undefined) {
		// Plus de places libres sur les planètes proches, on réparti partout pour limiter les pertes
		for (var index in IA.allPlanets) {
			var myPlanet = IA.allPlanets[index];
			if (myPlanet.id != planet.id) {
				var targetFleet = Math.ceil(myPlanet.overflow / (IA.myPlanets.length - 1));
				var fleet = getFleet(planet, targetFleet, targetFleet);
				if (fleet > 0) {
					orders.push(new Order(planet.id, myPlanet.id, fleet));
					takeFleet(planet, fleet);
				}
			}
		}
		IA.SCORING_COUNTDOWN = 5;
	} else {
		// ne renseigne pas les infos sur le delta pour une range, car il s'agit d'ordres de fin de tour.
		// Ces données seraient inexploitées par la suite.
		var fleet = getFleet(planet, planet.overflow, planet.overflow);
		if (fleet > 0) {
			orders.push(new Order(planet.id, target.id, fleet));
			takeFleet(planet, fleet);
		}
	}
	
	return orders;
}

var getFleet = function (planet, needed, max) {
	var send = planet.capacity;

	if (send > needed) {
		send = needed;
	}
	if (send > max) {
		send = max;
	}

	return send;
}

var getById = function(collection, id) {
	for (var index in collection) {
		var item = collection[index];
		if (item.id == id) {
			return item;
		}
	}
	return undefined;
}

var takeFleet = function (planet, fleet) {
	planet.capacity -= fleet;
	planet.population -= fleet;
	planet.overflow -= fleet;
	if (planet.overflow < 0) {
		planet.overflow = 0;
	}
}
var giveBackFleet = function (planet, fleet) {
	planet.capacity += fleet;
	planet.population += fleet;
}

var resetOrders = function (orders) {
	for (var index in orders) {
		var order = orders[index];
		
		var planet = getById(order.sourceID);
		giveBackFleet(planet, order.numUnits);
	}
}

var _getAtExactRangeInTurn = function ( wantedRangeInTurn, target, collection ) {
	var inRange = [];

	for (var index in collection) {
		var item = collection[index];
		var rangeInTurn = getRangeInTurn(target, item);
		if ( rangeInTurn == wantedRangeInTurn ) {
			inRange.push(item);
		}
	}
	
	return inRange;
}

var _getInRangeInTurn = function ( wantedRangeInTurn, target, collection ) {
	var inRange = [];

	for (var index in collection) {
		var item = collection[index];
		var rangeInTurn = getRangeInTurn(target, item);
		if ( rangeInTurn == wantedRangeInTurn ) {
			inRange.push(item);
		}
	}
	
	return inRange;
}

var getRangeInTurn = function (source, destination) {
	var distance = GameUtil.getDistanceBetween(source, destination);
	var rangeInTurn = Math.ceil(distance / Game.SHIP_SPEED);
	
	return rangeInTurn;
}

var getShipRangeInTurn = function (ship) {
	var arrivalTurn = ship.creationTurn + ship.travelDuration;
	return arrivalTurn - IA.TURN;
}

var getMax = function (planet) {
	return PlanetPopulation.getMaxPopulation(planet.size);
}

var getNeutrals = function (planets) {
	var neutrals = [];
	
	for (var index in planets) {
		var planet = planets[index];
		if (planet.id != IA.ENEMY_ID) {
			neutrals.push(planet);
		}
	}
	
	return neutrals;
}

var getNearestPlanet = function( source, candidats ) {
	if (candidats.length == 0) {
		return;
	}
	var result = candidats[ 0 ];
	var currentDist = GameUtil.getDistanceBetween( new Point( source.x, source.y ), new Point( result.x, result.y ) );
	for ( var i = 0; i<candidats.length; i++ ) {
		var element = candidats[ i ];
		if ( currentDist > GameUtil.getDistanceBetween( new Point( source.x, source.y ), new Point( element.x, element.y ) ) ) {
			currentDist = GameUtil.getDistanceBetween( new Point( source.x, source.y ), new Point( element.x, element.y ) );
			result = element;
		}
		
	}
	return result;
}

/**
 * @model Galaxy
 * @param width:Number largeur de la galaxy
 * @param height:Number hauteur de la galaxy
*/
var Galaxy = function(width,height) {
	// largeur
	this.width = width;
	// hauteur
	this.height = height;
	// contenu : liste Planet
	this.content = new Array();
	// flote : liste de Ship
	this.fleet = new Array();
};

/**
 * @model Range
 * @param from:Number début de l'intervale
 * @param to:Number fin de l'intervale
*/
var Range = function(from,to) {
	if(to == null) to = 1;
	if(from == null) from = 0;
	// début de l'intervale
	this.from = from;
	// fin de l'intervale
	this.to = to;
};

/**
 * @model Order
 * @param sourceID:Number id de la planete d'origine
 * @param targetID:Number id de la planete cible
 * @param numUnits:Number nombre d'unité à déplacer
*/
var Order = function(sourceID,targetID,numUnits) {
	// id de la planete d'origine
	this.sourceID = sourceID;
	// id de la planete cible
	this.targetID = targetID;
	// nombre d'unité à déplacer
	this.numUnits = numUnits;
};

/**
 * @model Planet
 * @param x:Number position en x
 * @param y:Number position en y
 * @param size:Number taille
 * @param owner:Player proprietaire
*/
var Planet = function(x,y,size,owner) {
	if(size == null) size = 2;
	if(y == null) y = 0;
	if(x == null) x = 0;
	// position en x
	this.x = x;
	// position en y
	this.y = y;
	// taille
	this.size = size;
	// proprietaire
	this.owner = owner;
	// population
	this.population = PlanetPopulation.getDefaultPopulation(size);
	// id
	this.id = UID.get();
};

/**
 * @model Ship
 * @param crew:Number equipage
 * @param source:Planet origine
 * @param target:Planet cible
 * @param creationTurn:Number numero du tour de creation du vaisseau
*/
var Ship = function(crew,source,target,creationTurn) {
	// equipage
	this.crew = crew;
	// planete d'origine
	this.source = source;
	// planete de destination
	this.target = target;
	// proprietaire du vaisseau
	this.owner = source.owner;
	// numero du tour de creation
	this.creationTurn = creationTurn;
	// duree du voyage en nombre de tour
	this.travelDuration = Math.ceil(GameUtil.getDistanceBetween(new Point(source.x,source.y),new Point(target.x,target.y)) / Game.SHIP_SPEED);
};

/**
 * @internal model
*/
var TurnMessage = function(playerId,galaxy) {
	this.playerId = playerId;
	this.galaxy = galaxy;
};

/**
 * @internal model
*/
var TurnResult = function(orders,message) {
	if(message == null) message = "";
	this.orders = orders;
	this.consoleMessage = message;
	this.error = "";
};

/**
 * @model Point
 * @param x:Number
 * @param y:Number
*/
var Point = function(x,y) {
	this.x = x;
	this.y = y;
};

/**
 * Classe utilitaire
*/
var GameUtil = {} ;
/**
 * @param p1:Point
 * @param p2:Point
 * @return result:Number la distance entre deux points
*/
GameUtil.getDistanceBetween = function(p1,p2) {
	return Math.sqrt(Math.pow(p2.x - p1.x,2) + Math.pow(p2.y - p1.y,2));
}
/**
 * @param planetOwnerId:Number
 * @param context:Galaxy
 * @return result:Array<Planet> la liste des planetes appartenants à un joueur en particulier
*/
GameUtil.getPlayerPlanets = function(planetOwnerId,context) {
	var result = new Array();
	var _g1 = 0, _g = context.content.length;
	while(_g1 < _g) {
		var i = _g1++;
		var p = context.content[i];
		if(p.owner.id == planetOwnerId) result.push(p);
	}
	return result;
}

/**
 * @param planetOwnerId:Number
 * @param context:Galaxy
 * @return result:Array<Planet> la liste des planetes ennemies et neutres
*/
GameUtil.getEnnemyPlanets = function(planetOwnerId,context) {
	var result = new Array();
	var _g1 = 0, _g = context.content.length;
	while(_g1 < _g) {
		var i = _g1++;
		var p = context.content[i];
		if(p.owner.id != planetOwnerId) result.push(p);
	}
	return result;
}

/**
 * Classe utilitaire
 * @internal
*/
var UID = {};
UID.lastUID = 0;
UID.get = function()
{
	UID.lastUID++;
	return UID.lastUID;
}

/**
 * Constantes
*/
var Game = {};
Game.DEFAULT_PLAYER_POPULATION = 100;
Game.NUM_PLANET = new Range(5,10);
Game.PLANET_GROWTH = 5;
Game.SHIP_SPEED = 60;
Game.GAME_SPEED = 500;
Game.GAME_DURATION = 240;
Game.GAME_MAX_NUM_TURN = 500;

var PlanetPopulation = {};
PlanetPopulation.DEFAULT_SMALL = 20;
PlanetPopulation.DEFAULT_NORMAL = 30;
PlanetPopulation.DEFAULT_BIG = 40;
PlanetPopulation.DEFAULT_HUGE = 50;
PlanetPopulation.MAX_SMALL = 50;
PlanetPopulation.MAX_NORMAL = 100;
PlanetPopulation.MAX_BIG = 200;
PlanetPopulation.MAX_HUGE = 300;
PlanetPopulation.getMaxPopulation = function(planetSize) {
	var result = 1;
	switch(planetSize) {
		case PlanetSize.SMALL:
			result = PlanetPopulation.MAX_SMALL;
			break;
		case PlanetSize.NORMAL:
			result = PlanetPopulation.MAX_NORMAL;
			break;
		case PlanetSize.BIG:
			result = PlanetPopulation.MAX_BIG;
			break;
		case PlanetSize.HUGE:
			result = PlanetPopulation.MAX_HUGE;
			break;
		}
	return result;
}
PlanetPopulation.getDefaultPopulation = function(planetSize) {
	var result = 1;
	switch(planetSize) {
		case PlanetSize.SMALL:
			result = PlanetPopulation.DEFAULT_SMALL;
			break;
		case PlanetSize.NORMAL:
			result = PlanetPopulation.DEFAULT_NORMAL;
			break;
		case PlanetSize.BIG:
			result = PlanetPopulation.DEFAULT_BIG;
			break;
		case PlanetSize.HUGE:
			result = PlanetPopulation.DEFAULT_HUGE;
			break;
	}
	return result;
}


var PlanetSize = {};
PlanetSize.SMALL = 1;
PlanetSize.NORMAL = 2;
PlanetSize.BIG = 3;
PlanetSize.HUGE = 4;
