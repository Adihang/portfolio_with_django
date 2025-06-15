document.addEventListener('DOMContentLoaded', function() {
    // 채팅 위젯 요소 생성
    const chatWidget = document.createElement('div');
    chatWidget.className = 'chat-widget';
    chatWidget.innerHTML = `
        <div class="chat-header">
            <h3>챗봇과 대화하기</h3>
            <button class="chat-toggle">−</button>
        </div>
        <div class="chat-body">
            <div class="chat-messages" id="chat-messages">
                <div class="message bot">
                    <div class="message-content">
                        안녕하세요! 궁금하신 점이 있으시면 언제든지 물어보세요.
                    </div>
                </div>
            </div>
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

    // 채팅 토글 기능
    let isChatOpen = false;
    chatBody.style.display = 'none'; // 초기 상태에서 채팅 본문 숨기기
    chatToggle.textContent = '+'; // 토글 버튼을 '+'로 설정
    chatToggle.addEventListener('click', function() {
        isChatOpen = !isChatOpen;
        if (isChatOpen) {
            chatBody.style.display = 'flex';
            chatToggle.textContent = '−';
            // 채팅창이 열릴 때 메시지 영역 스크롤을 가장 아래로
            scrollToBottom();
        } else {
            chatBody.style.display = 'none';
            chatToggle.textContent = '+';
        }
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

    // 메시지 추가 함수
    function addMessage(text, sender, messageId = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        if (messageId) {
            messageDiv.id = messageId;
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // 메시지에 URL이 포함되어 있으면 클릭 가능한 링크로 변환
        // URL 패턴: http(s)://로 시작하고, 공백이나 괄호, 따옴표, <> 등이 아닌 문자들로 구성
        const urlRegex = /(https?:\/\/[^\s<>()"'`\[\]{}|\\^]+(?:\([^\s<>()"'`\[\]{}|\\^]*\))*[^\s<>()"'`\[\]{}|\\^.,;:!?])/g;
        let html = text;
        
        // URL을 <a> 태그로 변환
        html = html.replace(urlRegex, function(url) {
            // URL이 이미 <a> 태그로 감싸져 있는지 확인
            if (!/^<a\s/i.test(url)) {
                // URL이 )로 끝나면 제거 (닫는 괄호가 URL에 속하지 않는 경우)
                let cleanUrl = url;
                if (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
                    cleanUrl = url.slice(0, -1);
                    html = cleanUrl + ')' + html.substring(html.indexOf(url) + url.length);
                }
                return '<a href="' + cleanUrl + '" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">' + cleanUrl + '</a>';
            }
            return url;
        });
        
        // 줄바꿈을 <br> 태그로 변환
        html = html.replace(/\n/g, '<br>');
        
        contentDiv.innerHTML = html;
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        
        // 링크에 호버 효과 추가
        const links = messageDiv.getElementsByTagName('a');
        for (let link of links) {
            link.style.color = '#007bff';
            link.style.textDecoration = 'underline';
            link.style.transition = 'opacity 0.2s';
            link.addEventListener('mouseover', () => {
                link.style.opacity = '0.8';
            });
            link.addEventListener('mouseout', () => {
                link.style.opacity = '1';
            });
        }
        
        // 메시지가 추가된 후 스크롤을 아래로 이동
        scrollToBottom();
        
        return messageDiv;
    }

    // 스크롤을 가장 아래로 이동하는 함수
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // GPT API를 호출하여 챗봇 응답 생성
    async function getBotResponse(userMessage) {
        try {
            // 로딩 메시지 표시
            const loadingMessageId = 'loading-' + Date.now();
            addMessage('...', 'bot', loadingMessageId);
            
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
                body: JSON.stringify({ message: userMessage })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API Error:', response.status, errorData);
                throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // 로딩 메시지 제거
            const loadingMessage = document.getElementById(loadingMessageId);
            if (loadingMessage) {
                loadingMessage.remove();
            }
            
            if (data.error) {
                console.error('Error from server:', data.error);
                return '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
            }
            
            return data.response || '죄송합니다. 응답을 처리하는 중 오류가 발생했습니다.';
            
        } catch (error) {
            console.error('Error calling GPT API:', error);
            return '죄송합니다. 서버와의 통신 중 오류가 발생했습니다.';
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

    // 채팅창이 닫힌 상태로 시작
});
