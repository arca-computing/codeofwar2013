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
var id = 0;

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
IA.START_PREDICTION_TURN_COUNT = 1;
IA.PREDICTION_TURN_COUNT = 10;

function compareScore(a,b) {
	if (a.predictions[IA.PREDICTION_TURN_COUNT].score < b.predictions[IA.PREDICTION_TURN_COUNT].score) {
		return 1;
	}
	if (a.predictions[IA.PREDICTION_TURN_COUNT].score > b.predictions[IA.PREDICTION_TURN_COUNT].score) {
		return -1;
	}
	return 0;
}

/**
 * Invoquée tous les tours pour recuperer la liste des ordres à exécuter.
 * C'est la methode à modifier pour cabler son IA.
 * @param context:Galaxy
 * @return result:Array<Order>
*/
var getOrders = function(context) {
	var result = new Array();

	IA.galaxy = context;
	IA.allPlanets = context.content;
	IA.myPlanets = GameUtil.getPlayerPlanets(id, context );
	IA.otherPlanets = GameUtil.getEnnemyPlanets(id, context);
	initShips();
	IA.aggressiveId = getAggressiveId();
	IA.aggressivesPlanets = getAggressivePlanets();
	
	improveModel();
	
	// TODO: scoring et ordres de défenses (gestion de capacité de flotte pour gérer les attaques ensuite)
	
	for ( var predictionTurn = IA.START_PREDICTION_TURN_COUNT; predictionTurn <= IA.PREDICTION_TURN_COUNT; predictionTurn++) {
		var planetsInRange = getTargetsAtRangeInTurn( predictionTurn );
		scorePlanetsForTurn( predictionTurn, planetsInRange );
	}
	
	IA.aggressivesPlanets.sort(compareScore);
	
	if (IA.aggressivesPlanets.length > 0) {
		var target = getFirstCaptured(IA.aggressivesPlanets);
		result = result.concat(attackOrders(target));
	}
	
	return result;
};

var getAggressiveId = function() {
	if (IA.otherShips.length > 0) {
		return IA.otherShips[0].owner.id;
	}

	var aggressiveId = IA.otherPlanets[0];
	var neutralId = IA.otherPlanets[0];
	
	for (var index in IA.otherPlanets) {
		var planet = IA.otherPlanets[index];
		
		if (planet.id != IA.otherPlanets[0].id) {
			if (planet.owner.id != neutralId) {
				aggressiveId = planet.owner.id;
			} else if (planet.owner.id == aggressiveId) {
				var tmp = aggressiveId;
				aggressiveId = neutralId;
				neutralId = tmpl;
			}
		}
	}
	
	return aggressiveId;
}

var getAggressivePlanets = function() {
	var aggressivePlanets = [];

	for (var index in IA.otherPlanets) {
		var planet = IA.otherPlanets[index];
		
		if (planet.owner.id == IA.aggressiveId) {
			aggressivePlanets.push(planet);
		}
	}
	
	if (aggressivePlanets.length == 0) {
		return IA.otherPlanets;
	}
	
	return aggressivePlanets;
}

var getFirstCaptured = function (targets) {
	for ( var predictionTurn = IA.START_PREDICTION_TURN_COUNT; predictionTurn <= IA.PREDICTION_TURN_COUNT; predictionTurn++) {
		for (var index in targets) {
			var current = targets[index];
			if(current.predictions[predictionTurn].score > 0) {
				return current;
			}
		}
	}
	
	return targets[0];
}

var attackOrders = function(target) {
	var orders = [];
	
	// TODO: identifier le tour de capture et commencer par les planètes à cette portée, puis diminuer la portée -> évite les dépassements de population.
	/*
	var captureTurn = getCaptureTurn(target);
	target.population += captureTurn * Game.PLANET_GROWTH;
	
	for ( var predictionTurn = captureTurn; predictionTurn >= IA.START_PREDICTION_TURN_COUNT; predictionTurn--) {
	*/
		
	
	for ( var predictionTurn = IA.START_PREDICTION_TURN_COUNT; predictionTurn <= IA.PREDICTION_TURN_COUNT; predictionTurn++) {
		target.population += Game.PLANET_GROWTH;
	
		var myPlanetsInRange = getAllyPlanetsAtRangeInTurnForPlanet(predictionTurn, target);
		for (var index in myPlanetsInRange) {
			var myPlanet = myPlanetsInRange[index];
			
			var fleet = getAvailableFleet(myPlanet, target.population + 1);
			if (fleet > 0) {
				orders.push(new Order( myPlanet.id, target.id, fleet));
				takeFleet(myPlanet, fleet);
				target.population -= fleet;
			}
			
			if (target.population < 0) {
				return orders;
			}
		}
	}
	
	return [];
}

var improveModel = function () {
	var planets = IA.allPlanets;
	for (var index in planets) {
		var planet = planets[index];
		planet.capacity = planet.population;
		planet.predictions = [];
		for ( var predictionTurn = IA.START_PREDICTION_TURN_COUNT; predictionTurn <= IA.PREDICTION_TURN_COUNT; predictionTurn++) {
			planet.predictions[predictionTurn] = {};
			planet.predictions[predictionTurn].score = 0;
			planet.predictions[predictionTurn].capture = false;
		}
	}
}

var getAvailableFleet = function (planet, max) {
	if (planet.capacity > max) {
		return max;
	}
	return planet.capacity;
}

var takeFleet = function (planet, fleet) {
	planet.capacity -= fleet;
	planet.population -= fleet;
}

var getCaptureTurn = function(planet) {
	for ( var predictionTurn = IA.START_PREDICTION_TURN_COUNT; predictionTurn <= IA.PREDICTION_TURN_COUNT; predictionTurn++) {
		if (planet.predictions[predictionTurn].capture) {
			return predictionTurn;
		}
	}
	return IA.PREDICTION_TURN_COUNT;
}

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

var scorePlanetsForTurn = function( predictionTurn, planetsInRange) {
	for (var index in planetsInRange) {
		var planet = planetsInRange[index];
		
		var score = getAllPlanetsFleetCapacityInRange(predictionTurn, planet);
		score += getAllIncomingAllyFleetInRange(predictionTurn, planet);

		if (predictionTurn > IA.START_PREDICTION_TURN_COUNT && planet.predictions[predictionTurn - 1].score > 0) {
			score += planet.population;
			score += predictionTurn * Game.PLANET_GROWTH;
		} else {
			score -= planet.population;
			score -= predictionTurn * Game.PLANET_GROWTH;
		}
		
		if (planet.owner.id == IA.aggressiveId) {
			score -= getAllAggressivePlanetsFleetInRange(predictionTurn, planet);
			score -= getAllIncomingAggressiveFleetInRange(predictionTurn, planet);
		} else {
			score += getAllIncomingAggressiveFleetInRange(predictionTurn, planet);
		}

		planet.predictions[predictionTurn].score = score;
		if (score > 0) {
			planet.predictions[predictionTurn].capture = true;
		}
	}
}

var getAllPlanetsFleetCapacityInRange = function( predictionTurn, planet) {
	var fleet = 0;
	
	var myPlanetsInRange = getAllyPlanetsAtRangeInTurnForPlanet(predictionTurn, planet);
	
	for (var index in myPlanetsInRange) {
		var myPlanet = myPlanetsInRange[index];
		fleet += myPlanet.population + predictionTurn * Game.PLANET_GROWTH;
	}
	
	return fleet;
}

var getAllIncomingAllyFleetInRange = function( predictionTurn, planet) {
	var fleet = 0;
	
	var myShips = _getShipsAtRangeInTurnForPlanet(predictionTurn, planet, IA.myShips);
	for (var index in myShips) {
		var myShip = myShips[index];
		if (myShip.target == planet) {
			fleet += myShip.crew;
		}
	}
	
	return fleet;
}
var getAllAggressivePlanetsFleetInRange = function( predictionTurn, planet) {
	/*
	var fleet = 0;
	
	var aggressivePlanetsInRange = getAggressivesPlanetsAtRangeInTurnForPlanet(predictionTurn, planet);
	
	for (var index in aggressivePlanetsInRange) {
		var myPlanet = aggressivePlanetsInRange[index];
		fleet += myPlanet.population + predictionTurn * Game.PLANET_GROWTH;
	}
	
	return fleet;
	*/
	return 0;
}
var getAllIncomingAggressiveFleetInRange = function( predictionTurn, planet) {
	var fleet = 0;
	
	var otherShips = _getShipsAtRangeInTurnForPlanet(predictionTurn, planet, IA.otherShips);
	for (var index in otherShips) {
		var otherShip = otherShips[index];
		if (otherShip.target == planet) {
			fleet += otherShip.crew;
		}
	}
	
	return fleet;
}

var getTargetsAtRangeInTurn = function ( wantedRangeInTurn ) {
	var planetsInRange = [];

	var myPlanets = IA.myPlanets;
	for (var index in myPlanets) {
		var myPlanet = myPlanets[index];
		var others = getAggressivesPlanetsAtRangeInTurnForPlanet(wantedRangeInTurn, myPlanet);
		planetsInRange = planetsInRange.concat(others);
	}

	return planetsInRange;
}

var getAllyPlanetsAtRangeInTurnForPlanet = function ( wantedRangeInTurn, planet ) {
	return _getPlanetsAtRangeInTurnForPlanet(wantedRangeInTurn, planet, IA.myPlanets);
}
var getAggressivesPlanetsAtRangeInTurnForPlanet = function ( wantedRangeInTurn, planet ) {
	return _getPlanetsAtRangeInTurnForPlanet(wantedRangeInTurn, planet, IA.aggressivesPlanets);
}
var getPlanetsAtRangeInTurnForPlanet = function ( wantedRangeInTurn, planet ) {
	return _getPlanetsAtRangeInTurnForPlanet(wantedRangeInTurn, planet, IA.otherPlanets);
}

var _getPlanetsAtRangeInTurnForPlanet = function ( wantedRangeInTurn, planet, otherPlanets ) {
	var planetsInRange = [];

	for (var otherIndex in otherPlanets) {
		var otherPlanet = otherPlanets[otherIndex];
		var rangeInTurn = getRangeInTurn(planet, otherPlanet);
		if ( rangeInTurn <= wantedRangeInTurn ) {
			planetsInRange.push(otherPlanet);
		}
	}
	
	return planetsInRange;
}

var _getShipsAtRangeInTurnForPlanet = function ( wantedRangeInTurn, planet, ships ) {
	var shipsInRange = [];

	for (var index in ships) {
		var ship = ships[index];
		var rangeInTurn = getRangeInTurn(planet, ship);
		if ( rangeInTurn <= wantedRangeInTurn ) {
			shipsInRange.push(ship);
		}
	}
	
	return shipsInRange;
}

var getRangeInTurn = function (source, destination) {
	var distance = GameUtil.getDistanceBetween(source, destination);
	var rangeInTurn = distance / Game.SHIP_SPEED;
	
	return rangeInTurn;
}

var getNearestPlanet = function( source, candidats )
	{
		var result = candidats[ 0 ];
		var currentDist = GameUtil.getDistanceBetween( new Point( source.x, source.y ), new Point( result.x, result.y ) );
		for ( var i = 0; i<candidats.length; i++ )
		{
			var element = candidats[ i ];
			if ( currentDist > GameUtil.getDistanceBetween( new Point( source.x, source.y ), new Point( element.x, element.y ) ) )
			{
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

