document.addEventListener('DOMContentLoaded', function() {
    //스트라타잼 아이콘 생성
    const stratagem_commands = document.querySelectorAll('.stratagem_command');
    stratagem_commands.forEach(function(commandDiv) {
        const commandNumber = commandDiv.dataset.command;
        commandNumber.toString().split('').forEach(function(digit, index) {
            const img = document.createElement('img');
            const id = `${index}`; // ID 생성
            img.src = `/media/icons/arrow${digit}.png`;
            img.alt = `arrow ${digit}`;
            img.setAttribute('id', id); // ID 설정
            commandDiv.appendChild(img);
        });
    });


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
});

let typecommand = "";
document.addEventListener('keydown', function(event) {
    const key = event.key; // 이벤트에서 키 값을 가져옵니다.
    
    switch (key) {
        case 'ArrowLeft':
            typecommand += "1"
            console.log(typecommand);
            break;
        case 'ArrowUp':
            typecommand += "5"
            console.log(typecommand);
            break;
        case 'ArrowRight':
            typecommand += "3"
            console.log(typecommand);
            break;
        case 'ArrowDown':
            typecommand += "2"
            console.log(typecommand);
            break;
        default:
            typecommand = ""
            console.log(typecommand);
    }
    const stratagem_cards = document.querySelectorAll('.stratagem_card');
    let allCardsHidden = true; // 변수 이름 수정
    if (typecommand != ""){
        stratagem_cards.forEach(function(card) {
            const commandDiv = card.querySelector('.stratagem_command');
            const command = commandDiv.dataset.command;
        
            if (!command.startsWith(typecommand)) {
                card.style.display = 'none';
            } else {
                allCardsHidden = false;
            }
        });
        // 모든 카드가 숨겨진 상태인지 확인하고, 그렇다면 typecommand를 빈 문자열로 설정합니다.
        if (allCardsHidden) { // 변수 이름 수정
            typecommand = "";
            stratagem_cards.forEach(function(card) {
                card.style.display = ''; // 모든 카드를 다시 보이게 만듭니다.
            });
        }
    }
    const imgs = document.querySelectorAll('img');
    const typecommandLength = typecommand.length;
    imgs.forEach(function(img) {
        const id = parseInt(img.id); // 이미지의 id를 정수형으로 변환
        // typecommand가 해당 이미지의 id보다 작거나 같을 때,
        // 즉, typecommand가 1자리 이상이면서 해당 이미지에 반전을 적용할 때
        if (typecommandLength-1 >= id) {
            // 이미지 색상 반전
            img.style.filter = 'invert(70%)';
        } else {
            // 이미지 색상 원래대로 복구
            img.style.filter = 'none';
        }
    });

});