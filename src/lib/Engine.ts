// Copyright 2020 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy
// of the license at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

import { GameConstants } from './GameConstants';
import { MathUtils } from './utils/MathUtils';
import { Enemy } from './enemies';
import {
    Bullet,
    Glue,
    GlueBullet,
    GlueTurret,
    LaserTurret,
    LaunchTurret,
    Mine,
    Mortar,
    ProjectileTurret,
    Turret
} from './turrets';
import { EnemiesSpawner } from './EnemiesSpawner';
import { Event, EventDispatcher } from './events';
import * as Types from './Types';

export class Engine {
    public waveActivated: boolean;
    public turrets: Turret[];
    public enemySpawningDeltaTicks: number;
    public lastWaveTick: number;
    public enemyData: Record<string, Types.EnemyAttributes>;
    public turretData: Record<string, Types.TurretAttributes>;
    public turretsAttributes: any;
    public wavesData: Types.WaveAttributes[];
    public waveEnemies: { type: string; t: number }[];
    public waveReward: number;
    public remainingReward: number;
    public enemies: Enemy[];
    public enemiesPathCells: { r: number; c: number }[];
    public plateausCells: { r: number; c: number }[];
    public turretId: number;
    public enemyId: number;
    public bulletId: number;
    public mortarId: number;
    public glueId: number;
    public mineId: number;
    public waveDefaultHealth: number;
    public enemyHealthModifier: number;
    public enemyRewardModifier: number;
    public boardSize: { r: number; c: number };

    private runningInClientSide: boolean;
    private _version: string;
    private _credits: number;
    private _creditsEarned: number;
    private _score: number;
    private _lifes: number;
    private _timeStep: number;
    private _gameOver: boolean;
    private _round: number;
    private _ticksCounter: number;
    private _bonus: number;
    private _noEnemiesOnStage: boolean;

    private bullets: Bullet[];
    private glueBullets: GlueBullet[];
    private mortars: Mortar[];
    private mines: Mine[];
    private glues: Glue[];
    private bulletsColliding: Bullet[];
    private glueBulletsColliding: GlueBullet[];
    private mortarsImpacting: Mortar[];
    private minesImpacting: Mine[];
    private consumedGlues: Glue[];
    private teleportedEnemies: { enemy: Enemy; glueTurret: GlueTurret }[];
    private t: number;
    private eventDispatcher: EventDispatcher;
    private enemiesSpawner: EnemiesSpawner;
    private waveEnemiesLength: number;
    private enemiesSpawned: number;
    private allEnemiesSpawned: boolean;
    private canLaunchNextWave: boolean;

    constructor(
        gameConfig: Types.GameConfig,
        enemyData: Record<string, Types.EnemyAttributes>,
        turretData: Record<string, Types.TurretAttributes>,
        wavesData: Types.WaveAttributes[]
    ) {
        this._version = GameConstants.VERSION;

        this.turretId = 0;
        this.enemyId = 0;
        this.bulletId = 0;
        this.mortarId = 0;
        this.glueId = 0;
        this.mineId = 0;

        this.enemySpawningDeltaTicks = gameConfig.enemySpawningDeltaTicks;
        this.runningInClientSide = gameConfig.runningInClientSide;
        this.boardSize = gameConfig.boardSize;
        this._credits = gameConfig.credits;
        this._lifes = gameConfig.lifes;
        this._timeStep = gameConfig.timeStep;

        this.enemiesPathCells = gameConfig.enemiesPathCells;
        this.plateausCells = gameConfig.plateausCells;

        this.enemyData = enemyData;
        this.turretData = turretData;
        this.wavesData = wavesData;

        this.generateTurretsAttributes();

        this._score = 0;
        this._gameOver = false;
        this._round = 0;
        this._bonus = 0;

        this._creditsEarned = 0;
        this.enemyHealthModifier = 1;
        this.enemyRewardModifier = 1;

        this.waveActivated = false;
        this.t = 0;

        this.eventDispatcher = new EventDispatcher();
        this.enemiesSpawner = new EnemiesSpawner(this);

        this._ticksCounter = 0;
        this.lastWaveTick = 0;

        this.turrets = [];
        this.mines = [];
        this.minesImpacting = [];
        this.waveEnemies = [];

        this.canLaunchNextWave = true;

        this.initWaveVars();
        this._noEnemiesOnStage = true;
        this.allEnemiesSpawned = false;
        this.enemiesSpawned = 0;
        this.waveEnemiesLength = 0;

        this.remainingReward = 0;
    }

    public initWaveVars(): void {
        this.t = Date.now();

        this.enemies = [];

        this.bullets = [];
        this.glueBullets = [];
        this.mortars = [];
        this.glues = [];

        this.bulletsColliding = [];
        this.glueBulletsColliding = [];
        this.mortarsImpacting = [];
        this.consumedGlues = [];
        this.teleportedEnemies = [];
    }

    public update(): void {
        if (this.runningInClientSide) {
            // frame rating control
            // XXX: this should be outside the engine
            // XXX: runningInClientSide variable should not even exist
            const t = Date.now();

            if (t - this.t < this._timeStep) {
                return;
            }

            this.t = t;
        }

        if (this._lifes <= 0 && !this._gameOver) {
            this.eventDispatcher.dispatchEvent(new Event(Event.GAME_OVER));
            this._gameOver = true;
        }

        if (
            this._noEnemiesOnStage &&
            this.allEnemiesSpawned &&
            this.bullets.length === 0 &&
            this.glueBullets.length === 0 &&
            this.glues.length === 0 &&
            this.mortars.length === 0
        ) {
            this.waveActivated = false;
            this.ageTurrets();

            if (this._lifes > 0) {
                this.eventDispatcher.dispatchEvent(new Event(Event.WAVE_OVER));
            }
        }

        if (
            this.ticksCounter - this.lastWaveTick >=
                GameConstants.INITIAL_TICKS_WAVE *
                    this.enemySpawningDeltaTicks &&
            !this.canLaunchNextWave
        ) {
            this.canLaunchNextWave = true;
            this.eventDispatcher.dispatchEvent(
                new Event(Event.ACTIVE_NEXT_WAVE)
            );
        }

        if (this.waveActivated) {
            this.removeProjectilesAndAccountDamage();
        }

        this.teleport();

        this.checkCollisions();
        this.spawnEnemies();

        this.enemies.forEach(function(enemy) {
            enemy.update();
        }, this);

        this.turrets.forEach(function(turret) {
            turret.update();
        });

        this.bullets.forEach(function(bullet) {
            bullet.update();
        });

        this.glueBullets.forEach(function(bullet) {
            bullet.update();
        });

        this.mortars.forEach(function(mortars) {
            mortars.update();
        });

        this.mines.forEach(function(mine) {
            mine.update();
        });

        this.glues.forEach(function(glue) {
            glue.update();
        });

        this._ticksCounter++;
    }

    public newWave(): boolean {
        if (!this.canLaunchNextWave) {
            return false;
        }

        this._credits += this._bonus;
        this._creditsEarned += this._bonus;

        this.canLaunchNextWave = false;

        this._noEnemiesOnStage = false;
        this.allEnemiesSpawned = false;

        const length = this.wavesData.length;
        const waveData = this.wavesData[this._round % length];

        const initialWaveEnemies = waveData.enemies.slice(0);

        let newWaveEnemies = JSON.parse(JSON.stringify(initialWaveEnemies));

        const extend = Math.floor(this._round / length);
        const extraWaves = Math.min(
            extend * waveData.extend,
            waveData.maxExtend
        );

        this._round++;

        for (let i = 0; i < extraWaves; i++) {
            const nextWaveEnemies = JSON.parse(
                JSON.stringify(initialWaveEnemies)
            );
            const lastTickValue = newWaveEnemies[newWaveEnemies.length - 1].t;

            for (let j = 0; j < nextWaveEnemies.length; j++) {
                nextWaveEnemies[j].t += lastTickValue + 2;
            }

            newWaveEnemies = newWaveEnemies.concat(nextWaveEnemies);
        }

        for (let i = 0; i < newWaveEnemies.length; i++) {
            newWaveEnemies[i].t =
                newWaveEnemies[i].t * this.enemySpawningDeltaTicks +
                this._ticksCounter +
                1;
        }

        this.waveEnemies = this.waveEnemies.concat(newWaveEnemies);
        this.waveEnemies = MathUtils.mergeSort<{ type: string; t: number }>(
            this.waveEnemies,
            function(
                e1: { type: string; t: number },
                e2: { type: string; t: number }
            ): boolean {
                return e1.t - e2.t < 0;
            }
        );

        this.lastWaveTick = this._ticksCounter;

        this.waveReward = waveData.waveReward;

        this.waveActivated = true;

        this.waveEnemiesLength += newWaveEnemies.length;

        this.waveDefaultHealth = 0;
        for (let i = 0; i < this.waveEnemies.length; i++) {
            this.waveDefaultHealth += this.enemyData[
                this.waveEnemies[i].type
            ].life;
            this.remainingReward += Math.round(
                this.enemyRewardModifier *
                    this.enemyData[this.waveEnemies[i].type].value
            );
        }

        const damagePossible = Math.round(
            GameConstants.DIFFICULTY_LINEAR * this._creditsEarned +
                GameConstants.DIFFICULTY_MODIFIER *
                    Math.pow(
                        this._creditsEarned,
                        GameConstants.DIFFICULTY_EXPONENT
                    )
        );
        let healthModifier = MathUtils.fixNumber(
            damagePossible / this.waveDefaultHealth
        );
        healthModifier = Math.max(
            healthModifier,
            GameConstants.MIN_HEALTH_MODIFIER
        );

        let rewardModifier =
            GameConstants.REWARD_MODIFIER *
            Math.pow(healthModifier, GameConstants.REWARD_EXPONENT);
        rewardModifier = Math.max(
            rewardModifier,
            GameConstants.MIN_REWARD_MODIFIER
        );

        this.enemyHealthModifier = healthModifier;
        this.enemyRewardModifier = rewardModifier;

        this._bonus = Math.round(
            this.waveReward +
                Math.round(
                    GameConstants.EARLY_BONUS_MODIFIER *
                        Math.pow(
                            Math.max(0, this.remainingReward),
                            GameConstants.EARLY_BONUS_EXPONENT
                        )
                )
        );

        return true;
    }

    public removeEnemy(enemy: Enemy): void {
        const i = this.enemies.indexOf(enemy);

        if (i !== -1) {
            this.enemies.splice(i, 1);
        }

        enemy.destroy();
    }

    public addTurret(
        type: string,
        p: { r: number; c: number }
    ): Types.EngineReturn {
        if (
            typeof type !== 'string' ||
            !p ||
            typeof p.c !== 'number' ||
            typeof p.r !== 'number'
        ) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        if (
            p.r < 0 ||
            p.c < 0 ||
            p.r >= this.boardSize.r ||
            p.c >= this.boardSize.c
        ) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ADD_TURRET_POSITION }
            };
        }

        for (let i = 0; i < this.enemiesPathCells.length; i++) {
            if (
                p.c === this.enemiesPathCells[i].c &&
                p.r === this.enemiesPathCells[i].r
            ) {
                return {
                    success: false,
                    error: { type: GameConstants.ERROR_ADD_TURRET_POSITION }
                };
            }
        }

        for (let i = 0; i < this.turrets.length; i++) {
            if (
                p.c === this.turrets[i].position.c &&
                p.r === this.turrets[i].position.r
            ) {
                return {
                    success: false,
                    error: { type: GameConstants.ERROR_ADD_TURRET_POSITION }
                };
            }
        }

        let isOnPlateau = false;

        if (this.plateausCells.length !== 0) {
            for (let i = 0; i < this.plateausCells.length; i++) {
                if (
                    this.plateausCells[i].c === p.c &&
                    this.plateausCells[i].r === p.r
                ) {
                    isOnPlateau = true;
                    break;
                }
            }
        } else {
            isOnPlateau = true;
        }

        if (!isOnPlateau) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ADD_TURRET_POSITION }
            };
        }

        let turret: Turret = null;

        switch (type) {
            case GameConstants.TURRET_PROJECTILE:
                turret = new ProjectileTurret(p, this);
                break;
            case GameConstants.TURRET_LASER:
                turret = new LaserTurret(p, this);
                break;
            case GameConstants.TURRET_LAUNCH:
                turret = new LaunchTurret(p, this);
                break;
            case GameConstants.TURRET_GLUE:
                turret = new GlueTurret(p, this);
                break;
            default:
                return {
                    success: false,
                    error: {
                        type: GameConstants.ERROR_ADD_TURRET_NAME,
                        info: { name: type }
                    }
                };
        }

        if (this._credits < turret.value) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_CREDITS }
            };
        }

        this.turrets.push(turret);

        this._credits -= turret.value;

        return { success: true, turret: turret };
    }

    public sellTurret(id: number): Types.EngineReturn {
        if (typeof id !== 'number') {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        const turret = this.getTurretById(id);

        if (!turret) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_TURRET, info: { id: id } }
            };
        }

        const i = this.turrets.indexOf(turret);

        if (i !== -1) {
            this.turrets.splice(i, 1);
        }

        this._credits += turret.sellValue;
        turret.destroy();

        return { success: true };
    }

    public setNextStrategy(id: number): Types.EngineReturn {
        if (typeof id !== 'number') {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        const turret = this.getTurretById(id);

        if (turret) {
            turret.setNextStrategy();
            return { success: true };
        }

        return {
            success: false,
            error: { type: GameConstants.ERROR_TURRET, info: { id: id } }
        };
    }

    public setFixedTarget(id: number): Types.EngineReturn {
        if (typeof id !== 'number') {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        const turret = this.getTurretById(id);

        if (turret) {
            turret.setFixedTarget();
            return { success: true };
        }

        return {
            success: false,
            error: { type: GameConstants.ERROR_TURRET, info: { id: id } }
        };
    }

    public addBullet(bullet: Bullet, projectileTurret: ProjectileTurret): void {
        this.bullets.push(bullet);

        this.eventDispatcher.dispatchEvent(
            new Event(Event.BULLET_SHOT, [bullet, projectileTurret])
        );
    }

    public addGlueBullet(bullet: GlueBullet, glueTurret: GlueTurret): void {
        this.glueBullets.push(bullet);

        this.eventDispatcher.dispatchEvent(
            new Event(Event.GLUE_BULLET_SHOT, [bullet, glueTurret])
        );
    }

    public addGlue(glue: Glue, glueTurret: GlueTurret): void {
        this.glues.push(glue);

        this.eventDispatcher.dispatchEvent(
            new Event(Event.GLUE_SHOT, [glue, glueTurret])
        );
    }

    public addMortar(mortar: Mortar, launchTurret: LaunchTurret): void {
        this.mortars.push(mortar);

        this.eventDispatcher.dispatchEvent(
            new Event(Event.MORTAR_SHOT, [mortar, launchTurret])
        );
    }

    public addMine(mine: Mine, launchTurret: LaunchTurret): void {
        this.mines.push(mine);

        this.eventDispatcher.dispatchEvent(
            new Event(Event.MINE_SHOT, [mine, launchTurret])
        );
    }

    public addLaserRay(laserTurret: LaserTurret, enemies: Enemy[]): void {
        for (let i = 0; i < enemies.length; i++) {
            enemies[i].hit(laserTurret.damage, null, null, null, laserTurret);
        }

        this.eventDispatcher.dispatchEvent(
            new Event(Event.LASER_SHOT, [laserTurret, enemies])
        );
        this.eventDispatcher.dispatchEvent(
            new Event(Event.ENEMY_HIT, [enemies])
        );
    }

    public flagEnemyToTeleport(enemy: Enemy, glueTurret: GlueTurret): void {
        this.teleportedEnemies.push({ enemy: enemy, glueTurret: glueTurret });
    }

    public onEnemyReachedExit(enemy: Enemy): void {
        const i = this.enemies.indexOf(enemy);

        if (i !== -1) {
            this.enemies.splice(i, 1);
        }

        if (!this._gameOver) {
            this._score += enemy.value;
        }

        this.remainingReward -= enemy.value;

        enemy.destroy();

        this._lifes -= 1;

        this._bonus = Math.round(
            this.waveReward +
                Math.round(
                    GameConstants.EARLY_BONUS_MODIFIER *
                        Math.pow(
                            Math.max(0, this.remainingReward),
                            GameConstants.EARLY_BONUS_EXPONENT
                        )
                )
        );

        if (this.enemies.length === 0 && this.allEnemiesSpawned) {
            this.onNoEnemiesOnStage();
        }

        this.eventDispatcher.dispatchEvent(
            new Event(Event.ENEMY_REACHED_EXIT, [enemy])
        );
    }

    public onEnemyKilled(enemy: Enemy): void {
        this.eventDispatcher.dispatchEvent(
            new Event(Event.ENEMY_KILLED, [enemy])
        );

        const i = this.enemies.indexOf(enemy);

        if (i !== -1) {
            this.enemies.splice(i, 1);
        }

        this._credits += enemy.value;
        this._creditsEarned += enemy.value;
        this.remainingReward -= enemy.value;

        if (!this._gameOver) {
            this._score += enemy.value;
        }

        enemy.destroy();

        this._bonus = Math.round(
            this.waveReward +
                Math.round(
                    GameConstants.EARLY_BONUS_MODIFIER *
                        Math.pow(
                            Math.max(0, this.remainingReward),
                            GameConstants.EARLY_BONUS_EXPONENT
                        )
                )
        );

        if (this.enemies.length === 0 && this.allEnemiesSpawned) {
            this.onNoEnemiesOnStage();
        }
    }

    public improveTurret(id: number): Types.EngineReturn {
        if (typeof id !== 'number') {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        const turret = this.getTurretById(id);

        if (!turret) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_TURRET, info: { id: id } }
            };
        }

        if (turret.level >= turret.maxLevel) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_LEVEL_UP, info: { id: id } }
            };
        }

        if (this._credits < turret.priceImprovement) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_CREDITS }
            };
        }

        this._credits -= turret.priceImprovement;
        turret.improve();
        return { success: true };
    }

    public upgradeTurret(id: number): Types.EngineReturn {
        if (typeof id !== 'number') {
            return {
                success: false,
                error: { type: GameConstants.ERROR_ACTION_VALUE }
            };
        }

        const turret = this.getTurretById(id);

        if (!turret) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_TURRET, info: { id: id } }
            };
        }

        if (turret.grade >= 3) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_UPGRADE, info: { id: id } }
            };
        }

        if (this._credits < turret.priceUpgrade) {
            return {
                success: false,
                error: { type: GameConstants.ERROR_CREDITS }
            };
        }

        this._credits -= turret.priceUpgrade;
        turret.upgrade();
        return { success: true };
    }

    public getPathPosition(l: number): { x: number; y: number } {
        let x: number;
        let y: number;

        const i = Math.floor(l);

        if (!this.enemiesPathCells[i]) {
            return null;
        }

        if (i === this.enemiesPathCells.length - 1) {
            x = this.enemiesPathCells[this.enemiesPathCells.length - 1].c;
            y = this.enemiesPathCells[this.enemiesPathCells.length - 1].r;
        } else {
            const dl = MathUtils.fixNumber(l - i);

            x = this.enemiesPathCells[i].c + 0.5;
            y = this.enemiesPathCells[i].r + 0.5;

            const dx = MathUtils.fixNumber(
                this.enemiesPathCells[i + 1].c - this.enemiesPathCells[i].c
            );
            const dy = MathUtils.fixNumber(
                this.enemiesPathCells[i + 1].r - this.enemiesPathCells[i].r
            );

            x = MathUtils.fixNumber(x + dx * dl);
            y = MathUtils.fixNumber(y + dy * dl);
        }

        return { x: x, y: y };
    }

    public addEventListener(
        type: string,
        listenerFunction: Function,
        scope: any
    ): void {
        this.eventDispatcher.addEventListener(type, listenerFunction, scope);
    }

    public removeEventListener(type: string, listenerFunction: Function): void {
        this.eventDispatcher.removeEventListener(type, listenerFunction);
    }

    private checkCollisions(): void {
        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];

            if (bullet.outOfStageBoundaries) {
                this.bulletsColliding.push(bullet);
            } else {
                let enemy = bullet.assignedEnemy;

                const bp1 = { x: bullet.x, y: bullet.y };
                const bp2 = bullet.getPositionNextTick();

                let enemyPosition: { x: number; y: number };
                let enemyHit: boolean;

                if (enemy) {
                    enemyPosition = { x: enemy.x, y: enemy.y };
                    const boundingRadius =
                        enemy.life > 0
                            ? enemy.boundingRadius
                            : 1.65 * enemy.boundingRadius;
                    enemyHit = MathUtils.isLineSegmentIntersectingCircle(
                        bp1,
                        bp2,
                        enemyPosition,
                        boundingRadius
                    );

                    if (enemyHit) {
                        this.bulletsColliding.push(bullet);
                    }
                } else {
                    for (let j = 0; j < this.enemies.length; j++) {
                        enemy = this.enemies[j];
                        enemyPosition = { x: enemy.x, y: enemy.y };

                        enemyHit = MathUtils.isLineSegmentIntersectingCircle(
                            bp1,
                            bp2,
                            enemyPosition,
                            1.25 * enemy.boundingRadius
                        );

                        if (enemyHit) {
                            bullet.assignedEnemy = enemy;
                            this.bulletsColliding.push(bullet);
                            break;
                        }
                    }
                }
            }
        }

        for (let i = 0; i < this.glueBullets.length; i++) {
            const gluebullet = this.glueBullets[i];

            if (gluebullet.outOfStageBoundaries) {
                this.glueBulletsColliding.push(gluebullet);
            } else {
                let enemy = gluebullet.assignedEnemy;

                const bp1 = { x: gluebullet.x, y: gluebullet.y };
                const bp2 = gluebullet.getPositionNextTick();

                let enemyPosition: { x: number; y: number };
                let enemyHit: boolean;

                if (enemy) {
                    enemyPosition = { x: enemy.x, y: enemy.y };

                    const boundingRadius =
                        enemy.life > 0
                            ? enemy.boundingRadius
                            : 1.65 * enemy.boundingRadius;
                    enemyHit = MathUtils.isLineSegmentIntersectingCircle(
                        bp1,
                        bp2,
                        enemyPosition,
                        boundingRadius
                    );

                    if (enemyHit) {
                        this.glueBulletsColliding.push(gluebullet);
                    }
                } else {
                    for (let j = 0; j < this.enemies.length; j++) {
                        enemy = this.enemies[j];
                        enemyPosition = { x: enemy.x, y: enemy.y };

                        enemyHit = MathUtils.isLineSegmentIntersectingCircle(
                            bp1,
                            bp2,
                            enemyPosition,
                            1.25 * enemy.boundingRadius
                        );

                        if (enemyHit) {
                            gluebullet.assignedEnemy = enemy;
                            this.glueBulletsColliding.push(gluebullet);
                            break;
                        }
                    }
                }
            }
        }

        for (let i = 0; i < this.mortars.length; i++) {
            if (this.mortars[i].detonate) {
                this.mortarsImpacting.push(this.mortars[i]);
            }
        }

        for (let i = 0; i < this.mines.length; i++) {
            if (this.mines[i].detonate) {
                this.minesImpacting.push(this.mines[i]);
            }
        }

        for (let i = 0; i < this.glues.length; i++) {
            if (this.glues[i].consumed) {
                this.consumedGlues.push(this.glues[i]);
            }
        }

        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];

            if (enemy.type !== GameConstants.ENEMY_FLIER) {
                enemy.affectedByGlue = false;

                for (let j = 0; j < this.glues.length; j++) {
                    const glue = this.glues[j];

                    if (!glue.consumed) {
                        const dx = enemy.x - glue.x;
                        const dy = enemy.y - glue.y;

                        const squaredDist = MathUtils.fixNumber(
                            dx * dx + dy * dy
                        );
                        const squaredRange = MathUtils.fixNumber(
                            glue.range * glue.range
                        );

                        if (squaredRange >= squaredDist) {
                            enemy.glue(glue.intensity);
                            break;
                        }
                    }
                }
            }
        }
    }

    private removeProjectilesAndAccountDamage(): void {
        for (let i = 0; i < this.bulletsColliding.length; i++) {
            const bullet = this.bulletsColliding[i];
            const enemy = bullet.assignedEnemy;

            if (bullet.outOfStageBoundaries || enemy.life === 0) {
                this.eventDispatcher.dispatchEvent(
                    new Event(Event.REMOVE_BULLET, [bullet])
                );
            } else {
                this.eventDispatcher.dispatchEvent(
                    new Event(Event.ENEMY_HIT, [[enemy], bullet])
                );
                enemy.hit(bullet.damage, bullet);
            }

            const index = this.bullets.indexOf(bullet);
            this.bullets.splice(index, 1);
            bullet.destroy();
        }

        this.bulletsColliding.length = 0;

        for (let i = 0; i < this.glueBulletsColliding.length; i++) {
            const glueBullet = this.glueBulletsColliding[i];
            const enemy = glueBullet.assignedEnemy;

            if (glueBullet.outOfStageBoundaries || enemy.life === 0) {
                this.eventDispatcher.dispatchEvent(
                    new Event(Event.REMOVE_GLUE_BULLET, [glueBullet])
                );
            } else {
                this.eventDispatcher.dispatchEvent(
                    new Event(Event.ENEMY_GLUE_HIT, [[enemy], glueBullet])
                );
                enemy.hitByGlueBullet(
                    glueBullet.intensity,
                    glueBullet.durationTicks
                );
            }

            const index = this.glueBullets.indexOf(glueBullet);
            this.glueBullets.splice(index, 1);
            glueBullet.destroy();
        }

        this.glueBulletsColliding.length = 0;

        for (let i = 0; i < this.mortarsImpacting.length; i++) {
            const mortar = this.mortarsImpacting[i];

            const hitEnemiesData: {
                enemy: Enemy;
                damage: number;
            }[] = mortar.getEnemiesWithinExplosionRange();
            const hitEnemies: Enemy[] = [];

            if (hitEnemiesData.length > 0) {
                for (let j = 0; j < hitEnemiesData.length; j++) {
                    const enemy = hitEnemiesData[j].enemy;

                    if (enemy.life > 0) {
                        enemy.hit(hitEnemiesData[j].damage, null, mortar);
                        hitEnemies.push(enemy);
                    }
                }
            }

            this.eventDispatcher.dispatchEvent(
                new Event(Event.ENEMY_HIT, [hitEnemies, null, mortar])
            );

            const index = this.mortars.indexOf(mortar);
            this.mortars.splice(index, 1);

            mortar.destroy();
        }

        this.mortarsImpacting.length = 0;

        for (let i = 0; i < this.minesImpacting.length; i++) {
            const mine = this.minesImpacting[i];

            const hitEnemiesData: {
                enemy: Enemy;
                damage: number;
            }[] = mine.getEnemiesWithinExplosionRange();
            const hitEnemies: Enemy[] = [];

            if (hitEnemiesData.length > 0) {
                for (let j = 0; j < hitEnemiesData.length; j++) {
                    const enemy = hitEnemiesData[j].enemy;

                    if (enemy.life > 0) {
                        enemy.hit(hitEnemiesData[j].damage, null, null, mine);
                        hitEnemies.push(enemy);
                    }
                }
            }

            this.eventDispatcher.dispatchEvent(
                new Event(Event.ENEMY_HIT, [hitEnemies, null, null, mine])
            );

            const index = this.mines.indexOf(mine);
            this.mines.splice(index, 1);

            const turret = mine.turret;

            if (turret) {
                turret.numMines--;
            }

            mine.destroy();
        }

        this.minesImpacting.length = 0;

        for (let i = 0; i < this.consumedGlues.length; i++) {
            const glue = this.consumedGlues[i];

            const index = this.glues.indexOf(glue);
            this.glues.splice(index, 1);

            this.eventDispatcher.dispatchEvent(
                new Event(Event.GLUE_CONSUMED, [glue])
            );
            glue.destroy();
        }

        this.consumedGlues.length = 0;
    }

    private teleport(): void {
        const teleportedEnemiesData: {
            enemy: Enemy;
            glueTurret: GlueTurret;
        }[] = [];

        for (let i = 0; i < this.teleportedEnemies.length; i++) {
            const enemy = this.teleportedEnemies[i].enemy;
            enemy.teleport(
                this.teleportedEnemies[i].glueTurret.teleportDistance
            );
            teleportedEnemiesData.push({
                enemy: enemy,
                glueTurret: this.teleportedEnemies[i].glueTurret
            });

            for (let i = 0; i < this.bullets.length; i++) {
                const bullet = this.bullets[i];

                if (
                    bullet.assignedEnemy &&
                    bullet.assignedEnemy.id === enemy.id
                ) {
                    bullet.assignedEnemy = null;
                }
            }

            for (let i = 0; i < this.glueBullets.length; i++) {
                const glueBullet = this.glueBullets[i];

                if (
                    glueBullet.assignedEnemy &&
                    glueBullet.assignedEnemy.id === enemy.id
                ) {
                    glueBullet.assignedEnemy = null;
                }
            }
        }

        this.teleportedEnemies.length = 0;

        if (teleportedEnemiesData.length > 0) {
            this.eventDispatcher.dispatchEvent(
                new Event(Event.ENEMIES_TELEPORTED, [teleportedEnemiesData])
            );
        }
    }

    private ageTurrets(): void {
        for (let i = 0; i < this.turrets.length; i++) {
            this.turrets[i].ageTurret();
        }
    }

    private spawnEnemies(): void {
        let enemy = this.enemiesSpawner.getEnemy();

        while (enemy) {
            this.enemiesSpawned++;

            if (this.enemiesSpawned === this.waveEnemiesLength) {
                this.allEnemiesSpawned = true;
                this.enemiesSpawned = 0;
                this.waveEnemiesLength = 0;
            }

            this.enemies.push(enemy);
            this.eventDispatcher.dispatchEvent(
                new Event(Event.ENEMY_SPAWNED, [
                    enemy,
                    this.enemiesPathCells[0]
                ])
            );

            enemy = this.enemiesSpawner.getEnemy();
        }
    }

    private onNoEnemiesOnStage(): void {
        this._noEnemiesOnStage = true;

        this._credits += this._bonus;
        this._creditsEarned += this._bonus;
        this._bonus = 0;

        this.eventDispatcher.dispatchEvent(
            new Event(Event.NO_ENEMIES_ON_STAGE)
        );
    }

    private getTurretById(id: number): Turret {
        let turret: Turret = null;

        for (let i = 0; i < this.turrets.length; i++) {
            if (this.turrets[i].id === id) {
                turret = this.turrets[i];
                break;
            }
        }

        return turret;
    }

    private generateTurretsAttributes(): void {
        this.turretsAttributes = {};
        for (const turretType in this.turretData) {
            this.turretsAttributes[turretType] = [{}, {}, {}];

            if (turretType === GameConstants.TURRET_PROJECTILE) {
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    100,
                    140,
                    'prev + (prev - pprev) + (i + 2) * 2',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RELOAD,
                    1,
                    0.95,
                    'prev - .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RANGE,
                    2.5,
                    2.55,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    50,
                    60,
                    'prev + (i + 4) * 2',
                    10
                );
                this.turretsAttributes[turretType][0].priceUpgrade = 5600;

                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    3400,
                    3560,
                    'prev + (prev - pprev) + 64 + (i - 2) * 26',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RELOAD,
                    0.55,
                    0.5,
                    'prev - .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RANGE,
                    3,
                    3.05,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    470,
                    658,
                    'prev + (prev - pprev) + 75 + (i - 2) * 31',
                    10
                );
                this.turretsAttributes[turretType][1].priceUpgrade = 88500;

                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    20000,
                    20100,
                    'prev + (i * 100)',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RELOAD,
                    0.2,
                    0.19,
                    'prev - .01',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RANGE,
                    3.5,
                    3.55,
                    'prev + .05',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    750,
                    1125,
                    'prev + (prev - pprev) + 188 + (i - 2) * 92',
                    15
                );
            } else if (turretType === GameConstants.TURRET_LAUNCH) {
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    100,
                    160,
                    'prev + (prev - pprev) + (i + 4) * 2',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_EXPLOSION_RANGE,
                    1.5,
                    1.55,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RELOAD,
                    2,
                    1.95,
                    'prev - .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RANGE,
                    2.5,
                    2.55,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    125,
                    150,
                    'prev + (prev - pprev) + (i + 3)',
                    10
                );
                this.turretsAttributes[turretType][0].priceUpgrade = 10000;

                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    3287,
                    3744,
                    'prev + (prev - pprev) + 150 + (i - 2) * 3',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_EXPLOSION_RANGE,
                    2,
                    2.05,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RELOAD,
                    2.55,
                    2.5,
                    'prev - .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RANGE,
                    2.5,
                    2.5,
                    'prev',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    750,
                    1050,
                    'prev + (prev - pprev) + 120 + (i - 2) * 48',
                    10
                );
                this.turretsAttributes[turretType][1].priceUpgrade = 103000;

                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    48000,
                    48333,
                    'prev + (prev - pprev) + 34',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_EXPLOSION_RANGE,
                    1.75,
                    1.8,
                    'prev + .05',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RELOAD,
                    3,
                    2.95,
                    'prev - .05',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RANGE,
                    3,
                    3.1,
                    'prev + .1',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    950,
                    1425,
                    'prev + (prev - pprev) + 238 + (i - 2) * 117',
                    15
                );
            } else if (turretType === GameConstants.TURRET_LASER) {
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    230,
                    270,
                    'prev + (prev - pprev) + (i + 2) * 2',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RELOAD,
                    1.5,
                    1.4,
                    'prev - .1',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RANGE,
                    3,
                    3.05,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    50,
                    60,
                    'prev + (i + 4) * 2',
                    10
                );
                this.turretsAttributes[turretType][0].priceUpgrade = 7000;

                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    4300,
                    4460,
                    'prev + (prev - pprev) + 64 + (i - 2) * 26',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RELOAD,
                    1.5,
                    1.4,
                    'prev - .1',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RANGE,
                    3,
                    3.05,
                    'prev + .05',
                    10
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    580,
                    812,
                    'prev + (prev - pprev) + 93 + (i - 2) * 37',
                    10
                );
                this.turretsAttributes[turretType][1].priceUpgrade = 96400;

                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_DAMAGE,
                    44000,
                    44333,
                    'prev + (prev - pprev) + 34',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RELOAD,
                    3,
                    2.95,
                    'prev - .05',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RANGE,
                    3.05,
                    3.1,
                    'prev + .05',
                    15
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    839,
                    1203,
                    'prev + (prev - pprev) + 239 + (i - 2) * 115',
                    15
                );
            } else if (turretType === GameConstants.TURRET_GLUE) {
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_INTENSITY,
                    1.2,
                    1.4,
                    'prev + .2',
                    5
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_DURATION,
                    1.5,
                    1.5,
                    'prev',
                    5
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RELOAD,
                    2,
                    2,
                    'prev',
                    5
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_RANGE,
                    1.5,
                    1.6,
                    'prev + .1',
                    5
                );
                this.setAttributes(
                    turretType,
                    1,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    100,
                    120,
                    'prev + (prev - pprev) + 4 + (i - 2)',
                    5
                );
                this.turretsAttributes[turretType][0].priceUpgrade = 800;

                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_INTENSITY,
                    1.2,
                    1.5,
                    'prev + 5',
                    5
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_DURATION,
                    2.5,
                    2.5,
                    'prev',
                    5
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RELOAD,
                    3,
                    3,
                    'prev',
                    5
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_RANGE,
                    2.5,
                    2.7,
                    'prev + .2',
                    5
                );
                this.setAttributes(
                    turretType,
                    2,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    200,
                    240,
                    'prev + (prev - pprev) + (i + 2) * 2',
                    5
                );
                this.turretsAttributes[turretType][1].priceUpgrade = 1700;

                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_TELEPORT_DISTANCE,
                    15,
                    20,
                    'prev + 5',
                    5
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RELOAD,
                    5,
                    4.5,
                    'prev - .5',
                    5
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_RANGE,
                    3.5,
                    3.5,
                    'prev',
                    5
                );
                this.setAttributes(
                    turretType,
                    3,
                    GameConstants.ATTRIBUTE_PRICE_IMPROVEMENT,
                    2000,
                    2400,
                    'prev + (prev - pprev) + (i + 2) * 20',
                    5
                );
            }
        }
    }

    private setAttributes(
        turret: string,
        grade: number,
        attribute: string,
        pprev: number,
        prev: number,
        func: string,
        length: number
    ): void {
        const res = [];
        for (let i = 0; i < length; i++) {
            if (i === 0) {
                res[i] = pprev;
            } else if (i === 1) {
                res[i] = prev;
            } else {
                pprev = res[i - 2];
                prev = res[i - 1];
                res[i] = Math.round(eval(func) * 100) / 100;
            }
        }

        this.turretsAttributes[turret][grade - 1][attribute] = res;
    }

    public get credits(): number {
        return this._credits;
    }

    public get creditsEarned(): number {
        return this._creditsEarned;
    }

    public get bonus(): number {
        return this._bonus;
    }

    public get ticksCounter(): number {
        return this._ticksCounter;
    }

    public set ticksCounter(value: number) {
        this._ticksCounter = value;
    }

    public get score(): number {
        return this._score;
    }

    public set score(value: number) {
        this._score = value;
    }

    public get gameOver(): boolean {
        return this._gameOver;
    }

    public set gameOver(value: boolean) {
        this._gameOver = value;
    }

    public get lifes(): number {
        return this._lifes;
    }

    public set lifes(value: number) {
        this._lifes = value;
    }

    public get noEnemiesOnStage(): boolean {
        return this._noEnemiesOnStage;
    }

    public get round(): number {
        return this._round;
    }

    public get timeStep(): number {
        return this._timeStep;
    }

    public set timeStep(value: number) {
        this._timeStep = value;
    }

    public get version(): string {
        return this._version;
    }

    public set version(value: string) {
        this._version = value;
    }
}
