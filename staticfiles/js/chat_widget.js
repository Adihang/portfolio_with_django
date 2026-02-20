document.addEventListener('DOMContentLoaded', function() {
    const initialBotMessage = '안녕하세요! 궁금하신 점이 있으시면 언제든지 물어보세요.';
    const STORAGE_KEY = 'portfolio_chat_history_v1';
    const conversationHistory = [];

    // 채팅 위젯 요소 생성
    const chatWidget = document.createElement('div');
    chatWidget.className = 'chat-widget';
    chatWidget.innerHTML = `
        <div class="chat-header">
            <h3>챗봇과 대화하기</h3>
            <button class="chat-toggle">−</button>
        </div>
        <div class="chat-body">
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input">
                <input type="text" id="user-input" placeholder="메시지를 입력하세요..." autocomplete="off">
                <button id="send-button">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // 문서에 채팅 위젯 추가
    document.body.appendChild(chatWidget);

    // 요소 참조
    const chatToggle = chatWidget.querySelector('.chat-toggle');
    const chatBody = chatWidget.querySelector('.chat-body');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');

    function loadConversationHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(item =>
                    item &&
                    (item.role === 'user' || item.role === 'assistant') &&
                    typeof item.content === 'string' &&
                    item.content.trim().length > 0
                )
                .slice(-30);
        } catch (error) {
            console.warn('Failed to load chat history:', error);
            return [];
        }
    }

    function saveConversationHistory() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-30)));
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }

    function restoreConversationHistory() {
        const saved = loadConversationHistory();
        if (saved.length > 0) {
            saved.forEach(item => {
                conversationHistory.push(item);
                addMessage(item.content, item.role === 'assistant' ? 'bot' : 'user', '', false);
            });
            return;
        }

        conversationHistory.push({ role: 'assistant', content: initialBotMessage });
        addMessage(initialBotMessage, 'bot', '', false);
        saveConversationHistory();
    }

    // 채팅 토글 기능
    let isChatOpen = false;
    chatWidget.classList.remove('is-open');
    chatToggle.textContent = '+';

    function setChatOpen(open) {
        isChatOpen = open;
        chatWidget.classList.toggle('is-open', open);
        chatToggle.textContent = open ? '−' : '+';

        if (open) {
            // 애니메이션 프레임 이후 스크롤 보정
            window.requestAnimationFrame(scrollToBottom);
        }
    }

    chatToggle.addEventListener('click', function() {
        setChatOpen(!isChatOpen);
    });

    // 메시지 전송 함수
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;

        // 사용자 메시지 추가
        addMessage(message, 'user');
        
        // 입력 필드 초기화 및 비활성화
        userInput.value = '';
        userInput.disabled = true;
        
        try {
            // 챗봇 응답 생성 및 추가
            const botResponse = await getBotResponse(message);
            addMessage(botResponse, 'bot');
        } catch (error) {
            console.error('Error in sendMessage:', error);
            addMessage('응답을 처리하는 중 오류가 발생했습니다.', 'bot');
        } finally {
            // 입력 필드 다시 활성화
            userInput.disabled = false;
            userInput.focus();
        }
    }

    function appendTextWithLinks(container, text) {
        const urlRegex = /(https?:\/\/[^\s<>()"'`\[\]{}|\\^]+(?:\([^\s<>()"'`\[\]{}|\\^]*\))*[^\s<>()"'`\[\]{}|\\^.,;:!?])/g;
        let lastIndex = 0;
        let match;

        while ((match = urlRegex.exec(text)) !== null) {
            const startIndex = match.index;
            const endIndex = startIndex + match[0].length;

            if (startIndex > lastIndex) {
                container.appendChild(document.createTextNode(text.slice(lastIndex, startIndex)));
            }

            const link = document.createElement('a');
            link.href = match[0];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.style.color = '#007bff';
            link.style.textDecoration = 'underline';
            link.style.transition = 'opacity 0.2s';
            link.textContent = match[0];
            link.addEventListener('mouseover', () => {
                link.style.opacity = '0.8';
            });
            link.addEventListener('mouseout', () => {
                link.style.opacity = '1';
            });
            container.appendChild(link);

            lastIndex = endIndex;
        }

        if (lastIndex < text.length) {
            container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
    }

    // 메시지 추가 함수
    function addMessage(text, sender, messageId = '', trackHistory = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (messageId) {
            messageDiv.id = messageId;
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const normalizedText = typeof text === 'string' ? text : String(text ?? '');
        const lines = normalizedText.split('\n');
        lines.forEach((line, index) => {
            appendTextWithLinks(contentDiv, line);
            if (index < lines.length - 1) {
                contentDiv.appendChild(document.createElement('br'));
            }
        });

        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        
        // 메시지가 추가된 후 스크롤을 아래로 이동
        scrollToBottom();

        if (trackHistory) {
            if (sender === 'user') {
                conversationHistory.push({ role: 'user', content: text });
            } else if (sender === 'bot') {
                conversationHistory.push({ role: 'assistant', content: text });
            }
            // Keep only recent history for request payload size.
            if (conversationHistory.length > 30) {
                conversationHistory.splice(0, conversationHistory.length - 30);
            }
            saveConversationHistory();
        }
        
        return messageDiv;
    }

    // 스크롤을 가장 아래로 이동하는 함수
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // GPT API를 호출하여 챗봇 응답 생성
    async function getBotResponse(userMessage) {
        let loadingMessage = null;
        let loadingAnimationIntervalId = null;

        const startLoadingAnimation = function () {
            const loadingMessageId = 'loading-' + Date.now();
            loadingMessage = addMessage('.', 'bot', loadingMessageId, false);

            if (!loadingMessage) {
                return;
            }

            const loadingContent = loadingMessage.querySelector('.message-content');
            let dotCount = 1;

            loadingAnimationIntervalId = window.setInterval(function () {
                if (!loadingContent) {
                    return;
                }

                dotCount = (dotCount % 3) + 1;
                loadingContent.textContent = '.'.repeat(dotCount);
            }, 300);
        };

        const stopLoadingAnimation = function () {
            if (loadingAnimationIntervalId !== null) {
                window.clearInterval(loadingAnimationIntervalId);
                loadingAnimationIntervalId = null;
            }

            if (loadingMessage) {
                loadingMessage.remove();
                loadingMessage = null;
            }
        };

        try {
            // 로딩 메시지 표시
            startLoadingAnimation();
            
            // CSRF 토큰 가져오기
            const csrfToken = getCSRFToken();
            if (!csrfToken) {
                console.error('CSRF token not found');
                return '오류: CSRF 토큰을 찾을 수 없습니다. 페이지를 새로고침 해주세요.';
            }

            // GPT API 호출
            const response = await fetch('/api/chat/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({
                    message: userMessage,
                    history: conversationHistory.slice(-20)
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Error:', response.status, errorData);
                throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();

            if (data.error) {
                console.error('Error from server:', data.error);
                return '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
            }
            
            return data.response || '죄송합니다. 응답을 처리하는 중 오류가 발생했습니다.';
            
        } catch (error) {
            console.error('Error calling GPT API:', error);
            return '죄송합니다. 서버와의 통신 중 오류가 발생했습니다.';
        } finally {
            stopLoadingAnimation();
        }
    }
    
    // CSRF 토큰을 가져오는 헬퍼 함수
    function getCSRFToken() {
        // 메타 태그에서 CSRF 토큰 가져오기
        const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfTokenMeta) {
            return csrfTokenMeta.getAttribute('content');
        }
        
        // 메타 태그가 없을 경우 쿠키에서 가져오기 (백업)
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    // 이벤트 리스너 등록
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // 저장된 대화 복원
    restoreConversationHistory();

    // 채팅창이 닫힌 상태로 시작
});
