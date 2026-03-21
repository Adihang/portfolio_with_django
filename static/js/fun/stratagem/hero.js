// Stratagem Hero game page script. It handles command matching, scoring flow, and simple sound playback.
// 사운드를 재생하는 비동기 함수
async function playSound(soundURL) {
    const soundEffect = new Audio(soundURL);
    await soundEffect.play();
}

// CSRF 토큰을 가져오는 함수
function getCSRFToken() {
    // 점수 저장도 일반 Django POST 엔드포인트를 쓰므로 CSRF 토큰을 그대로 사용한다.
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}

// DOM이 로드되었을 때 실행되는 초기화 함수
document.addEventListener('DOMContentLoaded', function() {
    //스트라타잼 아이콘 생성
    const stratagem_commands = document.querySelectorAll('.stratagem_command');
    stratagem_commands.forEach(function(commandDiv) {
        const commandNumber = commandDiv.dataset.command;
        commandNumber.toString().split('').forEach(function(digit, index) {
            const img = document.createElement('img');
            const id = `${index}`; // ID 생성
            img.src = `/static/media/icon/arrow${digit}.png`;
            img.alt = `arrow ${digit}`;
            img.classList.add('commend_arrow');
            img.setAttribute('id', id); // ID 설정
            commandDiv.appendChild(img);
        });
    });

    // 모바일/터치 환경에서는 화면 버튼을 같은 키 입력 흐름으로 연결한다.
    const arrowTop = document.querySelector('.arrow-top');
    const arrowBottom = document.querySelector('.arrow-bottom');
    const arrowLeft = document.querySelector('.arrow-left');
    const arrowRight = document.querySelector('.arrow-right');
    arrowTop.addEventListener('click', function() {
        simulateKeyEvent('ArrowUp');
    });

    arrowBottom.addEventListener('click', function() {
        simulateKeyEvent('ArrowDown');
    });

    arrowLeft.addEventListener('click', function() {
        simulateKeyEvent('ArrowLeft');
    });

    arrowRight.addEventListener('click', function() {
        simulateKeyEvent('ArrowRight');
    });
    // 키보드 이벤트를 시뮬레이션하는 함수
    function simulateKeyEvent(key) {
        // 모바일 화살표 버튼도 동일한 keydown 루프로 흘려보내 게임 규칙을 한 경로만 유지한다.
        document.dispatchEvent(new KeyboardEvent('keydown', {'key': key}));
    }

    // 게임 종료 후 점수 저장 버튼은 현재 초 기록을 서버에 제출한 뒤 scoreboard로 이동한다.
    var input_score_button = document.getElementById('input_score_button');
    if (input_score_button) {
        input_score_button.addEventListener('click', ()=>{
            const textInputValue = document.getElementById('input_score_name').value;
            const checkboxIsChecked = document.getElementById('input_score_checkbox').checked;
            if (textInputValue.length > 0){
                fetch('add_score/', { // Django URL 경로에 맞게 수정하세요.
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCSRFToken()
                    },
                    body: JSON.stringify({ name: textInputValue, score: seconds })
                }).then(response => response.json())
                .then(data => {
                    console.log('Success:', data);
                })
                .catch((error) => {
                    console.error('Error:', error);
                });
            }
            location.href = 'Scoreboard/';
        });
    } else {
        console.log('Input score button not found');
    }
});

let typecommand = "";
let soundSelect;
let startTime;
let allCardsHidden;
let seconds;

// Main game loop: each key narrows the visible cards until one exact stratagem sequence matches.
document.addEventListener('keydown', async function(event) {
    // 현재 입력 문자열과 카드 명령 prefix를 비교해 후보 카드를 좁혀 나간다.
    const find_remove_cards = document.querySelectorAll('.stratagem_card');
    if (find_remove_cards.length != 0)
    {
        soundSelect = 0;
        allCardsHidden = true
        if ((find_remove_cards.length == 10) && (typecommand == "")) {
            startTime = performance.now();
            console.log(startTime);
        }
        const key = event.key; // 이벤트에서 키 값을 가져옵니다.
        switch (key) {
            case 'ArrowLeft':
                typecommand += "1"
                break;
            case 'ArrowUp':
                typecommand += "5"
                break;
            case 'ArrowRight':
                typecommand += "3"
                break;
            case 'ArrowDown':
                typecommand += "2"
                break;
            case 'a':
                typecommand += "1"
                break;
            case 'w':
                typecommand += "5"
                break;
            case 'd':
                typecommand += "3"
                break;
            case 's':
                typecommand += "2"
                break;
            default:
                typecommand = ""
        }
        const stratagem_cards = document.querySelectorAll('.stratagem_card');
        if (typecommand != ""){
            stratagem_cards.forEach(function(card) {
                const commandDiv = card.querySelector('.stratagem_command');
                const command = commandDiv.dataset.command;
                if (!command.startsWith(typecommand)) {
                    if(typecommand.slice(0, -1) != command){
                        card.style.display = 'none';
                    }
                } else {
                    allCardsHidden = false;
                    soundSelect = 1;
                }
                if (typecommand == command) {
                    playSound('/static/media/mp3/stratagem/stratagem4.mp3')
                }
            });
            // 모든 카드가 숨겨진 상태인지 확인하고, 그렇다면 typecommand를 빈 문자열로 설정합니다.
            if (allCardsHidden) { // 변수 이름 수정
                // 잘못된 입력이면 현재 시도를 초기화하고 모든 카드를 다시 보여 준다.
                const randomOption = Math.floor(Math.random() * 2);
                if (randomOption === 0) {
                    playSound('/static/media/mp3/stratagem/stratagem2.mp3')
                } else {
                    playSound('/static/media/mp3/stratagem/stratagem3.mp3')
                }
                typecommand = "";
                const imgss = document.querySelectorAll('img');
                imgss.forEach(function(img) {
                    img.style.filter = 'none';
                });
                stratagem_cards.forEach(function(card) {
                    card.style.display = ''; // 모든 카드를 다시 보이게 만듭니다.
                });
            }
        }
        const imgs = document.querySelectorAll('img');
        const typecommandLength = typecommand.length;
        imgs.forEach(function(img) {
            const id = parseInt(img.id);
            if (typecommandLength-1 >= id) {
                // 이미지 색상 반전
                img.style.filter = 'sepia(100%)';
            } 
        });
        if (soundSelect == 1)
        {
            await playSound('/static/media/mp3/stratagem/stratagem1.mp3')
        }
        if (typecommand != ""){
            find_remove_cards.forEach(function(card) {
                const commandDiv = card.querySelector('.stratagem_command');
                const command = commandDiv.dataset.command;
                if (typecommand == command) {
                    // 정답 카드는 잠깐 효과음을 보여준 뒤 제거해서 다음 카드로 진행한다.
                    setTimeout(function() {
                        card.remove();
                        imgs.forEach(function(img) {
                            img.style.filter = 'none';
                        });
                        stratagem_cards.forEach(function(card) {
                            card.style.display = ''; // 모든 카드를 다시 보이게 만듭니다.
                        });
                        typecommand = "";
                    }, 500);
                }
            });
        }
        setTimeout(function() {
            const final_cards = document.querySelectorAll('.stratagem_card');
            if (final_cards.length == 0) {
                // 마지막 카드가 사라지는 시점을 기준으로 전체 기록 시간을 계산한다.
                const endTime = performance.now();
                const executionTime = endTime - startTime;
                seconds = (executionTime / 1000).toFixed(2);
                const timer = document.querySelector('.score_time');
                timer.textContent = seconds + '초';

                //도움말 표시 비활성화
                const discription = document.querySelector('.discription');
                discription.style.display = 'none';

                //점수창 표시 활성화
                const score = document.querySelector('.stratagem_score');
                score.style.display = 'flex';
            }
        }, 501);
    }
});
