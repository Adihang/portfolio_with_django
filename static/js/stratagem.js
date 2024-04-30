async function playSound(soundURL) {
    const soundEffect = new Audio(soundURL);
    await soundEffect.play();
}

function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]').getAttribute('content');
}

document.addEventListener('DOMContentLoaded', function() {
    const scoreboard = document.querySelector('.stratagem_scoreboard');
    scoreboard.style.display = 'none';
    //스트라타잼 아이콘 생성
    const stratagem_commands = document.querySelectorAll('.stratagem_command');
    stratagem_commands.forEach(function(commandDiv) {
        const commandNumber = commandDiv.dataset.command;
        commandNumber.toString().split('').forEach(function(digit, index) {
            const img = document.createElement('img');
            const id = `${index}`; // ID 생성
            img.src = `/media/icon/arrow${digit}.png`;
            img.alt = `arrow ${digit}`;
            img.classList.add('commend_arrow');
            img.setAttribute('id', id); // ID 설정
            commandDiv.appendChild(img);
        });
    });

    //터치키
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
    function simulateKeyEvent(key) {
        document.dispatchEvent(new KeyboardEvent('keydown', {'key': key}));
    }

    //input_score_button
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

//키입력받고 게임 알고리즘 실행
document.addEventListener('keydown', async function(event) {
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
                    playSound('/media/mp3/stratagem/stratagem4.mp3')
                }
            });
            // 모든 카드가 숨겨진 상태인지 확인하고, 그렇다면 typecommand를 빈 문자열로 설정합니다.
            if (allCardsHidden) { // 변수 이름 수정
                const randomOption = Math.floor(Math.random() * 2);
                if (randomOption === 0) {
                    playSound('/media/mp3/stratagem/stratagem2.mp3')
                } else {
                    playSound('/media/mp3/stratagem/stratagem3.mp3')
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
            await playSound('/media/mp3/stratagem/stratagem1.mp3')
        }
        if (typecommand != ""){
            find_remove_cards.forEach(function(card) {
                const commandDiv = card.querySelector('.stratagem_command');
                const command = commandDiv.dataset.command;
                if (typecommand == command) {
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

