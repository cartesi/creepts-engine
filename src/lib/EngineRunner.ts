// Copyright 2020 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not 
// use this file except in compliance with the License. You may obtain a copy 
// of the license at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software 
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT 
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the 
// License for the specific language governing permissions and limitations 
// under the License.


import { LevelObject, LogsObject, EngineReturn } from "./Types";
import { GameConstants } from "./GameConstants";
import { Engine } from "./Engine";

export interface ProgressInformation {
    timestamp: Date;
    ticksCounter: number;
    lastActionTick: number;
    score: number;
    lifes: number;
    round: number;
    credits: number;
}

export class EngineRunner {

    private level: LevelObject;

    constructor(level: LevelObject) {
        this.level = level;
        this.level.gameConfig.runningInClientSide = false;
    }

    private errorMessage(type: string, info?: any) {
        switch(type) {
            case GameConstants.ERROR_VERSION_MISMATCH:
                return "Version mismatch. Engine Version: " + info.engineVersion + ". Logs Version: " + info.logsVersion + ".";
            case GameConstants.ERROR_NO_GAME_OVER:
                return "All actions have been executed without reaching game over.";
            case GameConstants.ERROR_TICKS:
                return "Ticks have to be greater or equal than the tick of the previous action.";
            case GameConstants.ERROR_ACTION_ARRAY:
                return "Actions array is empty or null.";
            case GameConstants.ERROR_ACTION_TYPE:
                return "Missing or wrong action type '" + info + "'.";
            case GameConstants.ERROR_ACTION_VALUE:
                return "Missing or wrong value for action.";
            case GameConstants.ERROR_TURRET:
                return "Turret '" + info.id + "' does not exist.";
            case GameConstants.ERROR_CREDITS:
                return "Not enough credits.";
            case GameConstants.ERROR_NEXT_WAVE:
                return "Wave launched before 40 ticks.";
            case GameConstants.ERROR_ADD_TURRET_POSITION:
                return "Invalid position for adding turret.";
            case GameConstants.ERROR_ADD_TURRET_NAME:
                return "Wrong turret type name '" + info.name + "'.";
            case GameConstants.ERROR_UPGRADE:
                return "Can't upgrade the turret '" + info.id + "' with max grade.";
            case GameConstants.ERROR_LEVEL_UP:
                return "Can't level up the turret '" + info.id + "' with max level.";
            default:
                return "Unexpected error";
        }
    }
    
    public run(logs: LogsObject, progressCallback?: (progress: ProgressInformation) => void): number {

        const engine = new Engine(this.level.gameConfig, this.level.enemiesData, this.level.turretsData, this.level.wavesData);

        if (this.level.engineVersion !== engine.version) {
            throw new Error(this.errorMessage(GameConstants.ERROR_VERSION_MISMATCH, {logsVersion: this.level.engineVersion, engineVersion: engine.version}));
        }
    
        if (!logs.actions || logs.actions.length === 0) {
            throw new Error(this.errorMessage(GameConstants.ERROR_ACTION_ARRAY));
        }
    
        // return progress information every progressIncrement ticks
        const progressIncrement = 100;
    
        // tick of last user action (may not be last tick of simulation)
        const lastActionTick = logs.actions[logs.actions.length - 1].tick;
        
        for (var i = 0; i < logs.actions.length; i++) {
    
            var action = logs.actions[i];
            let result: EngineReturn = { success: true };
    
            if (typeof action.tick !== "number" || action.tick < engine.ticksCounter) {
                throw new Error(this.errorMessage(GameConstants.ERROR_TICKS));
            }
    
            while (engine.ticksCounter < action.tick && engine.lifes > 0) {
                engine.update();
    
                if (typeof(progressCallback) === 'function' && (engine.ticksCounter % progressIncrement == 0)) {
                    progressCallback({
                        timestamp: new Date(),
                        ticksCounter: engine.ticksCounter,
                        lastActionTick: lastActionTick,
                        score: engine.score,
                        lifes: engine.lifes,
                        round: engine.round,
                        credits: engine.credits
                    });
                }
            }
    
            switch (action.type) {
                case GameConstants.ACTION_TYPE_NEXT_WAVE:
                    if (!engine.newWave()) result.error = { type: GameConstants.ERROR_NEXT_WAVE };
                    break;
                case GameConstants.ACTION_TYPE_ADD_TURRET:
                    result = engine.addTurret(action.turretType, action.position);
                    break;
                case GameConstants.ACTION_TYPE_SELL_TURRET:
                    result = engine.sellTurret(action.id);
                    break;
                case GameConstants.ACTION_TYPE_UPGRADE_TURRET:
                    result = engine.upgradeTurret(action.id);
                    break;
                case GameConstants.ACTION_TYPE_LEVEL_UP_TURRET:
                    result = engine.improveTurret(action.id);
                    break;
                case GameConstants.ACTION_TYPE_CHANGE_STRATEGY_TURRET:
                    result = engine.setNextStrategy(action.id);
                    break;
                case GameConstants.ACTION_TYPE_CHANGE_FIXED_TARGET_TURRET:
                    result = engine.setFixedTarget(action.id);
                    break;
                default:
                    result = { error: { type: GameConstants.ERROR_ACTION_TYPE, info: action.type}, success: false };
                    break;
            }
    
            if (result.error) throw new Error(this.errorMessage(result.error.type, result.error.info));
            if (engine.lifes <= 0) break;
        }
    
        while (engine.waveActivated && engine.lifes > 0) {
            // all actions are processed, run until we die
            engine.update();
        }
    
        if (engine.lifes > 0) {
            throw new Error(this.errorMessage(GameConstants.ERROR_NO_GAME_OVER));
        }
    
        // return score and exit normally
        return engine.score;
    }
}
