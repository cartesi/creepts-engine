// Copyright 2020 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy
// of the license at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

import { GameConstants } from '../GameConstants';
import { MathUtils } from '../utils/MathUtils';
import { Engine } from '../Engine';
import { Enemy } from '../enemies/Enemy';

export class Turret {
    public static readonly DOWNGRADE_PERCENT = 0.8;

    public id: number;
    public creationTick: number;
    public type: string;
    public level: number;
    public maxLevel: number;
    public grade: number;
    public x: number;
    public y: number;
    public damage: number;
    public reload: number;
    public range: number;
    public inflicted: number;
    public priceImprovement: number;
    public priceUpgrade: number;
    public value: number;
    public sellValue: number;
    public position: { r: number; c: number };
    public shootingStrategy: string;
    public shootingStrategyIndex: number;
    public fixedTarget: boolean;
    public enemiesWithinRange: Enemy[];
    public followedEnemy: Enemy;
    public shootAngle: number;
    public projectileSpeed: number;
    public squaredRange: number;

    protected f: number;
    protected reloadTicks: number;
    protected readyToShoot: boolean;
    protected engine: Engine;

    constructor(type: string, p: { r: number; c: number }, engine: Engine) {
        this.engine = engine;

        this.id = engine.turretId;
        engine.turretId++;

        this.creationTick = this.engine.ticksCounter;

        this.type = type;
        this.f = 0;
        this.level = 1;
        this.maxLevel = 10;
        this.grade = 1;
        this.inflicted = 0;
        this.position = p;
        this.fixedTarget = true;
        this.shootingStrategyIndex = 0;
        this.shootingStrategy =
            GameConstants.STRATEGIES_ARRAY[this.shootingStrategyIndex];
        this.readyToShoot = false;
        this.enemiesWithinRange = [];
        this.followedEnemy = undefined;

        this.x = this.position.c + 0.5;
        this.y = this.position.r + 0.5;

        this.value = this.engine.turretData[this.type].price;
        this.sellValue = Math.round(
            this.engine.turretData[this.type].price * Turret.DOWNGRADE_PERCENT
        );
    }

    public destroy(): void {
        //
    }

    public update(): void {
        if (this.readyToShoot) {
            this.enemiesWithinRange = this.getEnemiesWithinRange();

            if (this.fixedTarget) {
                if (this.enemiesWithinRange.length > 0) {
                    if (
                        this.enemiesWithinRange.indexOf(this.followedEnemy) ===
                        -1
                    ) {
                        this.followedEnemy = this.enemiesWithinRange[0];
                    }
                } else {
                    this.followedEnemy = null;
                }
            } else {
                this.followedEnemy = this.enemiesWithinRange[0];
            }

            if (this.enemiesWithinRange.length > 0) {
                this.readyToShoot = false;
                this.shoot();
            }
        } else {
            this.f++;

            if (this.f >= this.reloadTicks) {
                this.readyToShoot = true;
                this.f = 0;
            }
        }
    }

    public ageTurret(): void {
        this.sellValue = Math.max(Math.round(this.sellValue * Turret.DOWNGRADE_PERCENT), Math.round(this.value * .5));
    }

    public improve(): void {
        this.value += this.priceImprovement;
        this.sellValue += Math.round(this.priceImprovement * Turret.DOWNGRADE_PERCENT);

        this.level++;
        this.calculateTurretParameters();
    }

    public upgrade(): void {
        this.value += this.priceUpgrade;
        this.sellValue += Math.round(this.priceUpgrade * Turret.DOWNGRADE_PERCENT);

        this.grade++;
        this.level = 1;

        if (this.grade === 3 && this.type !== GameConstants.TURRET_GLUE) {
            this.maxLevel = 15;
        }

        this.f = 0;

        this.calculateTurretParameters();
    }

    public setNextStrategy(): void {
        this.shootingStrategyIndex =
            this.shootingStrategyIndex ===
            GameConstants.STRATEGIES_ARRAY.length - 1
                ? 0
                : this.shootingStrategyIndex + 1;
        this.shootingStrategy =
            GameConstants.STRATEGIES_ARRAY[this.shootingStrategyIndex];
    }

    public setFixedTarget(): void {
        this.fixedTarget = !this.fixedTarget;
    }

    protected calculateTurretParameters(): void {
        this.reloadTicks = Math.floor(
            GameConstants.RELOAD_BASE_TICKS * this.reload
        );
        this.squaredRange = MathUtils.fixNumber(this.range * this.range);
    }

    protected shoot(): void {
        // override
    }

    public getEnemiesWithinRange(): Enemy[] {
        const enemiesAndSquaredDistances: {
            enemy: Enemy;
            squareDist: number;
        }[] = [];

        for (let i = 0; i < this.engine.enemies.length; i++) {
            const enemy = this.engine.enemies[i];

            if (
                this.type === GameConstants.TURRET_GLUE &&
                this.grade === 3 &&
                enemy.hasBeenTeleported
            ) {
                continue;
            }

            if (
                enemy.life > 0 &&
                enemy.l < this.engine.enemiesPathCells.length - 1.5 &&
                !enemy.teleporting
            ) {
                const dx = this.x - enemy.x;
                const dy = this.y - enemy.y;

                const squaredDist = MathUtils.fixNumber(dx * dx + dy * dy);

                if (this.squaredRange >= squaredDist) {
                    enemiesAndSquaredDistances.push({
                        enemy: enemy,
                        squareDist: squaredDist
                    });
                }
            }
        }

        if (enemiesAndSquaredDistances.length > 1) {
            switch (this.shootingStrategy) {
                case GameConstants.STRATEGY_SHOOT_FIRST:
                    enemiesAndSquaredDistances.sort(function(
                        e1: { enemy: Enemy; squareDist: number },
                        e2: { enemy: Enemy; squareDist: number }
                    ): number {
                        if (e1.enemy.l === e2.enemy.l) {
                            return e1.enemy.id - e2.enemy.id;
                        } else {
                            return e2.enemy.l - e1.enemy.l;
                        }
                    });
                    break;

                case GameConstants.STRATEGY_SHOOT_LAST:
                    enemiesAndSquaredDistances.sort(function(
                        e1: { enemy: Enemy; squareDist: number },
                        e2: { enemy: Enemy; squareDist: number }
                    ): number {
                        if (e1.enemy.l === e2.enemy.l) {
                            return e1.enemy.id - e2.enemy.id;
                        } else {
                            return e1.enemy.l - e2.enemy.l;
                        }
                    });
                    break;

                case GameConstants.STRATEGY_SHOOT_CLOSEST:
                    enemiesAndSquaredDistances.sort(function(
                        e1: { enemy: Enemy; squareDist: number },
                        e2: { enemy: Enemy; squareDist: number }
                    ): number {
                        if (e1.squareDist === e2.squareDist) {
                            if (e1.enemy.l === e2.enemy.l) {
                                return e1.enemy.id - e2.enemy.id;
                            } else {
                                return e2.enemy.l - e1.enemy.l;
                            }
                        } else {
                            return e1.squareDist - e2.squareDist;
                        }
                    });

                    break;

                case GameConstants.STRATEGY_SHOOT_WEAKEST:
                    enemiesAndSquaredDistances.sort(function(
                        e1: { enemy: Enemy; squareDist: number },
                        e2: { enemy: Enemy; squareDist: number }
                    ): number {
                        if (e1.enemy.life === e2.enemy.life) {
                            if (e1.enemy.l === e2.enemy.l) {
                                return e1.enemy.id - e2.enemy.id;
                            } else {
                                return e2.enemy.l - e1.enemy.l;
                            }
                        } else {
                            return e1.enemy.life - e2.enemy.life;
                        }
                    });

                    break;

                case GameConstants.STRATEGY_SHOOT_STRONGEST:
                    enemiesAndSquaredDistances.sort(function(
                        e1: { enemy: Enemy; squareDist: number },
                        e2: { enemy: Enemy; squareDist: number }
                    ): number {
                        if (e1.enemy.life === e2.enemy.life) {
                            if (e1.enemy.l === e2.enemy.l) {
                                return e1.enemy.id - e2.enemy.id;
                            } else {
                                return e2.enemy.l - e1.enemy.l;
                            }
                        } else {
                            return e2.enemy.life - e1.enemy.life;
                        }
                    });

                    break;

                default:
            }
        }

        return enemiesAndSquaredDistances.map(e => e.enemy);
    }
}
