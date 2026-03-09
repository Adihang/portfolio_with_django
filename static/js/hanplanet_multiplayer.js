(function () {
    'use strict';

    const root = document.querySelector('[data-game-client]');
    if (!root) {
        return;
    }

    const canvas = root.querySelector('[data-game-canvas]');
    const minimapCanvas = root.querySelector('[data-game-minimap]');
    const startOverlay = root.querySelector('[data-game-start-overlay]');
    const startButton = root.querySelector('[data-game-start]');
    const loadingOverlay = root.querySelector('[data-game-loading-overlay]');
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
    const deathModalTitleNode = root.querySelector('[data-game-death-modal-title]');
    const deathModalRespawnButton = root.querySelector('[data-game-death-modal-respawn]');
    const deathModalSpectateWrap = root.querySelector('[data-game-death-modal-spectate]');
    const deathModalSpectatePrevButton = root.querySelector('[data-game-death-modal-spectate-prev]');
    const deathModalSpectateNextButton = root.querySelector('[data-game-death-modal-spectate-next]');
    const deathModalSpectateLabel = root.querySelector('[data-game-death-modal-spectate-label]');
    const pingNode = root.querySelector('[data-game-ping]');
    const sharedLivesNode = root.querySelector('[data-game-shared-lives]');
    const sharedLivesCountNode = root.querySelector('[data-game-shared-lives-count]');
    const masterVolumeSlider = root.querySelector('[data-game-master-volume]');
    const spriteOverlayRoot = root.querySelector('[data-game-sprite-overlay]');
    const idleModal = document.querySelector('[data-game-idle-modal]');
    const idleModalCloseButton = idleModal ? idleModal.querySelector('[data-game-idle-modal-close]') : null;

    if (!canvas || !minimapCanvas || !connectionStatus) {
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
    const deathTitleLabel = root.getAttribute('data-death-title-label') || 'You\'ve been Nered!';
    const deathGameOverTitleLabel = root.getAttribute('data-death-game-over-title-label') || 'Spiky tried hard......';
    const deathRespawnLabel = root.getAttribute('data-death-respawn-label') || 'Respawn';
    const deathNoLivesLabel = root.getAttribute('data-death-no-lives-label') || 'No Lives Left';
    const deathSpectateEmptyLabel = root.getAttribute('data-death-spectate-empty-label') || 'No players to spectate';
    const playerName = root.getAttribute('data-player-name') || 'Player';
    const playerIconUrl = root.getAttribute('data-player-icon-url') || '';
    const playerNpcIconUrl = root.getAttribute('data-player-npc-icon-url') || '';
    const playerNpcPhase2IconUrl = root.getAttribute('data-player-npc-phase2-icon-url') || '';
    const playerNpcPhase3IconUrl = root.getAttribute('data-player-npc-phase3-icon-url') || '';
    const playerNpcBoostIconUrl = root.getAttribute('data-player-npc-boost-icon-url') || '';
    const playerNpcDefeat1IconUrl = root.getAttribute('data-player-npc-defeat1-icon-url') || '';
    const playerNpcDefeat2IconUrl = root.getAttribute('data-player-npc-defeat2-icon-url') || '';
    const playerNpcDieIconUrl = root.getAttribute('data-player-npc-die-icon-url') || '';
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
    const dieSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-die-sound-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const respawnSoundUrls = (function () {
        const rawValue = root.getAttribute('data-player-respawn-sound-urls') || '[]';
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
    const nerWinIconUrls = (function () {
        const rawValue = root.getAttribute('data-player-ner-win-icon-urls') || '[]';
        try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            return [];
        }
    })();
    const rawWsUrl = root.getAttribute('data-ws-url') || '';
    const tokenUrl = root.getAttribute('data-token-url') || '';
    const gameplaySettings = (function () {
        const rawValue = root.getAttribute('data-gameplay-settings') || '{}';
        try {
            const parsed = JSON.parse(rawValue);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    })();
    const worldSize = 2000;
    const basePlayerSpeedPerSecond = Number(gameplaySettings.user_base_speed || 225);
    const npcBaseSpeedPerSecond = Number(gameplaySettings.npc_base_speed || 281.25);
    const maxBoostedSpeedPerSecond = Number(gameplaySettings.user_max_boost_speed || 420);
    const boostAccelerationPerSecond = Number(gameplaySettings.user_boost_acceleration || 360);
    const boostCooldownPerSecond = Number(gameplaySettings.user_boost_cooldown || 280);
    const npcMaxHealth = Number(gameplaySettings.npc_max_health || 20);
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
    const smallPlayerSpriteThresholdPx = 26;
    const renderOverscan = 2;
    const cameraDeadZoneRatioX = 0.16;
    const cameraDeadZoneRatioY = 0.2;
    const cameraLeadRatioX = 0.12;
    const cameraLeadRatioY = 0.14;
    const cameraLeadSpeedThreshold = 18;
    const remoteRenderDelaySeconds = 0.06;
    const referenceCanvasWidth = 960;
    const referenceCanvasHeight = 640;
    const rotationLerpPerSecond = 14;
    const flipDurationSeconds = 0.18;
    const soundHearingRadius = 560;
    const inputSendIntervalMs = 66;
    const inputHeartbeatMs = 150;
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
    let gameStarted = false;
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
    let selfLivesRemaining = Math.max(1, Number(gameplaySettings.user_lives || 3));
    let roundResetAnnouncementActive = false;
    let roundResetAnnouncementLatched = false;
    let respawnRequestPending = false;
    let manualStartAutoRespawnPending = false;
    let spectateTargetId = '';
    let selfCollisionActive = false;
    let selfCollisionVisualType = 'win';
    let lastSentInputSignature = '';
    let lastSentInputAt = 0;
    let audioContext = null;
    let masterVolume = 0.2;
    const playerAudioStates = new Map();
    const activePlayerSounds = new Map();
    const playerVisuals = new Map();
    const spriteOverlayNodes = new Map();
    let canvasScale = 1;
    const animatedAssetDock = window.document.createElement('div');
    const npcTintCanvas = window.document.createElement('canvas');
    const npcTintContext = npcTintCanvas.getContext('2d');
    const playerIcon = new window.Image();
    const playerNpcIcon = new window.Image();
    const playerNpcPhase2Icon = new window.Image();
    const playerNpcPhase3Icon = new window.Image();
    const playerNpcBoostIcon = new window.Image();
    const playerNpcDefeat1Icon = new window.Image();
    const playerNpcDefeat2Icon = new window.Image();
    const playerNpcDieIcon = new window.Image();
    const playerNpcWinIcons = nerWinIconUrls.map(function (url) {
        return {
            image: new window.Image(),
            ready: false,
            url: url
        };
    });
    const playerBoostIcon = new window.Image();
    const playerCollisionIcon = new window.Image();
    const playerDefeatIcon = new window.Image();
    let playerIconReady = false;
    let playerNpcIconReady = false;
    let playerNpcPhase2IconReady = false;
    let playerNpcPhase3IconReady = false;
    let playerNpcBoostIconReady = false;
    let playerNpcDefeat1IconReady = false;
    let playerNpcDefeat2IconReady = false;
    let playerNpcDieIconReady = false;
    let playerBoostIconReady = false;
    let playerCollisionIconReady = false;
    let playerDefeatIconReady = false;

    animatedAssetDock.setAttribute('aria-hidden', 'true');
    animatedAssetDock.style.position = 'fixed';
    animatedAssetDock.style.left = '0';
    animatedAssetDock.style.top = '0';
    animatedAssetDock.style.width = '36px';
    animatedAssetDock.style.height = '36px';
    animatedAssetDock.style.overflow = 'hidden';
    animatedAssetDock.style.opacity = '0.001';
    animatedAssetDock.style.pointerEvents = 'none';
    animatedAssetDock.style.zIndex = '1';
    animatedAssetDock.style.borderRadius = '999px';
    animatedAssetDock.style.clipPath = 'inset(0 0 0 0 round 999px)';
    window.document.body.appendChild(animatedAssetDock);

    const bindImage = function (image, src, onReadyChange) {
        if (!src) {
            return;
        }
        if (/\.gif(?:\?|$)/i.test(src) && !image.isConnected) {
            image.setAttribute('aria-hidden', 'true');
            image.style.position = 'static';
            image.style.display = 'block';
            image.style.width = '36px';
            image.style.height = '36px';
            image.style.objectFit = 'contain';
            image.style.opacity = '1';
            image.style.pointerEvents = 'none';
            image.decoding = 'sync';
            image.loading = 'eager';
            animatedAssetDock.appendChild(image);
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

    const isAnimatedGifIcon = function (icon) {
        const src = String((icon && (icon.currentSrc || icon.src)) || '');
        return /\.gif(?:\?|$)/i.test(src);
    };

    const getSpriteOverlayNode = function (playerId) {
        if (!spriteOverlayRoot) {
            return null;
        }
        let node = spriteOverlayNodes.get(playerId);
        if (node) {
            return node;
        }
        node = window.document.createElement('img');
        node.className = 'multiplayer-sprite-overlay-item';
        node.alt = '';
        node.decoding = 'sync';
        node.loading = 'eager';
        spriteOverlayRoot.appendChild(node);
        spriteOverlayNodes.set(playerId, node);
        return node;
    };

    const hideSpriteOverlayNode = function (playerId) {
        const node = spriteOverlayNodes.get(playerId);
        if (!node) {
            return;
        }
        node.style.display = 'none';
    };

    bindImage(playerIcon, playerIconUrl, function (ready) {
        playerIconReady = ready;
    });
    bindImage(playerNpcIcon, playerNpcIconUrl, function (ready) {
        playerNpcIconReady = ready;
    });
    bindImage(playerNpcPhase2Icon, playerNpcPhase2IconUrl, function (ready) {
        playerNpcPhase2IconReady = ready;
    });
    bindImage(playerNpcPhase3Icon, playerNpcPhase3IconUrl, function (ready) {
        playerNpcPhase3IconReady = ready;
    });
    bindImage(playerNpcBoostIcon, playerNpcBoostIconUrl, function (ready) {
        playerNpcBoostIconReady = ready;
    });
    bindImage(playerNpcDefeat1Icon, playerNpcDefeat1IconUrl, function (ready) {
        playerNpcDefeat1IconReady = ready;
    });
    bindImage(playerNpcDefeat2Icon, playerNpcDefeat2IconUrl, function (ready) {
        playerNpcDefeat2IconReady = ready;
    });
    bindImage(playerNpcDieIcon, playerNpcDieIconUrl, function (ready) {
        playerNpcDieIconReady = ready;
    });
    playerNpcWinIcons.forEach(function (entry) {
        bindImage(entry.image, entry.url, function (ready) {
            entry.ready = ready;
        });
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

    const getCanvasDisplayWidth = function () {
        return canvas.width > 0 ? (canvas.width / canvasScale) : (canvas.clientWidth || 960);
    };

    const getCanvasDisplayHeight = function () {
        return canvas.height > 0 ? (canvas.height / canvasScale) : (canvas.clientHeight || 640);
    };

    const getViewportDisplayWidth = function () {
        return isFullscreenMode ? getCanvasDisplayHeight() : getCanvasDisplayWidth();
    };

    const getViewportDisplayHeight = function () {
        return isFullscreenMode ? getCanvasDisplayWidth() : getCanvasDisplayHeight();
    };

    const getEffectiveZoom = function () {
        const displayWidth = getCanvasDisplayWidth();
        const displayHeight = getCanvasDisplayHeight();
        const canvasArea = displayWidth > 0 && displayHeight > 0
            ? displayWidth * displayHeight
            : referenceCanvasWidth * referenceCanvasHeight;
        const referenceArea = referenceCanvasWidth * referenceCanvasHeight;
        const canvasScale = Math.sqrt(canvasArea / referenceArea);
        const activeViewZoom = isFullscreenMode ? viewZoom : (viewZoom * 0.82);
        const scaledZoom = (activeViewZoom / renderOverscan) * Math.max(canvasScale, 0.35);
        const minWorldFitZoom = Math.max(
            displayWidth / worldSize,
            displayHeight / worldSize,
            0.35
        );
        return Math.max(scaledZoom, minWorldFitZoom);
    };

    const buildInputSignature = function () {
        return JSON.stringify(input);
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

    const handleIdleTimeoutDisconnect = function () {
        idleReconnectBlocked = true;
        serverPlayers = [];
        renderPlayers = [];
        lastSentInputSignature = '';
        lastSentInputAt = 0;
        predictedSelf = null;
        renderedSelf = null;
        currentMoveSpeed = basePlayerSpeedPerSecond;
        serverReportedMoveSpeed = basePlayerSpeedPerSecond;
        collisionRecoveryActive = false;
        boostLockedActive = false;
        selfDeathActive = false;
        selfDeathRespawnReady = false;
        selfLivesRemaining = Math.max(1, Number(gameplaySettings.user_lives || 3));
        roundResetAnnouncementActive = false;
        roundResetAnnouncementLatched = false;
        respawnRequestPending = false;
        manualStartAutoRespawnPending = false;
        selfCollisionActive = false;
        selfCollisionVisualType = 'win';
        spectateTargetId = '';
        setSharedLives(selfLivesRemaining);
        setDeathModalState(false, false, selfLivesRemaining);
        boostState = 'idle';
        if (defeatReceivedCountNode) {
            defeatReceivedCountNode.textContent = '0';
        }
        if (defeatDealtCountNode) {
            defeatDealtCountNode.textContent = '0';
        }
        setStatus(labels.disconnected, '#ef4444');
        setIdleModalOpen(true);
    };

    const setStartOverlayOpen = function (opened) {
        if (!startOverlay) {
            return;
        }
        startOverlay.hidden = !opened;
    };

    const setLoadingOverlayOpen = function (opened) {
        if (!loadingOverlay) {
            return;
        }
        loadingOverlay.hidden = !opened;
    };

    const getSpectatablePlayers = function () {
        return renderPlayers.filter(function (player) {
            return !player.isNpc && player.id !== selfId && !player.deathActive;
        });
    };

    const syncSpectateTarget = function () {
        const spectatablePlayers = getSpectatablePlayers();
        if (!spectatablePlayers.length) {
            spectateTargetId = '';
            return spectatablePlayers;
        }
        const hasCurrentTarget = spectatablePlayers.some(function (player) {
            return player.id === spectateTargetId;
        });
        if (!hasCurrentTarget) {
            spectateTargetId = spectatablePlayers[0].id;
        }
        return spectatablePlayers;
    };

    const cycleSpectateTarget = function (direction) {
        const spectatablePlayers = syncSpectateTarget();
        if (!spectatablePlayers.length) {
            return;
        }
        const currentIndex = spectatablePlayers.findIndex(function (player) {
            return player.id === spectateTargetId;
        });
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (safeIndex + direction + spectatablePlayers.length) % spectatablePlayers.length;
        spectateTargetId = spectatablePlayers[nextIndex].id;
    };

    const setDeathModalState = function (opened, respawnReady, livesRemaining) {
        if (!deathModal) {
            return;
        }

        const safeLivesRemaining = Math.max(0, Number(livesRemaining || 0));
        const spectatablePlayers = syncSpectateTarget();
        const canSpectate = opened && safeLivesRemaining <= 0 && spectatablePlayers.length > 0;
        const shouldHideForRespawn = respawnRequestPending && opened && respawnReady && safeLivesRemaining > 0;
        deathModal.hidden = !opened || shouldHideForRespawn;
        if (opened && roundResetAnnouncementActive) {
            roundResetAnnouncementLatched = true;
        }
        if (deathModalTitleNode) {
            deathModalTitleNode.textContent = (opened && roundResetAnnouncementLatched)
                ? deathGameOverTitleLabel
                : deathTitleLabel;
        }
        if (deathModalRespawnButton) {
            if (!opened) {
                deathModalRespawnButton.textContent = deathRespawnLabel;
            } else {
                deathModalRespawnButton.textContent = safeLivesRemaining > 0 ? deathRespawnLabel : deathNoLivesLabel;
            }
            deathModalRespawnButton.hidden = canSpectate;
            deathModalRespawnButton.disabled = !respawnReady || safeLivesRemaining <= 0;
        }
        if (deathModalSpectateWrap) {
            deathModalSpectateWrap.hidden = !canSpectate;
        }
        if (deathModalSpectateLabel) {
            deathModalSpectateLabel.textContent = canSpectate
                ? (spectatablePlayers.find(function (player) { return player.id === spectateTargetId; }) || spectatablePlayers[0]).id
                : deathSpectateEmptyLabel;
        }
        if (deathModalSpectatePrevButton) {
            deathModalSpectatePrevButton.disabled = !canSpectate || spectatablePlayers.length <= 1;
        }
        if (deathModalSpectateNextButton) {
            deathModalSpectateNextButton.disabled = !canSpectate || spectatablePlayers.length <= 1;
        }
        if (!opened || !respawnReady || safeLivesRemaining <= 0) {
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

    const setSharedLives = function (value) {
        if (!sharedLivesCountNode) {
            return;
        }
        const safeLives = Math.max(0, Number(value || 0));
        sharedLivesCountNode.textContent = 'x ' + safeLives;
    };
    setSharedLives(selfLivesRemaining);

    const syncFullscreenViewportSize = function () {
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        if (isFullscreenMode) {
            root.style.setProperty('--multiplayer-mobile-vw', viewportWidth + 'px');
            root.style.setProperty('--multiplayer-mobile-vh', viewportHeight + 'px');
        } else {
            root.style.removeProperty('--multiplayer-mobile-vw');
            root.style.removeProperty('--multiplayer-mobile-vh');
        }
    };

    const setFullscreenMode = function (enabled) {
        isFullscreenMode = Boolean(enabled);
        syncFullscreenViewportSize();
        root.classList.toggle('is-fullscreen', isFullscreenMode);
        root.classList.toggle('is-default-fullscreen', !isFullscreenMode);
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
        return maxVolume * distanceRatio * distanceRatio * distanceRatio * distanceRatio;
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

    const playRandomDieSound = function (volume, playerId) {
        if (!dieSoundUrls.length) {
            return;
        }

        const selectedUrl = dieSoundUrls[Math.floor(Math.random() * dieSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.98, playerId);
    };

    const playRandomRespawnSound = function (volume, playerId) {
        if (!respawnSoundUrls.length) {
            return;
        }

        const selectedUrl = respawnSoundUrls[Math.floor(Math.random() * respawnSoundUrls.length)];
        if (!selectedUrl) {
            return;
        }

        playAudioFile(selectedUrl, typeof volume === 'number' ? volume : 0.92, playerId);
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
                deathActive: false,
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
                    if ((player.collisionVisualType || 'win') === 'defeat') {
                        playRandomDefeatSound(volume, player.id);
                    } else {
                        playRandomCrashSound(volume, player.id);
                    }
                }

                if (player.deathActive && !previousState.deathActive) {
                    playRandomDieSound(volume, player.id);
                }

                if (!player.deathActive && previousState.deathActive) {
                    playRandomRespawnSound(volume, player.id);
                }
            }

            playerAudioStates.set(player.id, {
                boostState: player.boostState || 'idle',
                npcState: player.npcState || '',
                collisionActive: Boolean(player.collisionActive),
                collisionVisualType: player.collisionVisualType || 'win',
                deathActive: Boolean(player.deathActive)
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
                targetRotation: 0,
                trailPoints: [],
                lastTrailAt: 0,
                lastNpcPhase: null,
                phaseShiftStartedAt: 0,
                phaseShiftUntil: 0,
                npcWinVisualActive: false,
                npcWinIconIndex: 0
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

        if (player.id === selfId && (boostState === 'charging' || boostState === 'cooldown')) {
            if (Math.hypot(boostDirectionX, boostDirectionY) > 0.001) {
                return {
                    dx: boostDirectionX,
                    dy: boostDirectionY
                };
            }
        }

        if ((Boolean(player.isNpc) || Boolean(player.isDummy)) && typeof player.facingAngle === 'number') {
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
            sendInputNow(false);
        }, inputSendIntervalMs);
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

    const sendInputNow = function (force) {
        if (!socket || socket.readyState !== window.WebSocket.OPEN) {
            return;
        }
        const now = Date.now();
        const nextSignature = buildInputSignature();
        if (!force && nextSignature === lastSentInputSignature && now - lastSentInputAt < inputHeartbeatMs) {
            return;
        }

        socket.send(nextSignature);
        lastSentInputSignature = nextSignature;
        lastSentInputAt = now;
    };

    const scheduleReconnect = function () {
        if (!gameStarted) {
            return;
        }
        if (reconnectAttemptInFlight) {
            return;
        }
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = async function () {
        if (!gameStarted) {
            return;
        }
        if (reconnectAttemptInFlight) {
            return;
        }

        idleReconnectBlocked = false;
        reconnectAttemptInFlight = true;
        stopInputLoop();
        stopPingLoop();
        setPing(null);
        window.clearTimeout(reconnectTimer);
        setLoadingOverlayOpen(true);

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
            setLoadingOverlayOpen(false);
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
            lastSentInputSignature = '';
            lastSentInputAt = 0;
            setStartOverlayOpen(false);
            setLoadingOverlayOpen(false);
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

            if (payload && payload.type === 'idle_timeout') {
                handleIdleTimeoutDisconnect();
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
                    const wasSelfDeathActive = selfDeathActive;
                    serverReportedMoveSpeed = typeof selfPlayer.currentSpeed === 'number'
                        ? selfPlayer.currentSpeed
                        : basePlayerSpeedPerSecond;
                    collisionRecoveryActive = Boolean(selfPlayer.collisionRecoveryActive);
                    boostLockedActive = Boolean(selfPlayer.boostLockedActive);
                    selfDeathActive = Boolean(selfPlayer.deathActive);
                    selfDeathRespawnReady = Boolean(selfPlayer.deathRespawnReady);
                    selfLivesRemaining = typeof selfPlayer.livesRemaining === 'number'
                        ? Math.max(0, selfPlayer.livesRemaining)
                        : 0;
                    if (!selfDeathActive) {
                        respawnRequestPending = false;
                        roundResetAnnouncementLatched = false;
                        manualStartAutoRespawnPending = false;
                    }
                    roundResetAnnouncementActive = Boolean(selfPlayer.roundResetAnnouncementActive);
                    setSharedLives(selfLivesRemaining);
                    setDeathModalState(selfDeathActive, selfDeathRespawnReady, selfLivesRemaining);
                    if (defeatReceivedCountNode) {
                        defeatReceivedCountNode.textContent = String(selfPlayer.defeatReceivedCount || 0);
                    }
                    if (defeatDealtCountNode) {
                        defeatDealtCountNode.textContent = String(selfPlayer.defeatDealtCount || 0);
                    }
                    if (Boolean(selfPlayer.collisionActive) && !selfCollisionActive) {
                        if ((selfPlayer.collisionVisualType || 'win') === 'defeat') {
                            playRandomDefeatSound(undefined, selfId || '__self__');
                        } else {
                            playRandomCrashSound(undefined, selfId || '__self__');
                        }
                    }
                    if (selfDeathActive && !wasSelfDeathActive) {
                        playRandomDieSound(undefined, selfId || '__self__');
                    }
                    if (!selfDeathActive && wasSelfDeathActive) {
                        playRandomRespawnSound(undefined, selfId || '__self__');
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
                        roundResetAnnouncementActive = false;
                    }
                    if (manualStartAutoRespawnPending && selfDeathActive && selfDeathRespawnReady && selfLivesRemaining > 0) {
                        respawnRequestPending = true;
                        input.respawn = true;
                        sendInputNow(true);
                        setDeathModalState(selfDeathActive, selfDeathRespawnReady, selfLivesRemaining);
                        manualStartAutoRespawnPending = false;
                    }
                    if (manualStartAutoRespawnPending && (!selfDeathActive || selfLivesRemaining <= 0)) {
                        manualStartAutoRespawnPending = false;
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
            setLoadingOverlayOpen(false);
            stopInputLoop();
            stopPingLoop();
            setPing(null);
            stopPlayerSound(selfId || '__self__');
            playerAudioStates.clear();
            playerVisuals.clear();
            if (suppressNextCloseReconnect) {
                suppressNextCloseReconnect = false;
                return;
            }
            if (event && event.code === 4002) {
                handleIdleTimeoutDisconnect();
                return;
            }
            setStatus(labels.disconnected, '#f97316');
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
            setLoadingOverlayOpen(false);
            setStatus(labels.disconnected, '#ef4444');
        });
    };

    const startGame = function () {
        manualStartAutoRespawnPending = true;
        if (gameStarted) {
            connect();
            return;
        }
        gameStarted = true;
        setStartOverlayOpen(false);
        connect();
    };

    const resizeCanvas = function () {
        const displayWidth = Math.round(canvas.parentElement?.clientWidth || canvas.clientWidth || 960);
        const displayHeight = Math.round(canvas.parentElement?.clientHeight || canvas.clientHeight || 640);
        const nextScale = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
        const nextWidth = Math.round(displayWidth * nextScale);
        const nextHeight = Math.round(displayHeight * nextScale);
        if (canvas.width === nextWidth && canvas.height === nextHeight && canvasScale === nextScale) {
            return;
        }
        canvasScale = nextScale;
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    };

    const drawGrid = function (cameraX, cameraY, zoom) {
        const canvasWidth = getCanvasDisplayWidth();
        const canvasHeight = getCanvasDisplayHeight();
        const step = 50;
        ctx.strokeStyle = 'rgba(161, 138, 101, 0.14)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= worldSize; x += step) {
            const screenX = Math.round((x - cameraX) * zoom);
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, canvasHeight);
            ctx.stroke();
        }

        for (let y = 0; y <= worldSize; y += step) {
            const screenY = Math.round((y - cameraY) * zoom);
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(canvasWidth, screenY);
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

    const getPlayerSpriteState = function (player, isSelf, visual) {
        const isNpc = Boolean(player.isNpc);
        const boostStateValue = isSelf ? boostState : (player.boostState || 'idle');
        const npcState = player.npcState || '';
        const npcPhase = isNpc ? Math.max(1, Number(player.npcPhase || 1)) : 1;
        const npcDefeatDamageRatio = isNpc
            ? Math.max(0, Math.min(1, Number(player.npcDefeatDamageRatio || 0)))
            : 0;
        const npcWinVisualActive = isNpc && Boolean(player.npcWinVisualActive);
        const isBoostVisualActive = isNpc
            ? (npcState === 'windup' || npcState === 'charging')
            : (boostStateValue === 'charging' || boostStateValue === 'cooldown');
        const isCollisionVisualActive = Boolean(player.collisionActive);
        const isDefeatVisualActive = isCollisionVisualActive && player.collisionVisualType === 'defeat';
        const isDeathVisualActive = Boolean(player.deathActive);
        const npcChargeWindupProgress = typeof player.npcChargeWindupProgress === 'number'
            ? Math.max(0, Math.min(1, player.npcChargeWindupProgress))
            : 0;
        const npcBoostState = typeof player.boostState === 'string' ? player.boostState : 'idle';
        const isNpcChargeVisualActive = isNpc && (npcChargeWindupProgress > 0 || npcBoostState === 'charging');
        const isNpcDefeatIconActive = isNpc && isDefeatVisualActive && !isDeathVisualActive && npcDefeatDamageRatio >= 0.4;
        const spriteScale = isNpc
            ? (isNpcChargeVisualActive ? 2.0 : 2.8)
            : 1;
        let activeIcon = playerIcon;
        let activeIconReady = playerIconReady;

        if (isNpc) {
            if (npcPhase >= 3 && playerNpcPhase3IconReady) {
                activeIcon = playerNpcPhase3Icon;
                activeIconReady = playerNpcPhase3IconReady;
            } else if (npcPhase >= 2 && playerNpcPhase2IconReady) {
                activeIcon = playerNpcPhase2Icon;
                activeIconReady = playerNpcPhase2IconReady;
            } else {
                activeIcon = playerNpcIcon;
                activeIconReady = playerNpcIconReady;
            }
        }

        if (isNpc && isNpcChargeVisualActive && playerNpcBoostIconReady) {
            activeIcon = playerNpcBoostIcon;
            activeIconReady = playerNpcBoostIconReady;
        } else if (isNpc && npcWinVisualActive && playerNpcWinIcons.length) {
            const selectedWinIcon = playerNpcWinIcons[visual && typeof visual.npcWinIconIndex === 'number'
                ? visual.npcWinIconIndex % playerNpcWinIcons.length
                : 0];
            if (selectedWinIcon && selectedWinIcon.ready) {
                activeIcon = selectedWinIcon.image;
                activeIconReady = true;
            }
        } else if (isNpc && isDeathVisualActive && playerNpcDieIconReady) {
            activeIcon = playerNpcDieIcon;
            activeIconReady = playerNpcDieIconReady;
        } else if (isNpc && isDefeatVisualActive && npcDefeatDamageRatio >= 0.8 && playerNpcDefeat2IconReady) {
            activeIcon = playerNpcDefeat2Icon;
            activeIconReady = playerNpcDefeat2IconReady;
        } else if (isNpc && isDefeatVisualActive && npcDefeatDamageRatio >= 0.4 && playerNpcDefeat1IconReady) {
            activeIcon = playerNpcDefeat1Icon;
            activeIconReady = playerNpcDefeat1IconReady;
        } else if (!isNpc && isDeathVisualActive && playerDefeatIconReady) {
            activeIcon = playerDefeatIcon;
            activeIconReady = playerDefeatIconReady;
        } else if (!isNpc && isDefeatVisualActive && playerDefeatIconReady) {
            activeIcon = playerDefeatIcon;
            activeIconReady = playerDefeatIconReady;
        } else if (!isNpc && isCollisionVisualActive && playerCollisionIconReady) {
            activeIcon = playerCollisionIcon;
            activeIconReady = playerCollisionIconReady;
        } else if (!isNpc && isBoostVisualActive && playerBoostIconReady) {
            activeIcon = playerBoostIcon;
            activeIconReady = playerBoostIconReady;
        }

        return {
            isNpc,
            npcPhase,
            npcDefeatDamageRatio,
            npcWinVisualActive,
            isCollisionVisualActive,
            isDefeatVisualActive,
            isDeathVisualActive,
            npcChargeWindupProgress,
            npcBoostState,
            npcState,
            isNpcChargeVisualActive,
            isNpcDefeatIconActive,
            isBoostVisualActive,
            spriteScale,
            activeIcon,
            activeIconReady
        };
    };

    const drawSpriteImage = function (drawCtx, icon, x, y, width, height, rotation, flipX, alpha) {
        drawCtx.save();
        drawCtx.globalAlpha = alpha;
        drawCtx.translate(x, y);
        drawCtx.rotate(rotation);
        drawCtx.scale(flipX, 1);
        drawCtx.drawImage(
            icon,
            -width / 2,
            -height / 2,
            width,
            height
        );
        drawCtx.restore();
    };

    const getTrailTintColor = function (trailIndex, isNpc) {
        if (isNpc) {
            return 'rgba(239, 68, 68, 0.68)';
        }
        const tintPalette = [
            'rgba(239, 68, 68, 0.68)',
            'rgba(234, 179, 8, 0.68)',
            'rgba(34, 197, 94, 0.68)',
            'rgba(6, 182, 212, 0.68)',
            'rgba(59, 130, 246, 0.68)',
            'rgba(217, 70, 239, 0.68)'
        ];
        const safeIndex = Math.max(0, trailIndex) % tintPalette.length;
        return tintPalette[safeIndex];
    };

    const drawTrailSprite = function (drawCtx, icon, x, y, width, height, rotation, flipX, alpha, tintColor) {
        const tintWidth = Math.max(1, Math.round(width));
        const tintHeight = Math.max(1, Math.round(height));
        npcTintCanvas.width = tintWidth;
        npcTintCanvas.height = tintHeight;
        npcTintContext.clearRect(0, 0, tintWidth, tintHeight);
        npcTintContext.globalCompositeOperation = 'source-over';
        npcTintContext.globalAlpha = 1;
        npcTintContext.drawImage(icon, 0, 0, tintWidth, tintHeight);
        npcTintContext.globalCompositeOperation = 'source-atop';
        npcTintContext.fillStyle = tintColor;
        npcTintContext.fillRect(0, 0, tintWidth, tintHeight);
        npcTintContext.globalCompositeOperation = 'source-over';

        drawCtx.save();
        drawCtx.translate(x, y);
        drawCtx.rotate(rotation);
        drawCtx.scale(flipX, 1);
        drawCtx.globalAlpha = alpha;
        drawCtx.drawImage(
            npcTintCanvas,
            -width / 2,
            -height / 2,
            width,
            height
        );
        drawCtx.restore();
    };

    const drawNpcFocusLines = function (drawCtx, x, y, baseRadius, phase, nowMs) {
        const isPhaseThree = phase >= 3;
        const burstCount = isPhaseThree ? 40 : 28;
        const orbitRadius = baseRadius * (isPhaseThree ? 0.64 : 0.58);
        const minBurstLength = baseRadius * (isPhaseThree ? 0.05 : 0.035);
        const maxBurstLength = baseRadius * (isPhaseThree ? 0.18 : 0.12);
        const strokeColor = isPhaseThree
            ? 'rgba(37, 99, 235, 0.98)'
            : 'rgba(59, 130, 246, 0.9)';
        const shadowColor = isPhaseThree
            ? 'rgba(191, 219, 254, 0.5)'
            : 'rgba(219, 234, 254, 0.38)';

        drawCtx.save();
        drawCtx.lineCap = 'round';
        drawCtx.shadowBlur = baseRadius * (isPhaseThree ? 0.1 : 0.06);
        drawCtx.shadowColor = shadowColor;
        for (let index = 0; index < burstCount; index += 1) {
            const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / burstCount;
            const rootX = x + Math.cos(angle) * orbitRadius;
            const rootY = y + Math.sin(angle) * orbitRadius;
            const randomSeed = Math.sin(nowMs * 0.012 + index * 17.231 + phase * 3.17) * 43758.5453;
            const randomRatio = randomSeed - Math.floor(randomSeed);
            const burstLength = minBurstLength + (maxBurstLength - minBurstLength) * randomRatio;
            const startX = rootX + Math.cos(angle) * baseRadius * 0.02;
            const startY = rootY + Math.sin(angle) * baseRadius * 0.02;
            const endX = rootX + Math.cos(angle) * burstLength;
            const endY = rootY + Math.sin(angle) * burstLength;

            drawCtx.strokeStyle = strokeColor;
            drawCtx.lineWidth = Math.max(1.2, baseRadius * (isPhaseThree ? 0.03 : 0.022));
            drawCtx.beginPath();
            drawCtx.moveTo(startX, startY);
            drawCtx.lineTo(endX, endY);
            drawCtx.stroke();
        }
        drawCtx.restore();
    };

    const drawNpcPhaseShiftBurst = function (drawCtx, x, y, baseRadius, phase, startedAt, until, nowMs) {
        if (!startedAt || !until || nowMs >= until) {
            return;
        }

        const progress = Math.max(0, Math.min(1, (nowMs - startedAt) / Math.max(1, until - startedAt)));
        const eased = 1 - Math.pow(1 - progress, 3);
        const isPhaseThree = phase >= 3;
        const ringRadius = baseRadius * (0.42 + eased * (isPhaseThree ? 0.38 : 0.28));
        const ringAlpha = (1 - progress) * (isPhaseThree ? 0.8 : 0.58);
        const markCount = isPhaseThree ? 8 : 6;
        const markLength = baseRadius * (isPhaseThree ? 0.24 : 0.18) * (1 + progress * 0.35);
        const markWidth = baseRadius * (isPhaseThree ? 0.095 : 0.075);
        const rotationOffset = (nowMs / 1000) * (isPhaseThree ? 4.2 : 3.2);

        drawCtx.save();
        drawCtx.strokeStyle = isPhaseThree
            ? 'rgba(239, 68, 68, ' + ringAlpha + ')'
            : 'rgba(250, 204, 21, ' + ringAlpha + ')';
        drawCtx.lineWidth = Math.max(2, baseRadius * 0.05);
        drawCtx.beginPath();
        drawCtx.arc(x, y, ringRadius, 0, Math.PI * 2);
        drawCtx.stroke();

        for (let index = 0; index < markCount; index += 1) {
            const angle = rotationOffset + (Math.PI * 2 * index) / markCount;
            const rootX = x + Math.cos(angle) * (ringRadius + baseRadius * 0.02);
            const rootY = y + Math.sin(angle) * (ringRadius + baseRadius * 0.02);

            drawCtx.save();
            drawCtx.translate(rootX, rootY);
            drawCtx.rotate(angle);
            drawCtx.globalAlpha = Math.max(0, 1 - progress);
            drawCtx.beginPath();
            drawCtx.moveTo(0, 0);
            drawCtx.lineTo(markLength, -markWidth);
            drawCtx.lineTo(markLength * 0.62, 0);
            drawCtx.lineTo(markLength, markWidth);
            drawCtx.closePath();
            drawCtx.fillStyle = isPhaseThree
                ? 'rgba(239, 68, 68, 0.92)'
                : 'rgba(250, 204, 21, 0.88)';
            drawCtx.fill();
            drawCtx.restore();
        }
        drawCtx.restore();
    };

    const drawFallbackArrow = function (drawCtx, x, y, size, rotation, flipX, fillStyle) {
        drawCtx.save();
        drawCtx.translate(x, y);
        drawCtx.rotate(rotation);
        drawCtx.scale(flipX, 1);
        drawCtx.fillStyle = fillStyle;
        drawCtx.beginPath();
        drawCtx.moveTo(size * 0.62, 0);
        drawCtx.lineTo(-size * 0.2, -size * 0.48);
        drawCtx.lineTo(-size * 0.04, -size * 0.14);
        drawCtx.lineTo(-size * 0.62, 0);
        drawCtx.lineTo(-size * 0.04, size * 0.14);
        drawCtx.lineTo(-size * 0.2, size * 0.48);
        drawCtx.closePath();
        drawCtx.fill();
        drawCtx.restore();
    };

    const drawNpcFallbackCore = function (drawCtx, x, y, size, rotation, fillStyle) {
        drawCtx.save();
        drawCtx.translate(x, y);
        drawCtx.rotate(rotation);
        drawCtx.fillStyle = fillStyle;
        drawCtx.beginPath();
        drawCtx.roundRect(-size * 0.42, -size * 0.58, size * 0.84, size * 1.16, size * 0.18);
        drawCtx.fill();
        drawCtx.restore();
    };

    const drawPlayers = function (cameraX, cameraY, deltaSeconds, zoom) {
        const visibleOverlayIds = new Set();
        renderPlayers.forEach(function (player) {
            const x = (player.x - cameraX) * zoom;
            const y = (player.y - cameraY) * zoom;
            const isSelf = player.id === selfId;
            const visual = getPlayerVisual(player.id);
            if (Boolean(player.npcWinVisualActive) && !visual.npcWinVisualActive) {
                visual.npcWinIconIndex = playerNpcWinIcons.length
                    ? Math.floor(Math.random() * playerNpcWinIcons.length)
                    : 0;
            }
            visual.npcWinVisualActive = Boolean(player.npcWinVisualActive);
            const spriteState = getPlayerSpriteState(player, isSelf, visual);
            const isNpc = spriteState.isNpc;
            const isCollisionVisualActive = spriteState.isCollisionVisualActive;
            const isDefeatVisualActive = spriteState.isDefeatVisualActive;
            const isDeathVisualActive = spriteState.isDeathVisualActive;
            const deathFadeProgress = typeof player.deathFadeProgress === 'number' ? player.deathFadeProgress : 0;
            const isNpcDeathAnimating = Boolean(player.npcDeathAnimating);
            const npcHealth = typeof player.npcHealth === 'number' ? player.npcHealth : npcMaxHealth;
            const playerNpcMaxHealth = typeof player.npcMaxHealth === 'number' ? player.npcMaxHealth : npcMaxHealth;
            const collisionImpactX = typeof player.collisionImpactX === 'number' ? player.collisionImpactX : 0;
            const collisionImpactY = typeof player.collisionImpactY === 'number' ? player.collisionImpactY : 0;
            const isNpcChargeVisualActive = spriteState.isNpcChargeVisualActive;
            const isBoostVisualActive = spriteState.isBoostVisualActive;
            const spriteScale = spriteState.spriteScale;
            const activeIcon = spriteState.activeIcon;
            const activeIconReady = spriteState.activeIconReady;
            const fallbackSpriteHeight = playerSpriteHeight * spriteScale * zoom;
            const useDomGifOverlay = Boolean(isNpc && activeIconReady && isAnimatedGifIcon(activeIcon));
            const fallbackNaturalWidth = activeIcon.naturalWidth || playerSpriteWidth;
            const fallbackNaturalHeight = activeIcon.naturalHeight || playerSpriteHeight;
            const fallbackAspectRatio = fallbackNaturalHeight > 0 ? fallbackNaturalWidth / fallbackNaturalHeight : 1;
            const spriteHeight = fallbackSpriteHeight;
            const spriteWidth = spriteHeight * fallbackAspectRatio;
            const trailActive = activeIconReady && !isDeathVisualActive && (
                isNpc
                    ? (player.npcState === 'charging')
                    : isBoostVisualActive
            );
            const trailFadeDurationMs = 280;
            const nowMs = window.performance.now();
            const npcPhase = isNpc
                ? Math.max(1, Number(player.npcPhase || 1))
                : 1;

            if (isNpc) {
                if (visual.lastNpcPhase === null) {
                    visual.lastNpcPhase = npcPhase;
                } else if (npcPhase > visual.lastNpcPhase) {
                    visual.phaseShiftStartedAt = nowMs;
                    visual.phaseShiftUntil = nowMs + 520;
                    visual.lastNpcPhase = npcPhase;
                } else if (npcPhase < visual.lastNpcPhase) {
                    visual.lastNpcPhase = npcPhase;
                    visual.phaseShiftStartedAt = 0;
                    visual.phaseShiftUntil = 0;
                }
            }

            updateVisualAnimation(visual, deltaSeconds);

            if (visual.trailPoints.length) {
                visual.trailPoints = visual.trailPoints.filter(function (trailPoint) {
                    return !trailPoint.expiresAt || trailPoint.expiresAt > nowMs;
                });
            }

            if (trailActive) {
                if (!visual.lastTrailAt || nowMs - visual.lastTrailAt >= 140) {
                    visual.trailPoints.push({
                        x: player.x,
                        y: player.y,
                        rotation: visual.currentRotation,
                        flipX: visual.currentFlipX,
                        icon: activeIcon,
                        width: spriteWidth,
                        height: spriteHeight,
                        createdAt: nowMs,
                        expiresAt: 0
                    });
                    visual.lastTrailAt = nowMs;
                }
                if (visual.trailPoints.length > 4) {
                    visual.trailPoints.shift();
                }
            } else if (visual.trailPoints.length) {
                visual.trailPoints.forEach(function (trailPoint) {
                    if (!trailPoint.expiresAt) {
                        trailPoint.expiresAt = nowMs + trailFadeDurationMs;
                    }
                });
                visual.lastTrailAt = 0;
            }

            if (activeIconReady) {
                if (isNpc && isDeathVisualActive && !isNpcDeathAnimating) {
                    hideSpriteOverlayNode(player.id);
                    visual.previousX = player.x;
                    visual.previousY = player.y;
                    return;
                }
                if (visual.trailPoints.length) {
                    visual.trailPoints.forEach(function (trailPoint, index) {
                        const trailX = (trailPoint.x - cameraX) * zoom;
                        const trailY = (trailPoint.y - cameraY) * zoom;
                        const fadeRatio = trailPoint.expiresAt
                            ? Math.max(0, Math.min(1, (trailPoint.expiresAt - nowMs) / trailFadeDurationMs))
                            : 1;
                        const alpha = 0.25 * ((index + 1) / visual.trailPoints.length) * fadeRatio;
                        drawTrailSprite(
                            ctx,
                            trailPoint.icon || activeIcon,
                            trailX,
                            trailY,
                            trailPoint.width || spriteWidth,
                            trailPoint.height || spriteHeight,
                            trailPoint.rotation,
                            trailPoint.flipX,
                            alpha,
                            getTrailTintColor(index, isNpc)
                        );
                    });
                }
                const playerAlpha = isDeathVisualActive ? Math.max(0, 1 - deathFadeProgress) : 1;
                const dentAngle = Math.atan2(collisionImpactY, collisionImpactX) - visual.currentRotation;
                const dentLocalX = collisionImpactX === 0 && collisionImpactY === 0
                    ? 0
                    : Math.cos(dentAngle) * visual.currentFlipX;
                const dentLocalY = collisionImpactX === 0 && collisionImpactY === 0
                    ? 0
                    : Math.sin(dentAngle);
                if (useDomGifOverlay) {
                    const overlayNode = getSpriteOverlayNode(player.id);
                    if (overlayNode) {
                        const iconSrc = activeIcon.currentSrc || activeIcon.src;
                        if (iconSrc && overlayNode.src !== iconSrc) {
                            overlayNode.src = iconSrc;
                        }
                        overlayNode.style.display = 'block';
                        overlayNode.style.width = spriteWidth + 'px';
                        overlayNode.style.height = spriteHeight + 'px';
                        overlayNode.style.opacity = String(playerAlpha);
                        overlayNode.style.transform =
                            'translate(' + x + 'px, ' + y + 'px) translate(-50%, -50%) rotate(' +
                            (visual.currentRotation + (isNpcDeathAnimating ? Math.PI / 2 : 0)) +
                            'rad) scale(' + visual.currentFlipX + ', 1)';
                        visibleOverlayIds.add(player.id);
                    }
                } else {
                    hideSpriteOverlayNode(player.id);
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.rotate(
                        visual.currentRotation +
                        (isNpcDeathAnimating ? Math.PI / 2 : 0)
                    );
                    ctx.scale(visual.currentFlipX, 1);
                    ctx.globalAlpha = playerAlpha;
                    ctx.drawImage(
                        activeIcon,
                        -spriteWidth / 2,
                        -spriteHeight / 2,
                        spriteWidth,
                        spriteHeight
                    );
                }
                if (!useDomGifOverlay && isNpc && isDefeatVisualActive && npcTintContext) {
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
                if (!useDomGifOverlay) {
                    ctx.restore();
                }
            } else {
                hideSpriteOverlayNode(player.id);
                if (isNpc) {
                    drawNpcFallbackCore(
                        ctx,
                        x,
                        y,
                        18 * zoom,
                        visual.currentRotation,
                        'rgba(127, 29, 29, 0.92)'
                    );
                } else {
                    drawFallbackArrow(
                        ctx,
                        x,
                        y,
                        12 * zoom,
                        visual.currentRotation,
                        visual.currentFlipX,
                        isSelf ? 'rgba(37, 99, 235, 0.92)' : 'rgba(245, 158, 11, 0.92)'
                    );
                }
            }

            if (!isNpc) {
                const defeatReceivedCount = typeof player.defeatReceivedCount === 'number' ? Math.max(0, player.defeatReceivedCount) : 0;
                const healthSegmentsFilled = isDeathVisualActive
                    ? 0
                    : Math.max(0, 3 - (defeatReceivedCount % 3 || 0));
                if (!isDeathVisualActive) {
                    const healthBarWidth = Math.max(24, spriteWidth * 0.9);
                    const segmentGap = Math.max(2, 2 * zoom);
                    const segmentWidth = (healthBarWidth - segmentGap * 2) / 3;
                    const segmentHeight = Math.max(4, 5 * zoom);
                    const defaultSegmentStartX = x - healthBarWidth / 2;
                    const defaultSegmentY = y + spriteHeight / 2 + 5 * zoom;
                    const healthSegmentColor = healthSegmentsFilled >= 3
                        ? 'rgba(34, 197, 94, 1)'
                        : (healthSegmentsFilled === 2
                            ? 'rgba(234, 179, 8, 1)'
                            : 'rgba(239, 68, 68, 1)');
                    const playerBoostState = typeof player.boostState === 'string' ? player.boostState : 'idle';
                    const boostLockRemainingMs = typeof player.boostLockRemainingMs === 'number' ? Math.max(0, player.boostLockRemainingMs) : 0;
                    const boostLockDurationMs = typeof player.boostLockDurationMs === 'number' ? Math.max(0, player.boostLockDurationMs) : 0;
                    let cooldownRatio = 1;
                    if (playerBoostState === 'charging' || playerBoostState === 'cooldown') {
                        cooldownRatio = 0;
                    } else if (boostLockDurationMs > 0) {
                        cooldownRatio = Math.max(0, Math.min(1, 1 - (boostLockRemainingMs / boostLockDurationMs)));
                    }
                    const segmentStartX = defaultSegmentStartX;
                    const segmentY = defaultSegmentY;
                    ctx.save();
                    for (let segmentIndex = 0; segmentIndex < 3; segmentIndex += 1) {
                        const segmentX = segmentStartX + segmentIndex * (segmentWidth + segmentGap);
                        ctx.fillStyle = segmentIndex < healthSegmentsFilled
                            ? healthSegmentColor
                            : 'rgba(15, 23, 42, 0.14)';
                        ctx.fillRect(segmentX, segmentY, segmentWidth, segmentHeight);
                    }
                    ctx.restore();

                    if (isSelf) {
                        const cooldownBarY = segmentY + segmentHeight + Math.max(2, 2 * zoom);
                        ctx.save();
                        ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
                        ctx.fillRect(segmentStartX, cooldownBarY, healthBarWidth, segmentHeight);
                        ctx.fillStyle = 'rgba(59, 130, 246, 0.92)';
                        ctx.fillRect(segmentStartX, cooldownBarY, healthBarWidth * cooldownRatio, segmentHeight);
                        ctx.restore();
                    }
                }
                ctx.fillStyle = isDeathVisualActive
                    ? 'rgba(17, 24, 39, ' + Math.max(0, 0.92 * (1 - deathFadeProgress)) + ')'
                    : 'rgba(17, 24, 39, 0.92)';
                ctx.font = '800 15px Inter, Noto Sans KR, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(player.displayName || player.id, x, y - spriteHeight / 2 - 5 * zoom);
            } else if (!isDeathVisualActive || isNpcDeathAnimating) {
                const healthRatio = Math.max(0, Math.min(1, npcHealth / playerNpcMaxHealth));
                const npcPhaseTwoRatio = typeof player.npcPhaseTwoRatio === 'number' ? player.npcPhaseTwoRatio : 0.6;
                const npcPhaseThreeRatio = typeof player.npcPhaseThreeRatio === 'number' ? player.npcPhaseThreeRatio : 0.2;
                const barWidth = Math.max(44, 76 * zoom);
                const barHeight = Math.max(6, 8 * zoom);
                const barX = x - barWidth / 2;
                const healthBarGap = isNpcChargeVisualActive ? 18 : 4;
                const barY = y - (playerSpriteHeight * spriteScale * zoom) / 2 - healthBarGap * zoom;

                ctx.fillStyle = 'rgba(17, 24, 39, 0.22)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = npcPhase >= 3
                    ? '#ef4444'
                    : (npcPhase >= 2 ? '#eab308' : '#22c55e');
                ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
                const phaseTwoMarkerX = barX + barWidth * npcPhaseTwoRatio;
                const phaseThreeMarkerX = barX + barWidth * npcPhaseThreeRatio;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = Math.max(1.2, 1.5 * zoom);
                ctx.beginPath();
                ctx.moveTo(phaseTwoMarkerX, barY);
                ctx.lineTo(phaseTwoMarkerX, barY + barHeight);
                ctx.moveTo(phaseThreeMarkerX, barY);
                ctx.lineTo(phaseThreeMarkerX, barY + barHeight);
                ctx.stroke();
            }

            visual.previousX = player.x;
            visual.previousY = player.y;
        });

        spriteOverlayNodes.forEach(function (node, playerId) {
            if (!visibleOverlayIds.has(playerId)) {
                node.style.display = 'none';
            }
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
            if (!isSelf || player.deathActive) {
                return;
            }
            const x = padding + (player.x / worldSize) * drawableWidth;
            const y = padding + (player.y / worldSize) * drawableHeight;
            const visual = getPlayerVisual(player.id);
            drawFallbackArrow(
                minimapCtx,
                x,
                y,
                player.isNpc ? 9 : 6,
                visual.currentRotation,
                visual.currentFlipX,
                player.isNpc ? 'rgba(127, 29, 29, 0.92)' : '#38bdf8'
            );
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
        const canvasWidth = getCanvasDisplayWidth();
        const canvasHeight = getCanvasDisplayHeight();
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = '#fbf6ed';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
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
                    current.displayName = serverPlayer.displayName || serverPlayer.id;
                    current.x = renderedSelf.x;
                    current.y = renderedSelf.y;
                    current.velocityX = typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0;
                    current.velocityY = typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0;
                    current.facingAngle = typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0;
                    current.isDummy = Boolean(serverPlayer.isDummy);
                    current.collisionActive = Boolean(serverPlayer.collisionActive);
                    current.npcPhase = typeof serverPlayer.npcPhase === 'number' ? serverPlayer.npcPhase : 1;
                    current.npcPhaseTwoRatio = typeof serverPlayer.npcPhaseTwoRatio === 'number' ? serverPlayer.npcPhaseTwoRatio : 0.6;
                    current.npcPhaseThreeRatio = typeof serverPlayer.npcPhaseThreeRatio === 'number' ? serverPlayer.npcPhaseThreeRatio : 0.2;
                    current.npcState = serverPlayer.npcState || '';
                    current.collisionVisualType = serverPlayer.collisionVisualType || 'win';
                    current.collisionImpactX = typeof serverPlayer.collisionImpactX === 'number' ? serverPlayer.collisionImpactX : 0;
                    current.collisionImpactY = typeof serverPlayer.collisionImpactY === 'number' ? serverPlayer.collisionImpactY : 0;
                    current.deathActive = Boolean(serverPlayer.deathActive);
                    current.deathFadeProgress = typeof serverPlayer.deathFadeProgress === 'number'
                        ? serverPlayer.deathFadeProgress
                        : 0;
                    current.npcDeathAnimating = Boolean(serverPlayer.npcDeathAnimating);
                    current.npcMaxHealth = typeof serverPlayer.npcMaxHealth === 'number' ? serverPlayer.npcMaxHealth : null;
                    current.npcHealth = typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null;
                    current.npcDefeatDamageRatio = typeof serverPlayer.npcDefeatDamageRatio === 'number' ? serverPlayer.npcDefeatDamageRatio : 0;
                    current.npcWinVisualActive = Boolean(serverPlayer.npcWinVisualActive);
                    current.boostState = serverPlayer.boostState || 'idle';
                    current.currentSpeed = typeof serverPlayer.currentSpeed === 'number' ? serverPlayer.currentSpeed : basePlayerSpeedPerSecond;
                    current.defeatReceivedCount = typeof serverPlayer.defeatReceivedCount === 'number' ? serverPlayer.defeatReceivedCount : 0;
                    current.boostLockRemainingMs = typeof serverPlayer.boostLockRemainingMs === 'number' ? serverPlayer.boostLockRemainingMs : 0;
                    current.boostLockDurationMs = typeof serverPlayer.boostLockDurationMs === 'number' ? serverPlayer.boostLockDurationMs : 0;
                    current.npcChargeWindupProgress = typeof serverPlayer.npcChargeWindupProgress === 'number'
                        ? serverPlayer.npcChargeWindupProgress
                        : 0;
                } else {
                    renderPlayers.push({
                        id: renderedSelf.id,
                        displayName: serverPlayer.displayName || serverPlayer.id,
                        x: renderedSelf.x,
                        y: renderedSelf.y,
                        velocityX: typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0,
                        velocityY: typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0,
                        facingAngle: typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0,
                        isDummy: Boolean(serverPlayer.isDummy),
                        isNpc: Boolean(serverPlayer.isNpc),
                        npcPhase: typeof serverPlayer.npcPhase === 'number' ? serverPlayer.npcPhase : 1,
                        npcPhaseTwoRatio: typeof serverPlayer.npcPhaseTwoRatio === 'number' ? serverPlayer.npcPhaseTwoRatio : 0.6,
                        npcPhaseThreeRatio: typeof serverPlayer.npcPhaseThreeRatio === 'number' ? serverPlayer.npcPhaseThreeRatio : 0.2,
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
                        npcMaxHealth: typeof serverPlayer.npcMaxHealth === 'number' ? serverPlayer.npcMaxHealth : null,
                        npcHealth: typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null,
                        npcDefeatDamageRatio: typeof serverPlayer.npcDefeatDamageRatio === 'number' ? serverPlayer.npcDefeatDamageRatio : 0,
                        npcWinVisualActive: Boolean(serverPlayer.npcWinVisualActive),
                        boostState: serverPlayer.boostState || 'idle',
                        currentSpeed: typeof serverPlayer.currentSpeed === 'number' ? serverPlayer.currentSpeed : basePlayerSpeedPerSecond,
                        defeatReceivedCount: typeof serverPlayer.defeatReceivedCount === 'number' ? serverPlayer.defeatReceivedCount : 0,
                        boostLockRemainingMs: typeof serverPlayer.boostLockRemainingMs === 'number' ? serverPlayer.boostLockRemainingMs : 0,
                        boostLockDurationMs: typeof serverPlayer.boostLockDurationMs === 'number' ? serverPlayer.boostLockDurationMs : 0,
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
                const respawnTransition = Boolean(current.deathActive) && !Boolean(serverPlayer.deathActive);
                current.displayName = serverPlayer.displayName || serverPlayer.id;
                current.targetX = delayedTargetX;
                current.targetY = delayedTargetY;
                if (respawnTransition) {
                    current.x = delayedTargetX;
                    current.y = delayedTargetY;
                    const visual = getPlayerVisual(current.id);
                    visual.previousX = delayedTargetX;
                    visual.previousY = delayedTargetY;
                } else {
                    current.x += (current.targetX - current.x) * remoteLerp;
                    current.y += (current.targetY - current.y) * remoteLerp;
                }
                current.velocityX = typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0;
                current.velocityY = typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0;
                current.facingAngle = typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0;
                current.isDummy = Boolean(serverPlayer.isDummy);
                current.isNpc = Boolean(serverPlayer.isNpc);
                current.npcPhase = typeof serverPlayer.npcPhase === 'number' ? serverPlayer.npcPhase : 1;
                current.npcPhaseTwoRatio = typeof serverPlayer.npcPhaseTwoRatio === 'number' ? serverPlayer.npcPhaseTwoRatio : 0.6;
                current.npcPhaseThreeRatio = typeof serverPlayer.npcPhaseThreeRatio === 'number' ? serverPlayer.npcPhaseThreeRatio : 0.2;
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
                current.npcMaxHealth = typeof serverPlayer.npcMaxHealth === 'number' ? serverPlayer.npcMaxHealth : null;
                current.npcHealth = typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null;
                current.npcDefeatDamageRatio = typeof serverPlayer.npcDefeatDamageRatio === 'number' ? serverPlayer.npcDefeatDamageRatio : 0;
                current.npcWinVisualActive = Boolean(serverPlayer.npcWinVisualActive);
                current.boostState = serverPlayer.boostState || 'idle';
                current.currentSpeed = typeof serverPlayer.currentSpeed === 'number' ? serverPlayer.currentSpeed : basePlayerSpeedPerSecond;
                current.defeatReceivedCount = typeof serverPlayer.defeatReceivedCount === 'number' ? serverPlayer.defeatReceivedCount : 0;
                current.boostLockRemainingMs = typeof serverPlayer.boostLockRemainingMs === 'number' ? serverPlayer.boostLockRemainingMs : 0;
                current.boostLockDurationMs = typeof serverPlayer.boostLockDurationMs === 'number' ? serverPlayer.boostLockDurationMs : 0;
                current.npcChargeWindupProgress = typeof serverPlayer.npcChargeWindupProgress === 'number'
                    ? serverPlayer.npcChargeWindupProgress
                    : 0;
            } else {
                renderPlayers.push({
                    id: serverPlayer.id,
                    displayName: serverPlayer.displayName || serverPlayer.id,
                    x: delayedTargetX,
                    y: delayedTargetY,
                    targetX: delayedTargetX,
                    targetY: delayedTargetY,
                    velocityX: typeof serverPlayer.velocityX === 'number' ? serverPlayer.velocityX : 0,
                    velocityY: typeof serverPlayer.velocityY === 'number' ? serverPlayer.velocityY : 0,
                    facingAngle: typeof serverPlayer.facingAngle === 'number' ? serverPlayer.facingAngle : 0,
                    isDummy: Boolean(serverPlayer.isDummy),
                    isNpc: Boolean(serverPlayer.isNpc),
                    npcPhase: typeof serverPlayer.npcPhase === 'number' ? serverPlayer.npcPhase : 1,
                    npcPhaseTwoRatio: typeof serverPlayer.npcPhaseTwoRatio === 'number' ? serverPlayer.npcPhaseTwoRatio : 0.6,
                    npcPhaseThreeRatio: typeof serverPlayer.npcPhaseThreeRatio === 'number' ? serverPlayer.npcPhaseThreeRatio : 0.2,
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
                    npcMaxHealth: typeof serverPlayer.npcMaxHealth === 'number' ? serverPlayer.npcMaxHealth : null,
                    npcHealth: typeof serverPlayer.npcHealth === 'number' ? serverPlayer.npcHealth : null,
                    npcDefeatDamageRatio: typeof serverPlayer.npcDefeatDamageRatio === 'number' ? serverPlayer.npcDefeatDamageRatio : 0,
                    npcWinVisualActive: Boolean(serverPlayer.npcWinVisualActive),
                    boostState: serverPlayer.boostState || 'idle',
                    currentSpeed: typeof serverPlayer.currentSpeed === 'number' ? serverPlayer.currentSpeed : basePlayerSpeedPerSecond,
                    defeatReceivedCount: typeof serverPlayer.defeatReceivedCount === 'number' ? serverPlayer.defeatReceivedCount : 0,
                    boostLockRemainingMs: typeof serverPlayer.boostLockRemainingMs === 'number' ? serverPlayer.boostLockRemainingMs : 0,
                    boostLockDurationMs: typeof serverPlayer.boostLockDurationMs === 'number' ? serverPlayer.boostLockDurationMs : 0,
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

        const spectatablePlayers = syncSpectateTarget();
        let cameraTargetPlayer = renderPlayers.find(function (player) {
            return player.id === selfId;
        });
        if (selfDeathActive && selfLivesRemaining <= 0 && spectatablePlayers.length > 0) {
            cameraTargetPlayer = renderPlayers.find(function (player) {
                return player.id === spectateTargetId;
            }) || spectatablePlayers[0];
        }
        if (!cameraTargetPlayer) {
            cameraTargetPlayer = renderPlayers[0] || { x: worldSize / 2, y: worldSize / 2 };
        }
        const viewportWorldWidth = getCanvasDisplayWidth() / effectiveZoom;
        const viewportWorldHeight = getCanvasDisplayHeight() / effectiveZoom;
        const deadZoneWidth = viewportWorldWidth * cameraDeadZoneRatioX;
        const deadZoneHeight = viewportWorldHeight * cameraDeadZoneRatioY;
        const currentCenterX = cameraX + viewportWorldWidth / 2;
        const currentCenterY = cameraY + viewportWorldHeight / 2;
        let desiredCenterX = cameraTargetPlayer.x;
        let desiredCenterY = cameraTargetPlayer.y;
        const cameraTargetVisual = getPlayerVisual(cameraTargetPlayer.id);
        const cameraLeadVector = getPlayerDirectionVector(cameraTargetPlayer, cameraTargetVisual);
        const cameraLeadMagnitude = Math.hypot(cameraLeadVector.dx, cameraLeadVector.dy);
        const cameraIsMoving = cameraLeadMagnitude > cameraLeadSpeedThreshold;
        if (cameraLeadMagnitude > cameraLeadSpeedThreshold) {
            desiredCenterX += (cameraLeadVector.dx / cameraLeadMagnitude) * viewportWorldWidth * cameraLeadRatioX;
            desiredCenterY += (cameraLeadVector.dy / cameraLeadMagnitude) * viewportWorldHeight * cameraLeadRatioY;
        }
        let targetCenterX = currentCenterX;
        let targetCenterY = currentCenterY;

        if (!cameraIsMoving) {
            targetCenterX = desiredCenterX;
            targetCenterY = desiredCenterY;
        } else {
            if (desiredCenterX < currentCenterX - deadZoneWidth) {
                targetCenterX = desiredCenterX + deadZoneWidth;
            } else if (desiredCenterX > currentCenterX + deadZoneWidth) {
                targetCenterX = desiredCenterX - deadZoneWidth;
            }

            if (desiredCenterY < currentCenterY - deadZoneHeight) {
                targetCenterY = desiredCenterY + deadZoneHeight;
            } else if (desiredCenterY > currentCenterY + deadZoneHeight) {
                targetCenterY = desiredCenterY - deadZoneHeight;
            }
        }

        const targetCameraX = targetCenterX - viewportWorldWidth / 2;
        const targetCameraY = targetCenterY - viewportWorldHeight / 2;
        cameraX += (targetCameraX - cameraX) * cameraFollow;
        cameraY += (targetCameraY - cameraY) * cameraFollow;
        const maxCameraX = Math.max(0, worldSize - viewportWorldWidth);
        const maxCameraY = Math.max(0, worldSize - viewportWorldHeight);
        cameraX = Math.max(0, Math.min(maxCameraX, cameraX));
        cameraY = Math.max(0, Math.min(maxCameraY, cameraY));

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
        masterVolume = Math.max(0, Math.min(1, Number(masterVolumeSlider.value || 20) / 100));
        masterVolumeSlider.addEventListener('input', function () {
            masterVolume = Math.max(0, Math.min(1, Number(masterVolumeSlider.value || 0) / 100));
        });
    }
    if (deathModalRespawnButton) {
        deathModalRespawnButton.addEventListener('click', function () {
            if (!selfDeathActive || !selfDeathRespawnReady || selfLivesRemaining <= 0) {
                return;
            }

            if (!socket || socket.readyState !== window.WebSocket.OPEN) {
                return;
            }

            respawnRequestPending = true;
            input.respawn = true;
            sendInputNow();
            setDeathModalState(selfDeathActive, selfDeathRespawnReady, selfLivesRemaining);
        });
    }
    if (deathModalSpectatePrevButton) {
        deathModalSpectatePrevButton.addEventListener('click', function () {
            cycleSpectateTarget(-1);
            setDeathModalState(selfDeathActive, selfDeathRespawnReady, selfLivesRemaining);
        });
    }
    if (deathModalSpectateNextButton) {
        deathModalSpectateNextButton.addEventListener('click', function () {
            cycleSpectateTarget(1);
            setDeathModalState(selfDeathActive, selfDeathRespawnReady, selfLivesRemaining);
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
    window.addEventListener('resize', function () {
        syncFullscreenViewportSize();
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () {
            syncFullscreenViewportSize();
        });
    }
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
    if (startButton) {
        startButton.addEventListener('click', function () {
            startGame();
        });
    }
    if (reconnectButton) {
        reconnectButton.addEventListener('click', function () {
            startGame();
        });
    }
    if (idleModalCloseButton) {
        idleModalCloseButton.addEventListener('click', function () {
            setIdleModalOpen(false);
            if (gameStarted) {
                connect();
            }
        });
    }

    setFullscreenMode(false);
    setStartOverlayOpen(true);
    setLoadingOverlayOpen(false);
    setStatus(labels.disconnected, '#64748b');
    setPing(null);
    render();
})();
