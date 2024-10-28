document.addEventListener('DOMContentLoaded', function() {
    console.log('구경4넴');

    // main_text 클래스의 모든 요소를 선택합니다.
    const mainTextElements = document.querySelectorAll('.main_text');
    
    let ico = "";
    let jackpot_num = 0;
    // 각 main_text 요소에 클릭 이벤트 리스너를 추가합니다.
    mainTextElements.forEach(element => {
        element.addEventListener('click', (event) => {
            // 클릭된 요소의 id를 가져옵니다.
            const clickedId = event.target.id;
            const select_team = document.querySelector('.select_team');
            const select_ico = document.querySelector('.select_ico');
            const select_num = document.querySelector('.select_num');
            const select_bool = document.querySelector('.select_bool');
            const description = document.querySelector('.description');
            const mainTitle = document.getElementById('main_title1');
            const mainTitle2 = document.getElementById('main_title2');
            // 클릭된 요소의 id에 따라 다른 동작을 수행합니다.
            if (clickedId === 'team_out') {
                select_team.style.display = 'none';
                console.log('외부조');
                mainTitle.textContent = '외부조 계산기로 이동합니다.';
                setTimeout(function() {
                    window.location.href = 'https://verity.d2atlas.com/';
                }, 500);
            } else if (clickedId === 'team_in') {
                select_team.style.display = 'none';
                console.log('내부조');
                mainTitle.textContent = '내 동상의 문양은?';
                select_ico.style.display = 'flex';


            } else if (clickedId === 'ico_t') {
                mainTitle.textContent = '잭팟인 팀원의 숫자는?';
                ico = "t";
                select_ico.style.display = 'none';
                select_num.style.display = 'flex';
                description.style.display = 'flex';
                console.log('세모');
            } else if (clickedId === 'ico_s') {
                mainTitle.textContent = '잭팟인 팀원의 숫자는?';
                ico = "s";
                select_ico.style.display = 'none';
                select_num.style.display = 'flex';
                description.style.display = 'flex';
                console.log('네모');
            } else if (clickedId === 'ico_r') {
                mainTitle.textContent = '잭팟인 팀원의 숫자는?';
                ico = "r";
                select_ico.style.display = 'none';
                select_num.style.display = 'flex';
                description.style.display = 'flex';
                console.log('동그라미');


            } else if (clickedId === 'zero') {
                if(ico == "t"){
                    mainTitle.textContent = '△ □ 일때는 ○ 에게 모두 전달';
                    mainTitle2.textContent= '△ ○ 일때는 □ 에게 모두 전달';
                } else if(ico == "s"){
                    mainTitle.textContent = '□ △ 일때는 ○ 에게 모두 전달';
                    mainTitle2.textContent= '□ ○ 일때는 △ 에게 모두 전달';
                } else if(ico == "r"){
                    mainTitle.textContent = '○ △ 일때는 □ 에게 모두 전달';
                    mainTitle2.textContent= '○ □ 일때는 △ 에게 모두 전달';
                }
                jackpot_num = 0;
                select_num.style.display = 'none';
                description.style.display = 'none';
                console.log('zero');
            } else if (clickedId === 'one') {
                mainTitle.textContent = '나는 잭팟인가요?';
                jackpot_num = 1;
                select_num.style.display = 'none';
                select_bool.style.display = 'flex';
                console.log('one');
            } else if (clickedId === 'three') {
                mainTitle.textContent = '문양을 다른 팀원에게 하나씩 나누어 전달';
                jackpot_num = 3;
                select_num.style.display = 'none';
                description.style.display = 'none';
                console.log('three');


            } else if (clickedId === 'yes') {
                mainTitle.textContent = '문양을 다른 팀원에게 하나씩 나누어 전달';
                select_bool.style.display = 'none';
                description.style.display = 'none';
                console.log('네');
            } else if (clickedId === 'no') {
                mainTitle2.textContent= '나머지 하나를 잭팟인 팀원에게 전달';
                if(ico == "t"){
                    mainTitle.textContent = '△를 잭팟이 아닌 팀원에게,';
                } else if(ico == "s"){
                    mainTitle.textContent = '□를 잭팟이 아닌 팀원에게,';
                } else if(ico == "r"){
                    mainTitle.textContent = '○를 잭팟이 아닌 팀원에게,';
                }
                select_bool.style.display = 'none';
                description.style.display = 'none';
                console.log('아니오');
            }
        });
    });
});
