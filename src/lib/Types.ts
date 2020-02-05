// Copyright 2020 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not 
// use this file except in compliance with the License. You may obtain a copy 
// of the license at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software 
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT 
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the 
// License for the specific language governing permissions and limitations 
// under the License.


import { Turret } from "./turrets/Turret";

export type Callback = {
    func: Function;
    scope: any
};

export type MapObject = {
    name: string,
    size: { r: number, c: number },
    path: { r: number, c: number }[],
    plateaus: { r: number, c: number }[]
};

export type GameConfig = {
    timeStep: number;
    runningInClientSide: boolean;
    enemySpawningDeltaTicks: number;
    credits: number;
    lifes: number;
    boardSize: { r: number, c: number };
    enemiesPathCells: { r: number, c: number }[];
    plateausCells: { r: number, c: number }[];
};

export type WaveConfig = {
    enemies: { "type": string, "t": number }[];
};

export type EngineReturn = {
    success: boolean;
    turret?: Turret;
    error?: { type: string, info?: any };
};

export type Action = {
    type: string,
    tick: number,
    turretType?: string,
    id?: number,
    position?: { r: number, c: number }
};

export type EnemyNames = "soldier" | "runner" | "healer" | "blob" | "flier";
export type EnemyAttributes = {
    life: number,
    speed: number,
    value: number
};

export type TurretNames = "projectile" | "laser" | "launch" | "glue";
export type TurretAttributes = {
    price: number
}

export type WaveAttributes = {
    waveReward: number,
    extend: number,
    maxExtend: number,
    enemies: { type: string, t: number }[]
}

export type LevelObject = {
    engineVersion: string,
    gameConfig: GameConfig,
    enemiesData: Record<EnemyNames, EnemyAttributes>,
    turretsData: Record<TurretNames, TurretAttributes>,
    wavesData: WaveAttributes[]
};

export type LogsObject = {
    actions: Action[]
};

export type GameData = {
    soundMuted: boolean,
    musicMuted: boolean,
    scores: number[],
    currentMapIndex: number
};
