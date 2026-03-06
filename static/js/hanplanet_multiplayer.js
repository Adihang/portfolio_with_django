(function () {
    'use strict';

    const root = document.querySelector('[data-game-client]');
    if (!root) {
        return;
    }

    const canvas = root.querySelector('[data-game-canvas]');
    const connectionStatus = root.querySelector('[data-game-connection-status]');
    const playerCountNode = root.querySelector('[data-game-player-count]');
    const selfIdNode = root.querySelector('[data-game-self-id]');
    const selfPositionNode = root.querySelector('[data-game-self-position]');
    const reconnectButton = root.querySelector('[data-game-reconnect]');

    if (!canvas || !connectionStatus || !playerCountNode || !selfIdNode || !selfPositionNode || !reconnectButton) {
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    const labels = {
        connecting: root.getAttribute('data-connecting-label') || 'Connecting',
        connected: root.getAttribute('data-connected-label') || 'Connected',
        disconnected: root.getAttribute('data-disconnected-label') || 'Disconnected'
    };
    const playerName = root.getAttribute('data-player-name') || 'Player';
    const rawWsUrl = root.getAttribute('data-ws-url') || '';
    const tokenUrl = root.getAttribute('data-token-url') || '';
    const worldSize = 2000;
    const input = { up: false, down: false, left: false, right: false };
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
    let selfId = '';
    let players = [];
    let sendTimer = null;
    let reconnectTimer = null;

    const setStatus = function (label, color) {
        connectionStatus.textContent = label;
        connectionStatus.style.color = color;
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

    const startInputLoop = function () {
        stopInputLoop();
        sendTimer = window.setInterval(function () {
            if (!socket || socket.readyState !== window.WebSocket.OPEN) {
                return;
            }
            socket.send(JSON.stringify(input));
        }, 50);
    };

    const scheduleReconnect = function () {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1500);
    };

    const connect = async function () {
        stopInputLoop();
        window.clearTimeout(reconnectTimer);

        if (socket) {
            try {
                socket.close();
            } catch (error) {
                return;
            }
        }

        setStatus(labels.connecting, '#c084fc');

        let token = '';
        try {
            token = await fetchGameToken();
        } catch (error) {
            setStatus(labels.disconnected, '#ef4444');
            scheduleReconnect();
            return;
        }

        socket = new window.WebSocket(getSocketUrl(token));

        socket.addEventListener('open', function () {
            setStatus(labels.connected, '#22c55e');
            startInputLoop();
        });

        socket.addEventListener('message', function (event) {
            let payload = null;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                return;
            }

            if (payload && payload.type === 'welcome') {
                selfId = payload.id || '';
                selfIdNode.textContent = selfId || playerName;
                return;
            }

            if (Array.isArray(payload)) {
                players = payload;
                playerCountNode.textContent = String(payload.length);
                const selfPlayer = payload.find(function (player) {
                    return player.id === selfId;
                });
                if (selfPlayer) {
                    selfPositionNode.textContent = Math.round(selfPlayer.x) + ', ' + Math.round(selfPlayer.y);
                }
            }
        });

        socket.addEventListener('close', function () {
            setStatus(labels.disconnected, '#f97316');
            stopInputLoop();
            scheduleReconnect();
        });

        socket.addEventListener('error', function () {
            setStatus(labels.disconnected, '#ef4444');
        });
    };

    const resizeCanvas = function () {
        const nextWidth = canvas.clientWidth || 960;
        const nextHeight = canvas.clientHeight || 640;
        if (canvas.width === nextWidth && canvas.height === nextHeight) {
            return;
        }
        canvas.width = nextWidth;
        canvas.height = nextHeight;
    };

    const drawGrid = function (cameraX, cameraY) {
        const step = 100;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= worldSize; x += step) {
            const screenX = Math.round(x - cameraX);
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, canvas.height);
            ctx.stroke();
        }

        for (let y = 0; y <= worldSize; y += step) {
            const screenY = Math.round(y - cameraY);
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(canvas.width, screenY);
            ctx.stroke();
        }
    };

    const drawPlayers = function (cameraX, cameraY) {
        players.forEach(function (player) {
            const x = player.x - cameraX;
            const y = player.y - cameraY;
            const isSelf = player.id === selfId;

            ctx.beginPath();
            ctx.fillStyle = isSelf ? '#38bdf8' : '#f59e0b';
            ctx.arc(x, y, isSelf ? 13 : 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
            ctx.font = '13px Inter, Noto Sans KR, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(player.id, x, y - 18);
        });
    };

    const render = function () {
        resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.98)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const selfPlayer = players.find(function (player) {
            return player.id === selfId;
        }) || players[0] || { x: worldSize / 2, y: worldSize / 2 };
        const cameraX = selfPlayer.x - canvas.width / 2;
        const cameraY = selfPlayer.y - canvas.height / 2;

        drawGrid(cameraX, cameraY);
        drawPlayers(cameraX, cameraY);
        window.requestAnimationFrame(render);
    };

    const handleKey = function (value) {
        return function (event) {
            const mapped = keyMap[event.key];
            if (!mapped) {
                return;
            }
            event.preventDefault();
            input[mapped] = value;
        };
    };

    document.addEventListener('keydown', handleKey(true));
    document.addEventListener('keyup', handleKey(false));
    reconnectButton.addEventListener('click', connect);

    connect();
    render();
})();
