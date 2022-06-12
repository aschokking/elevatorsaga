const codeObj = {
    init: function(elevators, floors) {
        function minBy(array, iteratee) {
            let result
            if (array == null) {
                return result
            }
            let computed
            for (const value of array) {
                const current = iteratee(value)

                if (current != null && (computed === undefined
                                        ? (current === current)
                                        : (current < computed)
                                       )) {
                    computed = current
                    result = value
                }
            }
            return result
        }
        
        const waitingAtFloors = elevators.map(() => new Set());
        //const waitingAtFloors = new Set();
        elevators.forEach((elevator, elevatorIndex) => {
			const floorSet = waitingAtFloors[elevatorIndex];

            function onIdle() {
                // let's go to all the floors (or did we forget one?)
                const pressedFloors = elevator.getPressedFloors();

                if (floorSet.size > 0) {
                    // TODO: pick closest floor
                    const newFloor = minBy(floorSet.values(), floorNum => Math.abs(floorNum - elevator.currentFloor()));
                    elevator.goToFloor(newFloor);
                    floorSet.delete(newFloor);
                } else {
                    //debugger;
                }
            }

            // Whenever the elevator is idle (has no more queued destinations) ...
            elevator.on("idle", function () {
                onIdle();

            });
            
            elevator.on("floor_button_pressed", function (floorNum) {
				elevator.goToFloor(floorNum);
                // if(elevator.loadFactor() > 0.5) {
                // 	elevator.goToFloor(floorNum);
				// } else {
				// 	floorSet.add(floorNum);
				// }
            })


            elevator.on("stopped_at_floor", function (floorNum) {
                waitingAtFloors.forEach(floorSet => {
                    floorSet.delete(floorNum);
                });
            });
            
            elevator.on("passing_floor", function (floorNum) {
                // if we're supposed to stop at this floor at some point, do so now
                const pressedFloors = elevator.getPressedFloors();
                if(pressedFloors.indexOf(floorNum) >= 0 && elevator.loadFactor() < 1) {
                    elevator.goToFloor(floorNum, true);
                }
                
				// if there's someone waiting on this floor in the direction we're going, also stop
				// const floor = floors[floorNum];

            });
        });


        floors.forEach(floor => {
            const floorNum = floor.floorNum();

            function closestElevatorIndex() {
                let closestDistance = 100000;
                let closestIndex = -1;
                elevators.forEach((elevator, index) => {
                    const distance = Math.abs(elevator.currentFloor() - floorNum) + elevator.destinationQueue.length;
                    if(distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = index;
                    }
                });

                return closestIndex;
            }

            function onElevatorCalled() {
                const elevatorIndex = closestElevatorIndex(floorNum);
                const floorSet = waitingAtFloors[elevatorIndex];
                floorSet.add(floorNum);
                const elevator = elevators[elevatorIndex];
                if(elevator.destinationQueue.length === 0) {
                    elevator.destinationQueue.push(floorNum);
                    elevator.checkDestinationQueue();
                }
            }

            floor.on("up_button_pressed", function () {
                onElevatorCalled(); 
            });
            floor.on("down_button_pressed", function () {
                onElevatorCalled(); 
            });

        });
    },
        update: function(dt, elevators, floors) {
            elevators.forEach((elevator, i) => {
                console.log(`${i}: ${elevator.destinationQueue}`);
            })
            // We normally don't need to do anything here
        }
};

var createParamsUrl = function(current, overrides) {
    return "#" + _.map(_.merge(current, overrides), function(val, key) {
        return key + "=" + val;
    }).join(",");
};



$(function() {
    var tsKey = "elevatorTimeScale";

    var params = {};

    var $world = $(".innerworld");
    var $stats = $(".statscontainer");
    var $feedback = $(".feedbackcontainer");
    var $challenge = $(".challenge");
    var $codestatus = $(".codestatus");

    var floorTempl = document.getElementById("floor-template").innerHTML.trim();
    var elevatorTempl = document.getElementById("elevator-template").innerHTML.trim();
    var elevatorButtonTempl = document.getElementById("elevatorbutton-template").innerHTML.trim();
    var userTempl = document.getElementById("user-template").innerHTML.trim();
    var challengeTempl = document.getElementById("challenge-template").innerHTML.trim();
    var feedbackTempl = document.getElementById("feedback-template").innerHTML.trim();
    var codeStatusTempl = document.getElementById("codestatus-template").innerHTML.trim();

    var app = riot.observable({});
    app.worldController = createWorldController(1.0 / 60.0);
    app.worldController.on("usercode_error", function(e) {
        console.log("World raised code error", e);
    });

    console.log(app.worldController);
    app.worldCreator = createWorldCreator();
    app.world = undefined;

    app.currentChallengeIndex = 0;

    app.startStopOrRestart = function() {
        if(app.world.challengeEnded) {
            app.startChallenge(app.currentChallengeIndex);
        } else {
            app.worldController.setPaused(!app.worldController.isPaused);
        }
    };

    app.startChallenge = function(challengeIndex, autoStart) {
        if(typeof app.world !== "undefined") {
            app.world.unWind();
            // TODO: Investigate if memory leaks happen here
        }
        app.currentChallengeIndex = challengeIndex;
        app.world = app.worldCreator.createWorld(challenges[challengeIndex].options);
        window.world = app.world;

        clearAll([$world, $feedback]);
        presentStats($stats, app.world);
        presentChallenge($challenge, challenges[challengeIndex], app, app.world, app.worldController, challengeIndex + 1, challengeTempl);
        presentWorld($world, app.world, floorTempl, elevatorTempl, elevatorButtonTempl, userTempl);

        app.worldController.on("timescale_changed", function() {
            localStorage.setItem(tsKey, app.worldController.timeScale);
            presentChallenge($challenge, challenges[challengeIndex], app, app.world, app.worldController, challengeIndex + 1, challengeTempl);
        });

        app.world.on("stats_changed", function() {
            var challengeStatus = challenges[challengeIndex].condition.evaluate(app.world);
            if(challengeStatus !== null) {
                app.world.challengeEnded = true;
                app.worldController.setPaused(true);
                if(challengeStatus) {
                    presentFeedback($feedback, feedbackTempl, app.world, "Success!", "Challenge completed", createParamsUrl(params, { challenge: (challengeIndex + 2)}));
                } else {
                    presentFeedback($feedback, feedbackTempl, app.world, "Challenge failed", "Maybe your program needs an improvement?", "");
                }
            }
        });

        console.log("Starting...");
        app.worldController.start(app.world, codeObj, window.requestAnimationFrame, autoStart);
    };

    riot.route(function(path) {
        params = _.reduce(path.split(","), function(result, p) {
            var match = p.match(/(\w+)=(\w+$)/);
            if(match) { result[match[1]] = match[2]; } return result;
        }, {});
        var requestedChallenge = 0;
        var autoStart = false;
        var timeScale = parseFloat(localStorage.getItem(tsKey)) || 2.0;
        _.each(params, function(val, key) {
            if(key === "challenge") {
                requestedChallenge = _.parseInt(val) - 1;
                if(requestedChallenge < 0 || requestedChallenge >= challenges.length) {
                    console.log("Invalid challenge index", requestedChallenge);
                    console.log("Defaulting to first challenge");
                    requestedChallenge = 0;
                }
            } else if(key === "autostart") {
                autoStart = val === "false" ? false : true;
            } else if(key === "timescale") {
                timeScale = parseFloat(val);
            } else if(key === "devtest") {
                editor.setDevTestCode();
            } else if(key === "fullscreen") {
                makeDemoFullscreen();
            }
        });
        app.worldController.setTimeScale(timeScale);
        app.startChallenge(requestedChallenge, autoStart);
    });
});
