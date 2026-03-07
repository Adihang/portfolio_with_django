(function () {
    'use strict';

    const root = document.querySelector('[data-game-client]');
    if (!root) {
        return;
    }

    const canvas = root.querySelector('[data-game-canvas]');
    const minimapCanvas = root.querySelector('[data-game-minimap]');
    const connectionStatus = root.querySelector('[data-game-connection-status]');
    const defeatReceivedCountNode = root.querySelector('[data-game-defeat-received-count]');
    const defeatDealtCountNode = root.querySelector('[data-game-defeat-dealt-count]');
    const playerCountNode = root.querySelector('[data-game-player-count]');
    const selfIdNode = root.querySelector('[data-game-self-id]');
    const selfPositionNode = root.querySelector('[data-game-self-position]');
    const reconnectButton = root.querySelector('[data-game-reconnect]');
    const fullscreenToggle = root.querySelector('[data-game-fullscreen-toggle]');
    const fullscreenExitButton = root.querySelector('[data-game-fullscreen-exit]');
    const mobileControlsToggle = root.querySelector('[data-game-mobile-controls-toggle]');
    const mobileControls = root.querySelector('[data-game-mobile-controls]');
    const joystick = root.querySelector('[data-game-joystick]');
    const joystickKnob = root.querySelector('[data-game-joystick-knob]');
    const mobileBoostButton = root.querySelector('[data-game-mobile-boost]');
    const deathModal = root.querySelector('[data-game-death-modal]');
    const deathModalRespawnButton = root.querySelector('[data-game-death-modal-respawn]');
    const pingNode = root.querySelector('[data-game-ping]');
    const masterVolumeSlider = root.querySelector('[data-game-master-volume]');
    const idleModal = document.querySelector('[data-game-idle-modal]');
    const idleModalCloseButton = idleModal ? idleModal.querySelector('[data-game-idle-modal-close]') : null;

    if (!canvas || !minimapCanvas || !connectionStatus || !reconnectButton) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const minimapCtx = minimapCanvas.getContext('2d');
    if (!ctx || !minimapCtx) {
        return;
    }

    const labels = {
        connecting: root.getAttribute('data-connecting-label') || 'Connecting',
        connected: root.getAttribute('data-connected-label') || 'Connected',
        disconnected: root.getAttribute('data-disconnected-label') || 'Disconnected'
    };
    const playerName = root.getAttribute('data-player-name') || 'Player';
    const playerIconUrl = root.getAttribute('data-player-icon-url') || '';
    const playerNpcIconUrl = root.getAttribute('data-player-npc-icon-url') || '';
    const playerNpcBoostIconUrl = root.getAttribute('data-player-npc-boost-icon-url') || '';
    const playerNpcDefeatIconUrl = root.getAttribute('data-player-npc-defeat-icon-url') || '';
    const playerBoostIconUrl = root.getAttribute('data-player-boost-icon-url') || '';
    const playerCollisionIconUrl = root.getAttribute('data-player-collision-icon-url') || '';
    const playerDefeatIconUrl = root.getAttribute('data-player-defeat-icon-url') || '';
    const boostSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-boost-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const crashSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-crash-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const defeatSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-defeat-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const nerTrackingSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-ner-tracking-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const nerAccelerationSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-ner-acceleration-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const rawWsUrl = root.getAttribute('data-ws-url') || '';
    const tokenUrl = root.getAttribute('data-token-url') || '';
    const worldSize = 2000;
    const basePlayerSpeedPerSecond = 225;
    const maxBoostedSpeedPerSecond = 360;
    const boostAccelerationPerSecond = 360;
    const boostCooldownPerSecond = 140;
    const npcMaxHealth = 20;
    const cameraFollow = 0.18;
    const remoteLerpPerFrame = 0.24;
    const selfRenderLerpPerFrame = 0.62;
    const selfReconcilePerFrame = 0.2;
    const selfSnapDistance = 220;
    const selfIgnoreDistance = 2;
    const playerSpriteWidth = 44;
    const playerSpriteHeight = 44;
    const playerLabelOffset = 34;
    const viewZoom = 4.266666666666667;
    const renderOverscan = 2;
    const remoteRenderDelaySeconds = 0.06;
    const referenceCanvasWidth = 960;
    const referenceCanvasHeight = 640;
    const rotationLerpPerSecond = 14;
    const flipDurationSeconds = 0.18;
    const soundHearingRadius = 900;
    const input = { up: false, down: false, left: false, right: false, boost: false, respawn: false };
    const keyMap = {
        w: 'up',
        ArrowUp: 'up',
        s: 'down',
        ArrowDown: 'down',
        a: 'left',
        ArrowLeft: 'left',
        d: 'right',
        ArrowRight: 'right'
    };

    let socket = null;
    let activeSocket = null;
    let selfId = '';
    let serverPlayers = [];
    let renderPlayers = [];
    let sendTimer = null;
    let pingTimer = null;
    let reconnectTimer = null;
    let reconnectAttemptInFlight = false;
    let suppressNextCloseReconnect = false;
    let idleReconnectBlocked = false;
    let isFullscreenMode = false;
    let joystickPointerId = null;
    let lastRenderTime = 0;
    let cameraX = worldSize / 2;
    let cameraY = worldSize / 2;
    let predictedSelf = null;
    let renderedSelf = null;
    let currentMoveSpeed = basePlayerSpeedPerSecond;
    let serverReportedMoveSpeed = basePlayerSpeedPerSecond;
    let collisionRecoveryActive = false;
    let boostLockedActive = false;
    let boostState = 'idle';
    let boostDirectionX = 0;
    let boostDirectionY = 0;
    let selfDeathActive = false;
    let selfDeathRespawnReady = false;
    let selfCollisionActive = false;
    let selfCollisionVisualType = 'win';
    let audioContext = null;
    let masterVolume = 0.35;
    const playerAudioStates = new Map();
    const activePlayerSounds = new Map();
    const playerVisuals = new Map();
    const npcTintCanvas = window.document.createElement('canvas');
    const npcTintContext = npcTintCanvas.getContext('2d');
    const playerIcon = new window.Image();
    const playerNpcIcon = new window.Image();
    const playerNpcBoostIcon = new window.Image();
    const playerNpcDefeatIcon = new window.Image();
    const playerBoostIcon = new window.Image();
    const playerCollisionIcon = new window.Image();
    const playerDefeatIcon = new window.Image();
    let playerIconReady = false;
    let playerNpcIconReady = false;
    let playerNpcBoostIconReady = false;
    let playerNpcDefeatIconReady = false;
    let playerBoostIconReady = false;
    let playerCollisionIconReady = false;
    let playerDefeatIconReady = false;

    const bindImage = function (image, src, onReadyChange) {
        if (!src) {
            return;
        }
        image.src = src;
        if (image.complete) {
            onReadyChange(true);
        }
        image.addEventListener('load', function () {
            onReadyChange(true);
        });
        image.addEventListener('error', function () {
            onReadyChange(false);
        });
    };

    bindImage(playerIcon, playerIconUrl, function (ready) {
        playerIconReady = ready;
    });
    bindImage(playerNpcIcon, playerNpcIconUrl, function (ready) {
        playerNpcIconReady = ready;
    });
    bindImage(playerNpcBoostIcon, playerNpcBoostIconUrl, function (ready) {
        playerNpcBoostIconReady = ready;
    });
    bindImage(playerNpcDefeatIcon, playerNpcDefeatIconUrl, function (ready) {
        playerNpcDefeatIconReady = ready;
    });
    bindImage(playerBoostIcon, playerBoostIconUrl, function (ready) {
        playerBoostIconReady = ready;
    });
    bindImage(playerCollisionIcon, playerCollisionIconUrl, function (ready) {
        playerCollisionIconReady = ready;
    });
    bindImage(playerDefeatIcon, playerDefeatIconUrl, function (ready) {
        playerDefeatIconReady = ready;
    });

    const clampToWorld = function (value) {
        return Math.max(0, Math.min(worldSize, value));
    };

    const getFrameAdjustedLerp = function (perFrameValue, deltaSeconds) {
        const normalizedFrames = Math.max(deltaSeconds, 0) * 60;
        return 1 - Math.pow(1 - perFrameValue, normalizedFrames);
    };

    const getEffectiveZoom = function () {
        const widthScale = canvas.width > 0 ? canvas.width / referenceCanvasWidth : 1;
        const heightScale = canvas.height > 0 ? canvas.height / referenceCanvasHeight : 1;
        const canvasScale = Math.min(widthScale, heightScale);
        return (viewZoom / renderOverscan) * Math.max(canvasScale, 0.35);
    };

    const getInputVector = function () {
        let dx = 0;
        let dy = 0;

        if (input.left) dx -= 1;
        if (input.right) dx += 1;
        if (input.up) dy -= 1;
        if (input.down) dy += 1;

        if (dx !== 0 && dy !== 0) {
            const normalize = Math.SQRT1_2;
            dx *= normalize;
            dy *= normalize;
        }

        return { dx, dy };
    };

    const setStatus = function (label, color) {
        connectionStatus.textContent = label;
        connectionStatus.style.color = color;
    };

    const setPing = function (value) {
        if (!pingNode) {
            return;
        }
        pingNode.textContent = typeof value === 'number' ? ('Ping ' + value + ' ms') : 'Ping -- ms';
    };

    const setIdleModalOpen = function (opened) {
        if (!idleModal) {
            return;
        }
        idleModal.hidden = !opened;
    };

    const setDeathModalState = function (opened, respawnReady) {
        if (!deathModal) {
            return;
        }

        deathModal.hidden = !opened;
        if (deathModalRespawnButton) {
            deathModalRespawnButton.disabled = !respawnReady;
        }
        if (!opened || !respawnReady) {
            input.respawn = false;
        }
    };

    const setMobileControlsOpen = function (opened) {
        if (!mobileControls) {
            return;
        }
        mobileControls.hidden = !opened;
        if (mobileControlsToggle) {
            mobileControlsToggle.hidden = opened;
        }
    };

    const setFullscreenMode = function (enabled) {
        isFullscreenMode = Boolean(enabled);
        root.classList.toggle('is-fullscreen', isFullscreenMode);
        document.body.classList.toggle('multiplayer-fullscreen-active', isFullscreenMode);

        if (fullscreenExitButton) {
            fullscreenExitButton.hidden = !isFullscreenMode;
        }

        if (isFullscreenMode) {
            setMobileControlsOpen(true);
        } else {
            setMobileControlsOpen(false);
            resetJoystick();
            input.boost = false;
            sendInputNow();
        }
    };

    const resetJoystick = function () {
        joystickPointerId = null;
        input.up = false;
        input.down = false;
        input.left = false;
        input.right = false;
        if (joystickKnob) {
            joystickKnob.style.transform = 'translate(0, 0)';
        }
        sendInputNow();
    };

    const updateJoystickInput = function (clientX, clientY) {
        if (!joystick || !joystickKnob) {
            return;
        }
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const screenX = clientX - centerX;
        const screenY = clientY - centerY;
        const rawX = isFullscreenMode ? screenY : screenX;
        const rawY = isFullscreenMode ? -screenX : screenY;
        const maxRadius = rect.width * 0.28;
        const magnitude = Math.hypot(rawX, rawY);
        const limitedRatio = magnitude > maxRadius && magnitude > 0 ? maxRadius / magnitude : 1;
        const limitedX = rawX * limitedRatio;
        const limitedY = rawY * limitedRatio;
        const normalizedX = maxRadius > 0 ? limitedX / maxRadius : 0;
        const normalizedY = maxRadius > 0 ? limitedY / maxRadius : 0;
        const threshold = 0.34;

        joystickKnob.style.transform = 'translate(' + limitedX + 'px, ' + limitedY + 'px)';
        input.left = normalizedX < -threshold;
        input.right = normalizedX > threshold;
        input.up = normalizedY < -threshold;
        input.down = normalizedY > threshold;
        sendInputNow();
    };

    const getSpatialVolume = function (listenerPlayer, emitterPlayer, maxVolume) {
        if (!listenerPlayer || !emitterPlayer) {
            return maxVolume;
        }

        const distance = Math.hypot(emitterPlayer.x - listenerPlayer.x, emitterPlayer.y - listenerPlayer.y);
        if (distance >= soundHearingRadius) {
            return 0;
        }

        const distanceRatio = 1 - distance / soundHearingRadius;
        return maxVolume * distanceRatio * distanceRatio;
    };

    const stopPlayerSound = function (playerId) {
        const activeSound = activePlayerSounds.get(playerId);
        if (!activeSound) {
            return;
        }

        if (activeSound.kind === 'audio' && activeSound.audio) {
            try {
                activeSound.audio.pause();
                activeSound.audio.currentTime = 0;
            } catch (error) {}
        }

        if (activeSound.kind === 'buffer' && activeSound.source) {
            try {
                activeSound.source.stop(0);
            } catch (error) {}
        }

        activePlayerSounds.delete(playerId);
    };

    const getEffectiveVolume = function (volume) {
        const normalizedVolume = typeof volume === 'number' ? volume : 1;
        return Math.max(0, Math.min(1, normalizedVolume * masterVolume));
    };

    const playAudioFile = function (url, volume, playerId) {
        const effectiveVolume = getEffectiveVolume(volume);
        if (!url || effectiveVolume <= 0.01) {
            return;
        }

        stopPlayerSound(playerId);
        const sound = new window.Audio(url);
        sound.volume = effectiveVolume;
        activePlayerSounds.set(playerId, {
            kind: 'audio',
            audio: sound
        });
        sound.addEventListener('ended', function () {
            if (activePlayerSounds.get(playerId)?.audio === sound) {
                activePlayerSounds.delete(playerId);
            }
        });
        sound.play().catch(function () {});
    };

    const playRandomBoostSound = function (volume, playerId) {
        if (!boostSoundUrls.length) {
            return;
        }

        const selectedUrl = boostSoundUrls[Math.floor(Math.random() * boostSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.9, playerId);
    };

    const getAudioContext = function () {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            return null;
        }
        if (!audioContext) {
            audioContext = new AudioContextCtor();
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(function () {});
        }
        return audioContext;
    };

    const playRandomCrashSound = function (volume, playerId) {
        if (!crashSoundUrls.length) {
            return;
        }

        const selectedUrl = crashSoundUrls[Math.floor(Math.random() * crashSoundUrls.length)];
        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.95, playerId);
    };

    const playRandomDefeatSound = function (volume, playerId) {
        if (!defeatSoundUrls.length) {
            return;
        }

        const selectedUrl = defeatSoundUrls[Math.floor(Math.random() * defeatSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.95, playerId);
    };

    const playRandomNerTrackingSound = function (volume, playerId) {
        if (!nerTrackingSoundUrls.length) {
            return;
        }

        const selectedUrl = nerTrackingSoundUrls[Math.floor(Math.random() * nerTrackingSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.9, playerId);
    };

    const playRandomNerAccelerationSound = function (volume, playerId) {
        if (!nerAccelerationSoundUrls.length) {
            return;
        }

        const selectedUrl = nerAccelerationSoundUrls[Math.floor(Math.random() * nerAccelerationSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.95, playerId);
    };

    const processRemotePlayerSounds = function (players, listenerPlayer) {
        players.forEach(function (player) {
            const previousState = playerAudioStates.get(player.id) || {
                boostState: 'idle',
                collisionActive: false,
                collisionVisualType: 'win',
                npcState: ''
            };

            if (player.id !== selfId && player.isNpc) {
                const volume = getSpatialVolume(listenerPlayer, player, 0.95);

                if ((player.npcState || '') === 'chase' && previousState.npcState !== 'chase') {
                    playRandomNerTrackingSound(volume, player.id);
                }

                if ((player.npcState || '') === 'windup' && previousState.npcState !== 'windup') {
                    playRandomNerAccelerationSound(volume, player.id);
                }
            } else if (player.id !== selfId && !player.isNpc) {
                const volume = getSpatialVolume(listenerPlayer, player, 0.95);

                if (player.boostState === 'charging' && previousState.boostState !== 'charging') {
                    playRandomBoostSound(volume * 0.95, player.id);
                }

                if (player.collisionActive && !previousState.collisionActive) {
                    if (player.collisionVisualType === 'defeat') {
                        playRandomDefeatSound(volume, player.id);
                    } else {
                        playRandomCrashSound(volume, player.id);
                    }
                }
            }

            playerAudioStates.set(player.id, {
                boostState: player.boostState || 'idle',
                npcState: player.npcState || '',
                collisionActive: Boolean(player.collisionActive),
                collisionVisualType: player.collisionVisualType || 'win'
            });
        });

        playerAudioStates.forEach(function (_, id) {
            const stillExists = players.some(function (player) {
                return player.id === id;
            });
            if (!stillExists) {
                stopPlayerSound(id);
                playerAudioStates.delete(id);
            }
        });
    };

    const getPlayerVisual = function (id) {
        if (!playerVisuals.has(id)) {
            playerVisuals.set(id, {
                previousX: null,
                previousY: null,
                currentFlipX: 1,
                targetFlipX: 1,
                flipFromX: 1,
                flipProgress: 1,
                currentRotation: 0,
                targetRotation: 0
            });
        }
        return playerVisuals.get(id);
    };

    const normalizeAngle = function (angle) {
        let nextAngle = angle;
        while (nextAngle > Math.PI) {
            nextAngle -= Math.PI * 2;
        }
        while (nextAngle < -Math.PI) {
            nextAngle += Math.PI * 2;
        }
        return nextAngle;
    };

    const easeInOut = function (value) {
        return 0.5 - Math.cos(value * Math.PI) / 2;
    };

    const setVisualDirection = function (visual, dx, dy, options) {
        if (!visual) {
            return;
        }

        const usesLeftFacingSprite = Boolean(options && options.usesLeftFacingSprite);

        const movementMagnitude = Math.hypot(dx, dy);
        if (movementMagnitude < 0.001) {
            return;
        }

        if (Math.abs(dx) > 0.001) {
            const nextFlipX = usesLeftFacingSprite
                ? (dx < 0 ? 1 : -1)
                : (dx < 0 ? -1 : 1);
            if (visual.targetFlipX !== nextFlipX) {
                visual.flipFromX = visual.currentFlipX;
                visual.targetFlipX = nextFlipX;
                visual.flipProgress = 0;
            }
        }

        const baseRotation = Math.atan2(dy, Math.abs(dx));
        const logicalFlipX = usesLeftFacingSprite ? -visual.targetFlipX : visual.targetFlipX;
        visual.targetRotation = logicalFlipX < 0 ? -baseRotation : baseRotation;
    };

    const getPlayerDirectionVector = function (player, visual) {
        if (!player || !visual) {
            return { dx: 0, dy: 0 };
        }

        if (Boolean(player.isNpc) && typeof player.facingAngle === 'number') {
            return {
                dx: Math.cos(player.facingAngle),
                dy: Math.sin(player.facingAngle)
            };
        }

        const hasVelocity = typeof player.velocityX === 'number' && typeof player.velocityY === 'number';
        if (Boolean(player.isNpc) && hasVelocity) {
            const velocityMagnitude = Math.hypot(player.velocityX, player.velocityY);
            if (velocityMagnitude > 0.001) {
                return {
                    dx: player.velocityX,
                    dy: player.velocityY
                };
            }
        }

        if (player.id !== selfId && hasVelocity) {
            return {
                dx: player.velocityX,
                dy: player.velocityY
            };
        }

        return {
            dx: player.x - visual.previousX,
            dy: player.y - visual.previousY
        };
    };

    const updateVisualAnimation = function (visual, deltaSeconds) {
        if (!visual) {
            return;
        }

        const rotationDiff = normalizeAngle(visual.targetRotation - visual.currentRotation);
        const rotationStep = Math.min(1, rotationLerpPerSecond * deltaSeconds);
        visual.currentRotation = normalizeAngle(visual.currentRotation + rotationDiff * rotationStep);

        if (visual.flipProgress < 1) {
            visual.flipProgress = Math.min(1, visual.flipProgress + deltaSeconds / flipDurationSeconds);
            visual.currentFlipX =
                visual.flipFromX + (visual.targetFlipX - visual.flipFromX) * easeInOut(visual.flipProgress);
            return;
        }

        visual.currentFlipX += (visual.targetFlipX - visual.currentFlipX) * Math.min(1, 18 * deltaSeconds);
    };

    const updateMoveSpeed = function (deltaSeconds, inputVector) {
        const isMoving = inputVector.dx !== 0 || inputVector.dy !== 0;

        if (boostLockedActive) {
            input.boost = false;
            boostState = 'idle';
            boostDirectionX = 0;
            boostDirectionY = 0;
        }

        if (input.boost && !boostLockedActive && boostState === 'idle' && isMoving) {
            boostState = 'charging';
            boostDirectionX = inputVector.dx;
            boostDirectionY = inputVector.dy;
            playRandomBoostSound(undefined, selfId || '__self__');
        }

        if (boostState === 'charging') {
            currentMoveSpeed = Math.min(
                maxBoostedSpeedPerSecond,
                currentMoveSpeed + boostAccelerationPerSecond * deltaSeconds
            );
            if (currentMoveSpeed >= maxBoostedSpeedPerSecond) {
                boostState = 'cooldown';
            }
            return;
        }

        if (boostState === 'cooldown') {
            currentMoveSpeed = Math.max(
                basePlayerSpeedPerSecond,
                currentMoveSpeed - boostCooldownPerSecond * deltaSeconds
            );
            if (currentMoveSpeed <= basePlayerSpeedPerSecond) {
                currentMoveSpeed = basePlayerSpeedPerSecond;
                if (!input.boost) {
                    boostState = 'idle';
                    boostDirectionX = 0;
                    boostDirectionY = 0;
                }
            }
            return;
        }

        if (!isMoving) {
            currentMoveSpeed = Math.max(
                basePlayerSpeedPerSecond,
                currentMoveSpeed - boostCooldownPerSecond * deltaSeconds
            );
        } else {
            currentMoveSpeed = basePlayerSpeedPerSecond;
            boostDirectionX = 0;
            boostDirectionY = 0;
        }
    };

    const getSocketUrl = function (token) {
        const url = new URL(rawWsUrl, window.location.origin);
        if (token) {
            url.searchParams.set('token', token);
        }
        return url.toString();
    };

    const fetchGameToken = async function () {
        const response = await window.fetch(tokenUrl, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('token_request_failed');
        }

        const payload = await response.json();
        if (!payload || !payload.token) {
            throw new Error('token_missing');
        }

        return payload.token;
    };

    const stopInputLoop = function () {
        if (sendTimer !== null) {
            window.clearInterval(sendTimer);
            sendTimer = null;
        }
    };

    const stopPingLoop = function () {
        if (pingTimer !== null) {
            window.clearInterval(pingTimer);
            pingTimer = null;
        }
    };

    const startInputLoop = function () {
        stopInputLoop();
        sendTimer = window.setInterval(function () {
            if (!socket || socket.readyState !== window.WebSocket.OPEN) {
                return;
            }
            socket.send(JSON.stringify(input));
        }, 33);
    };

    const startPingLoop = function () {
        stopPingLoop();
        setPing(null);
        pingTimer = window.setInterval(function () {
            if (!socket || socket.readyState !== window.WebSocket.OPEN) {
                return;
            }
            socket.send(JSON.stringify({
                type: 'ping',
                sentAt: Date.now()
            }));
        }, 2000);
    };

    const sendInputNow = function () {
        if (!socket || socket.readyState !== window.WebSocket.OPEN) {
            return;
        }

        socket.send(JSON.stringify(input));
    };

    const scheduleReconnect = function () {
        if (reconnectAttemptInFlight) {
            return;
        }
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = async function () {
        if (reconnectAttemptInFlight) {
            return;
        }

        idleReconnectBlocked = false;
        reconnectAttemptInFlight = true;
        stopInputLoop();
        stopPingLoop();
        setPing(null);
        window.clearTimeout(reconnectTimer);

        if (socket) {
            suppressNextCloseReconnect = true;
            try {
                socket.close();
            } catch (error) {
                reconnectAttemptInFlight = false;
                return;
            }
        }

        setStatus(labels.connecting, '#c084fc');

        let token = '';
        try {
            token = await fetchGameToken();
        } catch (error) {
            setStatus(labels.disconnected, '#ef4444');
            reconnectAttemptInFlight = false;
            scheduleReconnect();
            return;
        }

        socket = new window.WebSocket(getSocketUrl(token));
        const nextSocket = socket;
        activeSocket = nextSocket;

        nextSocket.addEventListener('open', function () {
            if (nextSocket !== activeSocket) {
                return;
            }
            setIdleModalOpen(false);
            reconnectAttemptInFlight = false;
            setStatus(labels.connected, '#22c55e');
            startInputLoop();
            startPingLoop();
        });

        nextSocket.addEventListener('message', function (event) {
            if (nextSocket !== activeSocket) {
                return;
            }
            let payload = null;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                return;
            }

            if (payload && payload.type === 'welcome') {
                selfId = payload.id || '';
                if (selfIdNode) {
                    selfIdNode.textContent = selfId || playerName;
                }
                predictedSelf = {
                    id: selfId,
                    x: payload.x || worldSize / 2,
                    y: payload.y || worldSize / 2
                };
                renderedSelf = {
                    id: selfId,
                    x: predictedSelf.x,
                    y: predictedSelf.y
                };
                return;
            }

            if (payload && payload.type === 'pong') {
                if (typeof payload.sentAt === 'number' && payload.sentAt > 0) {
                    setPing(Math.max(0, Math.round(Date.now() - payload.sentAt)));
                }
                return;
            }

            if (Array.isArray(payload)) {
                const receivedAt = window.performance.now();
                serverPlayers = payload.map(function (player) {
                    return Object.assign({}, player, {
                        clientReceivedAt: receivedAt
                    });
                });
                if (playerCountNode) {
                    playerCountNode.textContent = String(payload.length);
                }
                const selfPlayer = payload.find(function (player) {
                    return player.id === selfId;
                });
                processRemotePlayerSounds(payload, selfPlayer || predictedSelf);
                if (selfPlayer) {
                    serverReportedMoveSpeed = typeof selfPlayer.currentSpeed === 'number'
                        ? selfPlayer.currentSpeed
                        : basePlayerSpeedPerSecond;
                    collisionRecoveryActive = Boolean(selfPlayer.collisionRecoveryActive);
                    boostLockedActive = Boolean(selfPlayer.boostLockedActive);
                    selfDeathActive = Boolean(selfPlayer.deathActive);
                    selfDeathRespawnReady = Boolean(selfPlayer.deathRespawnReady);
                    setDeathModalState(selfDeathActive, selfDeathRespawnReady);
                    if (defeatReceivedCountNode) {
                        defeatReceivedCountNode.textContent = String(selfPlayer.defeatReceivedCount || 0);
                    }
                    if (defeatDealtCountNode) {
                        defeatDealtCountNode.textContent = String(selfPlayer.defeatDealtCount || 0);
                    }
                    if (Boolean(selfPlayer.collisionActive) && !selfCollisionActive) {
                        if (selfPlayer.collisionVisualType === 'defeat') {
                            playRandomDefeatSound(undefined, selfId || '__self__');
                        } else {
                            playRandomCrashSound(undefined, selfId || '__self__');
                        }
                    }
                    selfCollisionActive = Boolean(selfPlayer.collisionActive);
                    selfCollisionVisualType = selfPlayer.collisionVisualType || 'win';
                    if (selfDeathActive) {
                        input.up = false;
                        input.down = false;
                        input.left = false;
                        input.right = false;
                        input.boost = false;
                        currentMoveSpeed = 0;
                        boostState = 'idle';
                        resetJoystick();
                    } else {
                        input.respawn = false;
                    }
                    if (collisionRecoveryActive || boostLockedActive) {
                        input.boost = false;
                        currentMoveSpeed = serverReportedMoveSpeed;
                        boostState = 'idle';
                    }
                    if (!predictedSelf) {
                        predictedSelf = {
                            id: selfPlayer.id,
                            x: selfPlayer.x,
                            y: selfPlayer.y
                        };
                        renderedSelf = {
                            id: selfPlayer.id,
                            x: selfPlayer.x,
                            y: selfPlayer.y
                        };
                    }
                }
            }
        });

        nextSocket.addEventListener('close', function (event) {
            if (nextSocket !== activeSocket) {
                return;
            }
            activeSocket = null;
            reconnectAttemptInFlight = false;
            setStatus(labels.disconnected, '#f97316');
            stopInputLoop();
            stopPingLoop();
            setPing(null);
            serverPlayers = [];
            renderPlayers = [];
            predictedSelf = null;
            renderedSelf = null;
            currentMoveSpeed = basePlayerSpeedPerSecond;
            serverReportedMoveSpeed = basePlayerSpeedPerSecond;
            collisionRecoveryActive = false;
            boostLockedActive = false;
            selfDeathActive = false;
            selfDeathRespawnReady = false;
            selfCollisionActive = false;
            selfCollisionVisualType = 'win';
            setDeathModalState(false, false);
            boostState = 'idle';
            if (defeatReceivedCountNode) {
                defeatReceivedCountNode.textContent = '0';
            }
            if (defeatDealtCountNode) {
                defeatDealtCountNode.textContent = '0';
            }
            stopPlayerSound(selfId || '__self__');
            playerAudioStates.clear();
            playerVisuals.clear();
            if (event && event.code === 4002) {
                idleReconnectBlocked = true;
                setStatus(labels.disconnected, '#ef4444');
                setIdleModalOpen(true);
            }
            if (suppressNextCloseReconnect) {
                suppressNextCloseReconnect = false;
                return;
            }
            if (idleReconnectBlocked) {
                return;
            }
            scheduleReconnect();
        });

        nextSocket.addEventListener('error', function () {
            if (nextSocket !== activeSocket) {
                return;
            }
            stopPingLoop();
            setPing(null);
            setStatus(labels.disconnected, '#ef4444');
        });
    };

    const resizeCanvas = function () {
        const nextWidth = Math.round(canvas.clientWidth || canvas.parentElement?.clientWidth || 960);
        const nextHeight = Math.round(canvas.clientHeight || canvas.parentElement?.clientHeight || 640);
        if (canvas.width === nextWidth && canvas.height === nextHeight) {
            return;
        }
        canvas.width = nextWidth;
        canvas.height = nextHeight;
    };

    const drawGrid = function (cameraX, cameraY, zoom) {
        const step = 50;
        ctx.strokeStyle = 'rgba(161, 138, 101, 0.14)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= worldSize; x += step) {
            const screenX = Math.round((x - cameraX) * zoom);
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, canvas.height);
            ctx.stroke();
        }

        for (let y = 0; y <= worldSize; y += step) {
            const screenY = Math.round((y - cameraY) * zoom);
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(canvas.width, screenY);
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(120, 91, 49, 0.72)';
        ctx.lineWidth = Math.max(3, 4 * zoom);
        ctx.strokeRect(
            Math.round(-cameraX * zoom),
            Math.round(-cameraY * zoom),
            Math.round(worldSize * zoom),
            Math.round(worldSize * zoom)
        );
    };

    const drawPlayers = function (cameraX, cameraY, deltaSeconds, zoom) {
        renderPlayers.forEach(function (player) {
            const x = (player.x - cameraX) * zoom;
            const y = (player.y - cameraY) * zoom;
            const isSelf = player.id === selfId;
            const isNpc = Boolean(player.isNpc);
            const visual = getPlayerVisual(player.id);
            const isBoostVisualActive = isSelf && currentMoveSpeed > basePlayerSpeedPerSecond;
            const isCollisionVisualActive = Boolean(player.collisionActive);
            const isDefeatVisualActive = isCollisionVisualActive && player.collisionVisualType === 'defeat';
            const isDeathVisualActive = Boolean(player.deathActive);
            const deathFadeProgress = typeof player.deathFadeProgress === 'number' ? player.deathFadeProgress : 0;
            const isNpcDeathAnimating = Boolean(player.npcDeathAnimating);
            const npcHealth = typeof player.npcHealth === 'number' ? player.npcHealth : npcMaxHealth;
            const collisionImpactX = typeof player.collisionImpactX === 'number' ? player.collisionImpactX : 0;
            const collisionImpactY = typeof player.collisionImpactY === 'number' ? player.collisionImpactY : 0;
            const npcChargeWindupProgress = typeof player.npcChargeWindupProgress === 'number'
                ? Math.max(0, Math.min(1, player.npcChargeWindupProgress))
                : 0;
            const npcBoostState = typeof player.boostState === 'string' ? player.boostState : 'idle';
            const npcState = player.npcState || '';
            const isNpcChargeVisualActive = isNpc && (npcChargeWindupProgress > 0 || npcBoostState === 'charging');
            const isNpcDefeatIconActive = isNpc && (isDeathVisualActive || isDefeatVisualActive);
            const spriteScale = isNpc
                ? (isNpcChargeVisualActive ? 2.0 : (isNpcDefeatIconActive ? 3.35 : 3.75))
                : 1;
            let activeIcon = playerIcon;
            let activeIconReady = playerIconReady;

            if (isNpc && (isDeathVisualActive || isDefeatVisualActive) && playerNpcDefeatIconReady) {
                activeIcon = playerNpcDefeatIcon;
                activeIconReady = playerNpcDefeatIconReady;
            } else if (isNpc && isNpcChargeVisualActive && playerNpcBoostIconReady) {
                activeIcon = playerNpcBoostIcon;
                activeIconReady = playerNpcBoostIconReady;
            } else if (isNpc && playerNpcIconReady) {
                activeIcon = playerNpcIcon;
                activeIconReady = playerNpcIconReady;
            } else if (isDeathVisualActive && playerDefeatIconReady) {
                activeIcon = playerDefeatIcon;
                activeIconReady = playerDefeatIconReady;
            } else if (isDefeatVisualActive && playerDefeatIconReady) {
                activeIcon = playerDefeatIcon;
                activeIconReady = playerDefeatIconReady;
            } else if (isCollisionVisualActive && playerCollisionIconReady) {
                activeIcon = playerCollisionIcon;
                activeIconReady = playerCollisionIconReady;
            } else if (isBoostVisualActive && playerBoostIconReady) {
                activeIcon = playerBoostIcon;
                activeIconReady = playerBoostIconReady;
            }

            updateVisualAnimation(visual, deltaSeconds);

            if (activeIconReady) {
                if (isNpc && isDeathVisualActive && !isNpcDeathAnimating) {
                    visual.previousX = player.x;
                    visual.previousY = player.y;
                    return;
                }
                const spriteHeight = playerSpriteHeight * spriteScale * zoom;
                const naturalWidth = activeIcon.naturalWidth || playerSpriteWidth;
                const naturalHeight = activeIcon.naturalHeight || playerSpriteHeight;
                const aspectRatio = naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
                const spriteWidth = spriteHeight * aspectRatio;
                const playerAlpha = isDeathVisualActive ? Math.max(0, 1 - deathFadeProgress) : 1;
                const dentAngle = Math.atan2(collisionImpactY, collisionImpactX) - visual.currentRotation;
                const dentLocalX = collisionImpactX === 0 && collisionImpactY === 0
                    ? 0
                    : Math.cos(dentAngle) * visual.currentFlipX;
                const dentLocalY = collisionImpactX === 0 && collisionImpactY === 0
                    ? 0
                    : Math.sin(dentAngle);
                ctx.save();
                ctx.globalAlpha = playerAlpha;
                ctx.translate(x, y);
                ctx.rotate(
                    visual.currentRotation +
                    (isNpcDeathAnimating ? Math.PI / 2 : 0)
                );
                ctx.scale(visual.currentFlipX, 1);
                ctx.drawImage(
                    activeIcon,
                    -spriteWidth / 2,
                    -spriteHeight / 2,
                    spriteWidth,
                    spriteHeight
                );
                if (isNpc && isDefeatVisualActive && npcTintContext) {
                    const tintWidth = Math.max(1, Math.round(spriteWidth));
                    const tintHeight = Math.max(1, Math.round(spriteHeight));
                    const impactX = tintWidth / 2 + dentLocalX * tintWidth * 0.34;
                    const impactY = tintHeight / 2 + dentLocalY * tintHeight * 0.34;
                    const impactRadius = Math.max(16, Math.min(tintWidth, tintHeight) * 0.22);
                    npcTintCanvas.width = tintWidth;
                    npcTintCanvas.height = tintHeight;
                    npcTintContext.clearRect(0, 0, tintWidth, tintHeight);
                    npcTintContext.drawImage(activeIcon, 0, 0, tintWidth, tintHeight);
                    npcTintContext.globalCompositeOperation = 'source-atop';
                    const impactGradient = npcTintContext.createRadialGradient(
                        impactX,
                        impactY,
                        0,
                        impactX,
                        impactY,
                        impactRadius
                    );
                    impactGradient.addColorStop(0, 'rgba(220, 38, 38, 0.72)');
                    impactGradient.addColorStop(0.55, 'rgba(239, 68, 68, 0.36)');
                    impactGradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
                    npcTintContext.fillStyle = impactGradient;
                    npcTintContext.fillRect(0, 0, tintWidth, tintHeight);
                    npcTintContext.globalCompositeOperation = 'source-over';
                    ctx.drawImage(
                        npcTintCanvas,
                        -spriteWidth / 2,
                        -spriteHeight / 2,
                        spriteWidth,
                        spriteHeight
                    );
                }
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.fillStyle = isSelf ? '#38bdf8' : '#f59e0b';
                ctx.arc(x, y, (isNpc ? 15 : (isSelf ? 13 : 10)) * zoom, 0, Math.PI * 2);
                ctx.fill();
            }

            if (!isNpc) {
                ctx.fillStyle = isDeathVisualActive
                    ? 'rgba(17, 24, 39, ' + Math.max(0, 0.92 * (1 - deathFadeProgress)) + ')'
                    : 'rgba(17, 24, 39, 0.92)';
                ctx.font = '13px Inter, Noto Sans KR, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(player.id, x, y - playerLabelOffset * zoom);
            } else if (!isDeathVisualActive || isNpcDeathAnimating) {
                const healthRatio = Math.max(0, Math.min(1, npcHealth / npcMaxHealth));
                const barWidth = Math.max(44, 76 * zoom);
                const barHeight = Math.max(6, 8 * zoom);
                const barX = x - barWidth / 2;
                const healthBarGap = isNpcChargeVisualActive ? 18 : 10;
                const barY = y - (playerSpriteHeight * spriteScale * zoom) / 2 - healthBarGap * zoom;

                ctx.fillStyle = 'rgba(17, 24, 39, 0.22)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = healthRatio > 0.6
                    ? '#22c55e'
                    : (healthRatio > 0.3 ? '#eab308' : '#ef4444');
                ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
                ctx.strokeStyle = 'rgba(17, 24, 39, 0.45)';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);
            }

            visual.previousX = player.x;
            visual.previousY = player.y;
        });
    };

    const drawMinimap = function () {
        const width = minimapCanvas.width;
        const height = minimapCanvas.height;
        const padding = 10;
        const drawableWidth = width - padding * 2;
        const drawableHeight = height - padding * 2;

        minimapCtx.clearRect(0, 0, width, height);

        minimapCtx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(padding, padding, drawableWidth, drawableHeight);

        renderPlayers.forEach(function (player) {
            const isSelf = player.id === selfId;
            if (player.isNpc && player.deathActive && !player.npcDeathAnimating) {
                return;
            }
            const x = padding + (player.x / worldSize) * drawableWidth;
            const y = padding + (player.y / worldSize) * drawableHeight;

            minimapCtx.beginPath();
            minimapCtx.fillStyle = isSelf ? '#38bdf8' : 'rgba(245, 158, 11, 0.95)';
            minimapCtx.arc(x, y, isSelf ? 4.5 : 3.2, 0, Math.PI * 2);
            minimapCtx.fill();
        });
    };

    const render = function () {
        const now = window.performance.now();
        const deltaSeconds = lastRenderTime ? Math.min((now - lastRenderTime) / 1000, 0.05) : 1 / 60;
        lastRenderTime = now;
        const remoteLerp = getFrameAdjustedLerp(remoteLerpPerFrame, deltaSeconds);
        const selfRenderLerp = getFrameAdjustedLerp(selfRenderLerpPerFrame, deltaSeconds);
        const selfReconcileLerp = getFrameAdjustedLerp(selfReconcilePerFrame, deltaSeconds);

        resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fbf6ed';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const effectiveZoom = getEffectiveZoom();

        const nextById = new Map();
        serverPlayers.forEach(function (player) {
            nextById.set(player.id, player);
        });

        let inputVector = getInputVector();
        if (selfDeathActive) {
            input.up = false;
            input.down = false;
            input.left = false;
            input.right = false;
            input.boost = false;
            inputVector = { dx: 0, dy: 0 };
            currentMoveSpeed = 0;
            boostState = 'idle';
        }
        if (collisionRecoveryActive || boostLockedActive) {
            input.boost = false;
            currentMoveSpeed = serverReportedMoveSpeed;
            boostState = 'idle';
        } else {
            updateMoveSpeed(deltaSeconds, inputVector);
        }
        const movementVector = (boostState === 'charging' || boostState === 'cooldown')
            ? { dx: boostDirectionX, dy: boostDirectionY }
            : inputVector;

        if (predictedSelf && selfId) {
            const authoritativeSelf = nextById.get(selfId);
            if (selfDeathActive && authoritativeSelf) {
                predictedSelf.x = authoritativeSelf.x;
                predictedSelf.y = authoritativeSelf.y;
            } else {
                predictedSelf.x = clampToWorld(predictedSelf.x + movementVector.dx * currentMoveSpeed * deltaSeconds);
                predictedSelf.y = clampToWorld(predictedSelf.y + movementVector.dy * currentMoveSpeed * deltaSeconds);
            }

            if (authoritativeSelf) {
                const diffX = authoritativeSelf.x - predictedSelf.x;
                const diffY = authoritativeSelf.y - predictedSelf.y;
                const diffDistance = Math.hypot(diffX, diffY);

                if (diffDistance > selfSnapDistance) {
                    predictedSelf.x = authoritativeSelf.x;
                    predictedSelf.y = authoritativeSelf.y;
                } else if (diffDistance > selfIgnoreDistance) {
                    predictedSelf.x += diffX * selfReconcileLerp;
                    predictedSelf.y += diffY * selfReconcileLerp;
                }
            }
        }

        renderPlayers = renderPlayers.filter(function (player) {
            return nextById.has(player.id) || player.id === selfId;
        });
        playerVisuals.forEach(function (_, id) {
            if (!nextById.has(id) && id !== selfId) {
                playerVisuals.delete(id);
            }
        });

        nextById.forEach(function (serverPlayer, id) {
            const current = renderPlayers.find(function (player) {
                return player.id === id;
            });

            if (id === selfId && predictedSelf) {
                if (!renderedSelf) {
                    renderedSelf = {
                        id: predictedSelf.id,
                        x: predictedSelf.x,
                        y: predictedSelf.y
                    };
                } else {
                    renderedSelf.x += (predictedSelf.x - renderedSelf.x) * selfRenderLerp;
                    renderedSelf.y += (predictedSelf.y - renderedSelf.y) * selfRenderLerp;
                }

                if (current) {
                    current.x = renderedSelf.x;
                    current.y = renderedSelf.y;
                    current.velocityX = typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0;
                    current.velocityY = typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0;
                    current.facingAngle = typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0;
                    current.collisionActive = Boolean(serverPlayer.collisionActive);
                    current.npcState = serverPlayer.npcState || '';
                    current.collisionVisualType = serverPlayer.collisionVisualType || 'win';
                    current.collisionImpactX = typeof serverPlayer.collisionImpactX === 'number' ? serverPlayer.collisionImpactX : 0;
                    current.collisionImpactY = typeof serverPlayer.collisionImpactY === 'number' ? serverPlayer.collisionImpactY : 0;
                    current.deathActive = Boolean(serverPlayer.deathActive);
                    current.deathFadeProgress = typeof serverPlayer.deathFadeProgress === 'number'
                        ? serverPlayer.deathFadeProgress
                        : 0;
                    current.npcDeathAnimating = Boolean(serverPlayer.npcDeathAnimating);
                    current.npcHealth = typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null;
                    current.boostState = serverPlayer.boostState || 'idle';
                    current.npcChargeWindupProgress = typeof serverPlayer.npcChargeWindupProgress === 'number'
                        ? serverPlayer.npcChargeWindupProgress
                        : 0;
                } else {
                    renderPlayers.push({
                        id: renderedSelf.id,
                        x: renderedSelf.x,
                        y: renderedSelf.y,
                        velocityX: typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0,
                        velocityY: typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0,
                        facingAngle: typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0,
                        isNpc: Boolean(serverPlayer.isNpc),
                        npcState: serverPlayer.npcState || '',
                        collisionActive: Boolean(serverPlayer.collisionActive),
                        collisionVisualType: serverPlayer.collisionVisualType || 'win',
                        collisionImpactX: typeof serverPlayer.collisionImpactX === 'number' ? serverPlayer.collisionImpactX : 0,
                        collisionImpactY: typeof serverPlayer.collisionImpactY === 'number' ? serverPlayer.collisionImpactY : 0,
                        deathActive: Boolean(serverPlayer.deathActive),
                        deathFadeProgress: typeof serverPlayer.deathFadeProgress === 'number'
                            ? serverPlayer.deathFadeProgress
                            : 0,
                        npcDeathAnimating: Boolean(serverPlayer.npcDeathAnimating),
                        npcHealth: typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null,
                        boostState: serverPlayer.boostState || 'idle',
                        npcChargeWindupProgress: typeof serverPlayer.npcChargeWindupProgress === 'number'
                            ? serverPlayer.npcChargeWindupProgress
                            : 0,
                    });
                }
                return;
            }

            const packetAgeSeconds = Math.min(
                0.12,
                Math.max(0, (now - (serverPlayer.clientReceivedAt || now)) / 1000)
            );
            const remoteProjectionSeconds = remoteRenderDelaySeconds + packetAgeSeconds;
            const delayedTargetX = clampToWorld(
                serverPlayer.x + ((typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0) * remoteProjectionSeconds)
            );
            const delayedTargetY = clampToWorld(
                serverPlayer.y + ((typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0) * remoteProjectionSeconds)
            );

            if (current) {
                current.targetX = delayedTargetX;
                current.targetY = delayedTargetY;
                current.x += (current.targetX - current.x) * remoteLerp;
                current.y += (current.targetY - current.y) * remoteLerp;
                current.velocityX = typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0;
                current.velocityY = typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0;
                current.facingAngle = typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0;
                current.isNpc = Boolean(serverPlayer.isNpc);
                current.npcState = serverPlayer.npcState || '';
                current.collisionActive = Boolean(serverPlayer.collisionActive);
                current.collisionVisualType = serverPlayer.collisionVisualType || 'win';
                current.collisionImpactX = typeof serverPlayer.collisionImpactX === 'number' ? serverPlayer.collisionImpactX : 0;
                current.collisionImpactY = typeof serverPlayer.collisionImpactY === 'number' ? serverPlayer.collisionImpactY : 0;
                current.deathActive = Boolean(serverPlayer.deathActive);
                current.deathFadeProgress = typeof serverPlayer.deathFadeProgress === 'number'
                    ? serverPlayer.deathFadeProgress
                    : 0;
                current.npcDeathAnimating = Boolean(serverPlayer.npcDeathAnimating);
                current.npcHealth = typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null;
                current.boostState = serverPlayer.boostState || 'idle';
                current.npcChargeWindupProgress = typeof serverPlayer.npcChargeWindupProgress === 'number'
                    ? serverPlayer.npcChargeWindupProgress
                    : 0;
            } else {
                renderPlayers.push({
                    id: serverPlayer.id,
                    x: delayedTargetX,
                    y: delayedTargetY,
                    targetX: delayedTargetX,
                    targetY: delayedTargetY,
                    velocityX: typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0,
                    velocityY: typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0,
                    facingAngle: typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0,
                    isNpc: Boolean(serverPlayer.isNpc),
                    npcState: serverPlayer.npcState || '',
                    collisionActive: Boolean(serverPlayer.collisionActive),
                    collisionVisualType: serverPlayer.collisionVisualType || 'win',
                    collisionImpactX: typeof serverPlayer.collisionImpactX === 'number' ? serverPlayer.collisionImpactX : 0,
                    collisionImpactY: typeof serverPlayer.collisionImpactY === 'number' ? serverPlayer.collisionImpactY : 0,
                    deathActive: Boolean(serverPlayer.deathActive),
                    deathFadeProgress: typeof serverPlayer.deathFadeProgress === 'number'
                        ? serverPlayer.deathFadeProgress
                        : 0,
                    npcDeathAnimating: Boolean(serverPlayer.npcDeathAnimating),
                    npcHealth: typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null,
                    boostState: serverPlayer.boostState || 'idle',
                    npcChargeWindupProgress: typeof serverPlayer.npcChargeWindupProgress === 'number'
                        ? serverPlayer.npcChargeWindupProgress
                        : 0,
                });
            }
        });

        if (predictedSelf && selfPositionNode) {
            selfPositionNode.textContent = Math.round(predictedSelf.x) + ', ' + Math.round(predictedSelf.y);
        } else if (selfPositionNode) {
            selfPositionNode.textContent = '-';
        }

        renderPlayers.forEach(function (player) {
            const visual = getPlayerVisual(player.id);
            const directionVector = getPlayerDirectionVector(player, visual);
            if (visual.previousX === null || visual.previousY === null) {
                visual.previousX = player.x;
                visual.previousY = player.y;
                setVisualDirection(visual, directionVector.dx, directionVector.dy, {
                    usesLeftFacingSprite: Boolean(player.isNpc)
                });
                return;
            }

            setVisualDirection(visual, directionVector.dx, directionVector.dy, {
                usesLeftFacingSprite: Boolean(player.isNpc)
            });
        });

        const selfPlayer = renderPlayers.find(function (player) {
            return player.id === selfId;
        }) || renderPlayers[0] || { x: worldSize / 2, y: worldSize / 2 };
        const targetCameraX = selfPlayer.x - canvas.width / (2 * effectiveZoom);
        const targetCameraY = selfPlayer.y - canvas.height / (2 * effectiveZoom);
        cameraX += (targetCameraX - cameraX) * cameraFollow;
        cameraY += (targetCameraY - cameraY) * cameraFollow;

        drawGrid(cameraX, cameraY, effectiveZoom);
        drawPlayers(cameraX, cameraY, deltaSeconds, effectiveZoom);
        drawMinimap();
        window.requestAnimationFrame(render);
    };

    const handleKey = function (value) {
        return function (event) {
            if (event.key === ' ') {
                event.preventDefault();
                if (collisionRecoveryActive || boostLockedActive) {
                    input.boost = false;
                    sendInputNow();
                    return;
                }
                input.boost = value;
                if (!value && boostState === 'cooldown' && currentMoveSpeed <= basePlayerSpeedPerSecond) {
                    boostState = 'idle';
                }
                sendInputNow();
                return;
            }

            const mapped = keyMap[event.key];
            if (!mapped) {
                return;
            }
            event.preventDefault();
            input[mapped] = value;
            sendInputNow();
        };
    };

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));
    if (masterVolumeSlider) {
        masterVolume = Math.max(0, Math.min(1, Number(masterVolumeSlider.value || 35) / 100));
        masterVolumeSlider.addEventListener('input', function () {
            masterVolume = Math.max(0, Math.min(1, Number(masterVolumeSlider.value || 0) / 100));
        });
    }
    reconnectButton.addEventListener('click', connect);
    if (deathModalRespawnButton) {
        deathModalRespawnButton.addEventListener('click', function () {
            if (!selfDeathActive || !selfDeathRespawnReady) {
                return;
            }

            if (!socket || socket.readyState !== window.WebSocket.OPEN) {
                return;
            }

            input.respawn = true;
            sendInputNow();
        });
    }
    if (fullscreenToggle) {
        fullscreenToggle.addEventListener('click', function () {
            setFullscreenMode(true);
        });
    }
    if (fullscreenExitButton) {
        fullscreenExitButton.addEventListener('click', function () {
            setFullscreenMode(false);
        });
    }
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && isFullscreenMode) {
            event.preventDefault();
            setFullscreenMode(false);
        }
    });
    if (mobileControlsToggle) {
        mobileControlsToggle.addEventListener('click', function () {
            setMobileControlsOpen(true);
        });
    }
    if (joystick) {
        joystick.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            joystickPointerId = event.pointerId;
            if (joystick.setPointerCapture) {
                joystick.setPointerCapture(event.pointerId);
            }
            updateJoystickInput(event.clientX, event.clientY);
        });
        joystick.addEventListener('pointermove', function (event) {
            if (event.pointerId !== joystickPointerId) {
                return;
            }
            event.preventDefault();
            updateJoystickInput(event.clientX, event.clientY);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (eventName) {
            joystick.addEventListener(eventName, function (event) {
                if (event.pointerId !== undefined && joystickPointerId !== null && event.pointerId !== joystickPointerId && eventName !== 'lostpointercapture') {
                    return;
                }
                resetJoystick();
            });
        });
    }
    if (mobileBoostButton) {
        const setBoostState = function (value) {
            if (collisionRecoveryActive || boostLockedActive) {
                input.boost = false;
                sendInputNow();
                return;
            }
            input.boost = value;
            if (!value && boostState === 'cooldown' && currentMoveSpeed <= basePlayerSpeedPerSecond) {
                boostState = 'idle';
            }
            sendInputNow();
        };
        mobileBoostButton.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            setBoostState(true);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (eventName) {
            mobileBoostButton.addEventListener(eventName, function (event) {
                event.preventDefault();
                setBoostState(false);
            });
        });
    }
    if (idleModalCloseButton) {
        idleModalCloseButton.addEventListener('click', function () {
            setIdleModalOpen(false);
            connect();
        });
    }

    connect();
    render();
})();
